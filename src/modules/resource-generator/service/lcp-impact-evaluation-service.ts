import type { Page } from "puppeteer";
import { Semaphore } from "@/utils/semaphore";
import type { CapturedResource, GenerateContext } from "../type";
import AllJsService from "./all-js-service";

export function _evaluateLcpInBrowserContext(): number | null {
	const win = window as unknown as {
		__prefetcherLcp?: number;
		performance: Performance;
	};
	const value = win.__prefetcherLcp;
	if (typeof value === "number" && !Number.isNaN(value)) {
		return value;
	}
	const entries = win.performance.getEntriesByType("largest-contentful-paint");
	const last = entries[entries.length - 1] as
		| (PerformanceEntry & { startTime: number })
		| undefined;
	if (last && typeof last.startTime === "number") {
		return last.startTime;
	}
	return null;
}

class LcpImpactEvaluationService extends AllJsService {
	private static readonly LCP_IMPACT_THRESHOLD_MS = 1000;

	protected override async filter(
		ctx: GenerateContext,
	): Promise<GenerateContext> {
		const baseCtx = await super.filter(ctx);
		const resources = baseCtx.capturedResources;

		if (!resources.length) {
			return baseCtx;
		}

		const validationSemaphore = new Semaphore(3);

		let baselineLcp: number | null = null;
		try {
			baselineLcp = await this.measureLcp(ctx.url);
		} catch (err) {
			this.log.error(err, "[LCP] Failed to measure baseline LCP");
		}

		if (baselineLcp == null) {
			this.log.warn(
				"[LCP] Baseline LCP is unavailable, treating all resources as critical",
			);
			return baseCtx;
		}

		const tasks = resources.map((resource: CapturedResource) =>
			validationSemaphore.run(async () => {
				try {
					const impactedLcp = await this.measureLcpWithDelay(
						ctx.url,
						resource.url,
					);

					if (impactedLcp == null) {
						this.log.warn(
							`[LCP] Failed to measure LCP with delayed resource: ${resource.url}, treating as critical`,
						);
						return true;
					}

					// baselineLcp is checked at line 44 to be non-null
					const delta = impactedLcp - baselineLcp;
					const isCritical =
						delta >= LcpImpactEvaluationService.LCP_IMPACT_THRESHOLD_MS;

					if (isCritical) {
						this.log.info(
							`[LCP] Resource ${resource.url} is critical (ΔLCP=${delta.toFixed(0)}ms)`,
						);
					} else {
						this.log.info(
							`[LCP] Resource ${resource.url} is NOT critical (ΔLCP=${delta.toFixed(0)}ms)`,
						);
					}

					return isCritical;
				} catch (err) {
					this.log.error(
						err,
						`[LCP] Failed to evaluate resource impact: ${resource.url}`,
					);
					return true;
				}
			}),
		);

		const validationResults = await Promise.all(tasks);
		const criticalResources = resources.filter(
			(_, index) => validationResults[index],
		);

		return {
			...baseCtx,
			capturedResources: criticalResources,
		};
	}

	private async measureLcp(url: string): Promise<number | null> {
		return this.measureLcpInternal(url, undefined);
	}

	private async measureLcpWithDelay(
		url: string,
		resourceUrl: string,
	): Promise<number | null> {
		return this.measureLcpInternal(url, resourceUrl);
	}

	private async measureLcpInternal(
		url: string,
		delayResourceUrl?: string,
	): Promise<number | null> {
		await using pageObj = await this.getPage();
		const page = pageObj.page as Page;

		if (delayResourceUrl) {
			await page.setRequestInterception(true);
			this.setupDelayInterception(page, delayResourceUrl);
		}

		await this.setupLcpObserver(page);

		try {
			await page.goto(url, {
				waitUntil: "networkidle2",
				timeout: 60000,
			});
		} catch (error) {
			this.log.error(error, `[LCP] Failed to navigate to ${url}`);
			return null;
		}

		const lcp = await page.evaluate(_evaluateLcpInBrowserContext);

		return typeof lcp === "number" ? lcp : null;
	}

	private setupDelayInterception(page: Page, resourceUrl: string) {
		try {
			page.on("request", (req) => {
				try {
					if (req.isInterceptResolutionHandled()) return;

					if (req.url() === resourceUrl) {
						setTimeout(() => {
							if (req.isInterceptResolutionHandled()) {
								return;
							}
							req.continue().catch((err: Error) => {
								this.log.warn(`[LCP] Request handling failed: ${err.message}`);
							});
						}, 10000);
					} else {
						req.continue().catch((err: Error) => {
							this.log.warn(`[LCP] Request handling failed: ${err.message}`);
						});
					}
				} catch (err) {
					this.log.warn(`[LCP] Request handling failed: ${err}`);
				}
			});
		} catch (error) {
			this.log.warn(error, "[LCP] Failed to setup delay interception");
		}
	}

	private async setupLcpObserver(page: Page) {
		try {
			await page.evaluateOnNewDocument(() => {
				try {
					// biome-ignore lint/suspicious/noExplicitAny: browser context
					(window as any).__prefetcherLcp = null;
					const observer = new PerformanceObserver((entryList) => {
						const entries = entryList.getEntries();
						// biome-ignore lint/suspicious/noExplicitAny: browser context
						const last = entries[entries.length - 1] as any;
						if (last && typeof last.startTime === "number") {
							// biome-ignore lint/suspicious/noExplicitAny: browser context
							(window as any).__prefetcherLcp = last.startTime;
						}
					});
					observer.observe({
						type: "largest-contentful-paint",
						buffered: true,
					});

					window.addEventListener(
						"visibilitychange",
						() => {
							if (document.visibilityState === "hidden") {
								observer.disconnect();
							}
						},
						{ once: true },
					);
				} catch (error) {
					// biome-ignore lint/suspicious/noExplicitAny: browser context
					(window as any).__prefetcherLcpError = error;
				}
			});
		} catch (err) {
			this.log.warn(err, "[LCP] Failed to setup LCP observer");
		}
	}
}

export default LcpImpactEvaluationService;
