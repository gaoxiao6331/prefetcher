import type { Page } from "puppeteer";
import { isDebugMode } from "@/utils/is";
import { Semaphore } from "@/utils/semaphore";
import { bindAsyncContext } from "@/utils/trace-context";
import type { CapturedResource, GenerateContext } from "../type";
import AllJsService from "./all-js-service";

declare global {
	interface Window {
		__prefetcherLcp?: number | null;
		__prefetcherLcpError?: unknown;
	}
}

/**
 * LCP Impact Evaluation Service
 * Simulates page loading via Puppeteer to measure the impact of specific resource delay on LCP
 */
export class LcpImpactEvaluationService extends AllJsService {
	/** LCP impact threshold: if delayed resource causes LCP to increase significantly */
	private static readonly LCP_IMPACT_THRESHOLD_MS = 10_000;

	/** Proximity ratio to consider a resource critical (90% of threshold) */
	private static readonly CRITICAL_PROXIMITY_RATIO = 0.9;

	/** Maximum concurrent LCP evaluation tasks
	 * 	⚠️ Opening multiple tabs will cause LCP calculation to be suspended for background (non-visible) tabs
	 */
	private static readonly MAX_CONCURRENT_EVALUATIONS = 1;

	/** Timeout for page navigation (3x Threshold to allow for delay + normal loading) */
	private static readonly PAGE_GOTO_TIMEOUT_MS =
		LcpImpactEvaluationService.LCP_IMPACT_THRESHOLD_MS * 3;

	/** Maximum time to wait for LCP value from observer */
	private static readonly LCP_CHECK_TIMEOUT_MS = 10_000;

	/** Small delay after LCP detected to ensure all buffer entries are processed */
	private static readonly FINAL_BUFFER_WAIT_MS = 500;

	/**
	 * Filter resources: only keep critical resources that have a significant impact on LCP
	 * @param ctx Generation context
	 */
	protected override async filter(
		ctx: GenerateContext,
	): Promise<GenerateContext> {
		const resources = ctx.capturedResources;

		this.log.debug(`[LCP] base resources: ${JSON.stringify(ctx)}`);

		// Return early if no resources were captured
		if (!resources.length) {
			return ctx;
		}

		// Use semaphore to control concurrency and avoid high load from too many browser instances
		const validationSemaphore = new Semaphore(
			LcpImpactEvaluationService.MAX_CONCURRENT_EVALUATIONS,
		);

		// Evaluate impact for each resource concurrently
		const tasks = resources.map((resource: CapturedResource) =>
			validationSemaphore.run(async () => {
				try {
					// Skip impact evaluation for the main document itself
					if (resource.url === ctx.url) {
						this.log.debug(
							`[LCP] Skipping impact evaluation for main document: ${resource.url}`,
						);
						return true;
					}

					// Simulate delayed loading of the current resource and measure new LCP
					const impactedLcp = await this.measureLcpInternal(
						ctx.url,
						resource.url,
					);

					if (impactedLcp == null) {
						this.log.warn(
							`[LCP] Failed to measure LCP with delayed resource: ${resource.url}. This usually means the resource is critical and its delay blocked all meaningful paints. Treating as critical.`,
						);
						return true; // Treat as critical on measurement failure
					}

					// If LCP is close to or exceeds the threshold after delaying the resource, it is considered critical.
					// We use 0.9 as the "proximity" ratio (90% of the threshold).
					const isCritical =
						impactedLcp >=
						LcpImpactEvaluationService.LCP_IMPACT_THRESHOLD_MS *
							LcpImpactEvaluationService.CRITICAL_PROXIMITY_RATIO;

					this.log.info(
						`[LCP] Resource: ${resource.url}, Impacted LCP: ${impactedLcp}ms, Critical: ${isCritical}`,
					);

					return isCritical;
				} catch (err) {
					this.log.error(
						err,
						`[LCP] Error during impact evaluation for resource: ${resource.url}`,
					);
					return true; // Treat as critical on error
				}
			}),
		);

		const validationResults = await Promise.all(tasks);
		// Only keep resources identified as critical
		const criticalResources = resources.filter(
			(_, index) => validationResults[index],
		);

		return {
			...ctx,
			capturedResources: criticalResources,
		};
	}

