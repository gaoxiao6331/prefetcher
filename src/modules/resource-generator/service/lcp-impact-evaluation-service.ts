import type { HTTPRequest, HTTPResponse, Page } from "puppeteer";
import { Semaphore } from "@/utils/semaphore";
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

	/** Maximum concurrent LCP evaluation tasks */
	private static readonly MAX_CONCURRENT_EVALUATIONS = 3;

	/** Timeout for resource load completion fallback (Threshold + 10s buffer) */
	private static readonly RESOURCE_LOAD_TIMEOUT_MS =
		LcpImpactEvaluationService.LCP_IMPACT_THRESHOLD_MS + 10_000;

	/** Timeout for page navigation (3x Threshold to allow for delay + normal loading) */
	private static readonly PAGE_GOTO_TIMEOUT_MS =
		LcpImpactEvaluationService.LCP_IMPACT_THRESHOLD_MS * 3;

	/** Wait time for browser to process rendering after resource load */
	private static readonly POST_LOAD_RENDER_WAIT_MS = 2_000;

	/**
	 * Filter resources: only keep critical resources that have a significant impact on LCP
	 * @param ctx Generation context
	 */
	protected override async filter(
		ctx: GenerateContext,
	): Promise<GenerateContext> {
		const baseCtx = ctx;
		const resources = baseCtx.capturedResources;

		// Return early if no resources were captured
		if (!resources.length) {
			return baseCtx;
		}

		// Use semaphore to control concurrency and avoid high load from too many browser instances
		const validationSemaphore = new Semaphore(
			LcpImpactEvaluationService.MAX_CONCURRENT_EVALUATIONS,
		);

		// 1. Evaluate impact for each resource concurrently
		const tasks = resources.map((resource: CapturedResource) =>
			validationSemaphore.run(async () => {
				try {
					// Skip impact evaluation for the main document itself
					if (resource.url === ctx.url) {
						this.log.debug(
							`[LCP] Skipping impact evaluation for main document: ${resource.url}`,
						);
						return false;
					}

					// Simulate delayed loading of the current resource and measure new LCP
					const impactedLcp = await this.measureLcpInternal(
						ctx.url,
						resource.url,
					);

					if (impactedLcp == null) {
						this.log.warn(
							`[LCP] Failed to measure LCP with delayed resource: ${resource.url}, treating as critical by default`,
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
			...baseCtx,
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
		// Use "await using" for automatic page resource disposal
		await using pageObj = await this.getPage();
		const page = pageObj.page as Page;

		// Used to ensure the delayed resource has actually finished loading
		let resourceFinishedPromise: Promise<boolean> = Promise.resolve(true);

		// Set up request interception if a resource to delay is specified
		if (delayResourceUrl) {
			await page.setRequestInterception(true);
			this.setupDelayInterception(page, delayResourceUrl);

			// Create a Promise to listen for the target resource's response completion or request failure
			resourceFinishedPromise = new Promise<boolean>((resolve) => {
				let timeoutId: NodeJS.Timeout | undefined;
				let finished = false;

				const finish = () => {
					if (finished) return;
					finished = true;

					if (timeoutId) {
						clearTimeout(timeoutId);
						timeoutId = undefined;
					}

					page.off("response", onResponse);
					page.off("requestfailed", onRequestFailed);
					resolve(true);
				};
				const onResponse = (res: HTTPResponse) => {
					if (res.url() === delayResourceUrl) finish();
				};
				const onRequestFailed = (req: HTTPRequest) => {
					if (req.url() === delayResourceUrl) finish();
				};
				page.on("response", onResponse);
				page.on("requestfailed", onRequestFailed);

				// 30s fallback to prevent hanging if the resource is never requested
				if (!finished) {
					timeoutId = setTimeout(
						finish,
						LcpImpactEvaluationService.RESOURCE_LOAD_TIMEOUT_MS,
					);
				}
			});
		}

		// Inject LCP observation script before page load
		await this.setupLcpObserver(page);

		try {
			// Navigate to the target page and wait for network idle
			// Note: networkidle2 allows up to 0 active connections. If we only delay 1 resource,
			// networkidle2 might trigger in 0.5s before our 10s delay finishes.
			await page.goto(url, {
				waitUntil: "networkidle0",
				timeout: LcpImpactEvaluationService.PAGE_GOTO_TIMEOUT_MS,
			});

			this.log.debug(`page goto ready time: ${Date()}`);

			if (delayResourceUrl) {
				// Core fix: explicitly wait for the resource to finish loading if it's being delayed
				// Otherwise, page.goto returns, the "await using" block ends, and the page closes,
				// preventing the resource from ever finishing.
				await resourceFinishedPromise;
				// Give the browser some extra time to handle rendering and LCP calculation after resource load
				await new Promise((resolve) =>
					setTimeout(
						resolve,
						LcpImpactEvaluationService.POST_LOAD_RENDER_WAIT_MS
					),
				);
			}
		} catch (error) {
			this.log.error(error, `[LCP] Failed to navigate to page: ${url}`);
			return null;
		}

		// Execute script in browser context to retrieve LCP value
		const lcp = await page.evaluate(function () {
			return window.__prefetcherLcp;
		});

		return typeof lcp === "number" ? lcp : null;
	}

	/**
	 * Set up request interception to simulate delayed loading for a specific resource
	 * @param page Puppeteer page instance
	 * @param resourceUrl URL of the resource to delay
	 */
	private setupDelayInterception(page: Page, resourceUrl: string) {
		try {
			page.on("request", (req) => {
				try {
					if (req.isInterceptResolutionHandled()) return;

					if (req.url() === resourceUrl) {
						// Delay and then release if it's the target resource
						setTimeout(() => {
							if (req.isInterceptResolutionHandled()) {
								return;
							}
							req.continue().catch((err: Error) => {
								this.log.warn(`[LCP] Request handling failed: ${err.message}`);
							});
						}, LcpImpactEvaluationService.LCP_IMPACT_THRESHOLD_MS);
					} else {
						// Continue other resources normally
						req.continue().catch((err: Error) => {
							this.log.warn(`[LCP] Request handling failed: ${err.message}`);
						});
					}
				} catch (err) {
					this.log.warn(`[LCP] Request handling failed: ${err}`);
				}
			});
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
			await page.evaluateOnNewDocument(() => {
				try {
					window.__prefetcherLcp = null;

					// Create PerformanceObserver to listen for largest-contentful-paint events
					const observer = new PerformanceObserver((entryList) => {
						const entries = entryList.getEntries();
						console.log('LCP time', Date(), entries);
						const last = entries[entries.length - 1] as
							| (PerformanceEntry & { startTime: number })
							| undefined;
						if (last && typeof last.startTime === "number") {
							// Record the latest LCP time
							window.__prefetcherLcp = last.startTime;
						}
					});

					observer.observe({
						type: "largest-contentful-paint",
						buffered: true,
					});
				} catch (error) {
					// Record script execution error
					window.__prefetcherLcpError = error;
				}
			});
		} catch (err) {
			this.log.warn(err, "[LCP] Failed to set up LCP observer");
		}
	}
}

export default LcpImpactEvaluationService;
