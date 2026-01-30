import type { Page } from "puppeteer";
import { Semaphore } from "@/utils/semaphore";
import type { CapturedResource, GenerateContext } from "../type";
import AllJsService from "./all-js-service";

export function _evaluateLcpInBrowserContext(): number | null {
	const value = (window as any).__prefetcherLcp;
	if (typeof value === "number" && !Number.isNaN(value)) {
		return value as number;
	}
	const entries = performance.getEntriesByType(
		"largest-contentful-paint",
	) as PerformanceEntry[];
	const last = entries[entries.length - 1] as any;
	if (last && typeof last.startTime === "number") {
		return last.startTime as number;
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

					const delta = impactedLcp - baselineLcp!;
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
		page.on("request", (req) => {
			try {
				if (req.isInterceptResolutionHandled()) return;

				if (req.url() === resourceUrl) {
					setTimeout(() => {
						if (req.isInterceptResolutionHandled()) return;
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
	}

	private async setupLcpObserver(page: Page) {
		await page.evaluateOnNewDocument(() => {
			try {
				(window as any).__prefetcherLcp = null;
				const observer = new PerformanceObserver((entryList) => {
					const entries = entryList.getEntries();
					const last = entries[entries.length - 1] as any;
					if (last && typeof last.startTime === "number") {
						(window as any).__prefetcherLcp = last.startTime;
					}
				});
				observer.observe({ type: "largest-contentful-paint", buffered: true });
				this.setupVisibilityChangeListener(observer);
			} catch (error) {
				(window as any).__prefetcherLcpError = error;
			}
		});
	}

	private setupVisibilityChangeListener(observer: PerformanceObserver) {
		window.addEventListener(
			"visibilitychange",
			() => {
				if (document.visibilityState === "hidden") {
					observer.disconnect();
				}
			},
			{ once: true },
		);
	}
}

export default LcpImpactEvaluationService;