	/**
	 * Internal common LCP measurement logic
	 * @param url Page URL
	 * @param delayResourceUrl Optional: URL of the resource to simulate delayed loading
	 */
	protected async measureLcpInternal(
		url: string,
		delayResourceUrl?: string,
	): Promise<number | null> {
		const pageObj = await this.getPage();
		const page = pageObj.page as Page;

		// Ensure page is active to get LCP
		await page.bringToFront();

		// Disable cache to ensure resources are actually requested and intercepted
		await page.setCacheEnabled(false);

		const normalizedDelayUrl = delayResourceUrl
			? this.normalizeUrl(delayResourceUrl)
			: undefined;

		if (normalizedDelayUrl) {
			await this.setupDelayInterception(page, normalizedDelayUrl);
		}

		// Inject LCP observation script before page load
		await this.setupLcpObserver(page);

		try {
			this.log.debug(
				`[LCP] Navigating to ${url}${delayResourceUrl ? ` with delay on ${delayResourceUrl}` : ""}`,
			);

			// Navigate to the target page and wait for network idle
			// networkidle0 will naturally wait for the delayed resource to finish
			await page.goto(url, {
				waitUntil: "networkidle0",
				timeout: LcpImpactEvaluationService.PAGE_GOTO_TIMEOUT_MS,
			});

			this.log.debug(
				`[LCP] Page goto ready for ${url}. DelayResource: ${delayResourceUrl || "none"}`,
			);

			// Wait for LCP value to be set by the observer
			try {
				await page.waitForFunction(LcpImpactEvaluationService._checkLcpStatus, {
					timeout: LcpImpactEvaluationService.LCP_CHECK_TIMEOUT_MS,
				});
				this.log.debug(`[LCP] LCP value detected in window.__prefetcherLcp`);
			} catch {
				this.log.debug(
					`[LCP] Timeout waiting for LCP value in window.__prefetcherLcp`,
				);
			}

			// Give the browser a tiny bit more time to ensure all entries are in the buffer
			await new Promise((resolve) =>
				setTimeout(resolve, LcpImpactEvaluationService.FINAL_BUFFER_WAIT_MS),
			);

			const lcpResult = await page.evaluate(
				LcpImpactEvaluationService._getLcpResult,
			);

			this.log.debug(
				`[LCP] Measurement details for ${url}: ${JSON.stringify(lcpResult)}`,
			);

			const finalLcp = lcpResult.lcp;

			this.log.info(
				`[LCP] Final LCP for ${url} (delay: ${delayResourceUrl || "none"}): ${finalLcp}ms`,
			);

			if (lcpResult.error) {
				this.log.error(
					`[LCP] Browser-side error during LCP observation: ${lcpResult.error}`,
				);
			}

			return typeof finalLcp === "number" ? finalLcp : null;
		} catch (error) {
			this.log.error(error, `[LCP] Failed to navigate to page: ${url}`);
			return null;
		} finally {
			if (isDebugMode()) {
				this.log.debug(`[LCP] Debug mode: keeping page open for ${url}`);
			} else {
				await pageObj[Symbol.asyncDispose]();
			}
		}
	}

	/**
	 * Set up request interception to simulate delayed loading for a specific resource
	 * @param page Puppeteer page instance
	 * @param resourceUrl URL of the resource to delay
	 */
	private async setupDelayInterception(page: Page, resourceUrl: string) {
		try {
			await page.setRequestInterception(true);

			const normalizedTargetUrl = this.normalizeUrl(resourceUrl);

			page.on(
				"request",
				bindAsyncContext((req) => {
					try {
						if (req.isInterceptResolutionHandled()) return;

						const currentUrl = this.normalizeUrl(req.url());
						if (currentUrl === normalizedTargetUrl) {
							this.log.debug(
								`[LCP] Delaying resource: ${req.url()} (type: ${req.resourceType()}) for ${LcpImpactEvaluationService.LCP_IMPACT_THRESHOLD_MS}ms`,
							);
							// Delay and then release if it's the target resource
							setTimeout(() => {
								if (req.isInterceptResolutionHandled()) {
									this.log.debug(
										`[LCP] Request already handled, skipping continue: ${req.url()}`,
									);
									return;
								}
								this.log.debug(
									`[LCP] Releasing delayed resource: ${req.url()}`,
								);
								req.continue().catch((err: Error) => {
									this.log.warn(
										`[LCP] Request handling failed for delayed resource: ${err.message} (${req.url()})`,
									);
								});
							}, LcpImpactEvaluationService.LCP_IMPACT_THRESHOLD_MS);
						} else {
							// Continue other resources normally
							req.continue().catch(() => {
								// Silent catch for other resources as it's common for them to be handled/aborted
							});
						}
					} catch (err) {
						this.log.warn(`[LCP] Request listener error: ${err}`);
					}
				}),
			);

			// Monitor responses to catch errors
			page.on(
				"response",
				bindAsyncContext((res) => {
					if (res.status() >= 400) {
						this.log.warn(
							`[LCP] Browser resource error: ${res.status()} ${res.url()} (Type: ${res.request().resourceType()})`,
						);
					}
				}),
			);
		} catch (error) {
			this.log.warn(error, "[LCP] Failed to set up delay interception");
		}
	}

	/**
	 * Inject PerformanceObserver into the page to monitor LCP in real-time
	 * @param page Puppeteer page instance
	 */
	private async setupLcpObserver(page: Page) {
		try {
			await page.evaluateOnNewDocument(
				LcpImpactEvaluationService._setupLcpObserverInBrowser,
			);
		} catch (err) {
			this.log.warn(err, "[LCP] Failed to set up LCP observer");
		}
	}

	/**
	 * Browser-side function to check if LCP value is available
	 */
	protected static _checkLcpStatus() {
		return window.__prefetcherLcp !== null || !!window.__prefetcherLcpError;
	}

	/**
	 * Browser-side function to retrieve LCP result
	 */
	protected static _getLcpResult() {
		return {
			lcp: window.__prefetcherLcp,
			error: window.__prefetcherLcpError
				? String(window.__prefetcherLcpError)
				: null,
		};
	}

	/**
	 * Browser-side function to set up PerformanceObserver for LCP
	 */
	protected static _setupLcpObserverInBrowser() {
		try {
			window.__prefetcherLcp = null;

			if (
				!window.PerformanceObserver ||
				!PerformanceObserver.supportedEntryTypes ||
				!PerformanceObserver.supportedEntryTypes.includes(
					"largest-contentful-paint",
				)
			) {
				return;
			}

			// Create PerformanceObserver to listen for largest-contentful-paint events
			const observer = new PerformanceObserver((entryList) => {
				const entries = entryList.getEntries();
				const last = entries[entries.length - 1] as LargestContentfulPaint;
				if (last) {
					const value = last.renderTime || last.startTime;
					if (typeof value === "number") {
						// Record the latest LCP time
						window.__prefetcherLcp = value;
					}
				}
			});

			// Use modern 'type' API with 'buffered' flag for accurate measurement
			observer.observe({
				type: "largest-contentful-paint",
				buffered: true,
			});
		} catch (error) {
			// Record script execution error
			window.__prefetcherLcpError = error;
		}
	}

	/**
	 * Normalize URL by removing hash
	 * @param url URL to normalize
	 */
	private normalizeUrl(url: string): string {
		try {
			const parsed = new URL(url);
			parsed.hash = "";
			return parsed.toString();
		} catch {
			return url;
		}
	}
}

export default LcpImpactEvaluationService;
