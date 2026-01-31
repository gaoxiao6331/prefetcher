import type { Page } from "puppeteer";
import { Semaphore } from "@/utils/semaphore";
import type { CapturedResource, GenerateContext } from "../type";
import AllJsService from "./all-js-service";

class InterceptionBlankScreenService extends AllJsService {
	protected override async filter(
		ctx: GenerateContext,
	): Promise<GenerateContext & { validationResults: boolean[] }> {
		this.log.info(
			`[InterceptionBlankScreenService] filter method called for URL: ${ctx.url}`,
		);
		// First filter and get all JS files
		const baseCtx = await super.filter(ctx);
		const resources = baseCtx.capturedResources;

		// Use a separate semaphore for validation to avoid deadlocking with the main capture semaphore
		// We use a small number to avoid resource exhaustion
		const validationSemaphore = new Semaphore(3);

		const tasks = resources.map((resource: CapturedResource) =>
			validationSemaphore.run(async () => {
				this.log.info(
					`[InterceptionBlankScreenService] Validating resource: ${resource.url}`,
				);
				await using pageObj = await this.getPage();
				const page = pageObj.page;
				this.log.info(
					`[InterceptionBlankScreenService] Page object received in filter: ${page}`,
				);

				// Intercept and block THIS specific resource
				page.on("request", (req) => {
					try {
						this.log.info(
							`[InterceptionBlankScreenService] Request intercepted: ${req.url()}`,
						);
						if (req.isInterceptResolutionHandled()) {
							this.log.info(
								`[InterceptionBlankScreenService] Request already handled: ${req.url()}`,
							);
							return;
						}

						if (req.url() === resource.url) {
							this.log.info(
								`[InterceptionBlankScreenService] Aborting critical resource: ${req.url()}`,
							);
							req.abort().catch((err) => {
								this.log.warn(
									`[Interception] Abort failed for ${req.url()}: ${err}`,
								);
							});
						} else {
							this.log.info(
								`[InterceptionBlankScreenService] Continuing non-critical resource: ${req.url()}`,
							);
							req.continue().catch((err) => {
								this.log.warn(
									`[Interception] Continue failed for ${req.url()}: ${err}`,
								);
							});
						}
					} catch (err) {
						this.log.warn(`[Interception] Request handling failed: ${err}`);
					}
				});

				try {
					this.log.info(
						`[InterceptionBlankScreenService] Calling page.goto for URL: ${ctx.url}`,
					);
					// Navigate and wait for content
					await page.goto(ctx.url, {
						waitUntil: "networkidle2",
						timeout: 30000,
					});
					this.log.info(
						`[InterceptionBlankScreenService] page.goto completed for URL: ${ctx.url}`,
					);

					const { blank } = await this.isBlankScreen(page);
					this.log.info(
						`[InterceptionBlankScreenService] isBlankScreen result for ${ctx.url}: ${blank}`,
					);
					if (blank) {
						this.log.info(
							`[Interception] Resource ${resource.url} is critical (causes blank screen)`,
						);
						return true;
					}
					this.log.info(
						`[Interception] Resource ${resource.url} is NOT critical`,
					);
					return false;
				} catch (err) {
					this.log.error(
						err,
						`[Interception] Failed to validate resource: ${resource.url}`,
					);
					// Keep it if we can't determine (safety first)
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
			validationResults,
		};
	}

	protected static _evaluateDomBlankScreen() {
		try {
			// 1. Define sampling points (10x10 grid across viewport, avoiding extreme edges)
			const samplingPoints = 10;
			const nodes = [];
			const vW = window.innerWidth;
			const vH = window.innerHeight;

			// 2. Sample the distribution across the central area
			for (let i = 1; i <= samplingPoints; i++) {
				for (let j = 1; j <= samplingPoints; j++) {
					const x = (vW * i) / (samplingPoints + 1);
					const y = (vH * j) / (samplingPoints + 1);

					// Get the topmost element at this coordinate
					const elements = document.elementsFromPoint(x, y);
					if (elements && elements.length > 0) {
						nodes.push(elements[0]);
					}
				}
			}

			if (nodes.length === 0) {
				return { decided: true, blankRate: 100 }; // If no nodes, it's 100% blank
			}

			// 3. Define "blank" container selectors
			// If the topmost element is still body or html, the point is considered blank
			const blankSelector = ["html", "body", "#app", "#root"];

			// 4. Filter nodes and compute the proportion of blank points
			const blankPoints = nodes.filter((node) => {
				if (!node) return true;
				// 判断是否是空白容器
				const el = node as Element;
				return blankSelector.some((sel) => el.matches(sel));
			}).length;

			const blankRate = (blankPoints / nodes.length) * 100;

			// 5. Decision threshold: if over 90% of points match container selectors, treat as blank screen
			// If blankRate is very high or very low, we can decide based on DOM
			if (blankRate >= 90) {
				return { decided: true, blankRate: blankRate };
			}
			if (blankRate <= 10) {
				return { decided: true, blankRate: blankRate };
			}
			// Otherwise, it's undecided by DOM alone
			return { decided: false, blankRate: blankRate };
		} catch (_err) {
			return { decided: false, blankRate: 0 };
		}
	}

	protected async isBlankScreen(
		page: Page,
	): Promise<{ decided: boolean; blank: boolean }> {
		const domAnalysisResult = await page.evaluate(
			InterceptionBlankScreenService._evaluateDomBlankScreen,
		);
		this.log.info(
			`[Interception] isBlankScreen DOM analysis result: ${JSON.stringify(
				domAnalysisResult,
			)}`,
		);

		if (domAnalysisResult.decided) {
			return { decided: true, blank: domAnalysisResult.blankRate >= 90 };
		}

		// If DOM analysis is undecided, proceed with screenshot analysis
		let blankRateFromScreenshot = 0;
		try {
			const screenshot = await page.screenshot({ encoding: "base64" });
			blankRateFromScreenshot = await page.evaluate(
				InterceptionBlankScreenService._evaluateScreenshotBlankScreen,
				screenshot,
			);
		} catch (error) {
			this.log.error(
				error,
				"Blank screen detection failed during screenshot analysis",
			);
			return { decided: true, blank: true }; // If screenshot fails, treat as blank
		}

		this.log.info(
			`[Interception] isBlankScreen screenshot analysis blankRate: ${blankRateFromScreenshot}`,
		);
		return { decided: true, blank: blankRateFromScreenshot >= 90 };
	}

	protected static _evaluateScreenshotBlankScreen(
		screenshot: string,
	): Promise<number> {
		return new Promise((resolve) => {
			const img = new Image();
			img.onload = () => {
				const canvas = document.createElement("canvas");
				const ctx = canvas.getContext("2d");
				if (!ctx) {
					return resolve(100); // Treat as blank if canvas context is not available
				}

				canvas.width = img.width;
				canvas.height = img.height;
				ctx.drawImage(img, 0, 0);

				const imageData = ctx.getImageData(
					0,
					0,
					canvas.width,
					canvas.height,
				).data;

				const threshold = 5;
				let blankPixels = 0;
				const firstPixel = [imageData[0], imageData[1], imageData[2]];

				for (let i = 0; i < imageData.length; i += 4) {
					const r = imageData[i];
					const g = imageData[i + 1];
					const b = imageData[i + 2];

					if (
						Math.abs(r - firstPixel[0]) < threshold &&
						Math.abs(g - firstPixel[1]) < threshold &&
						Math.abs(b - firstPixel[2]) < threshold
					) {
						blankPixels++;
					}
				}
				resolve((blankPixels / (imageData.length / 4)) * 100);
			};
			img.onerror = () => {
				resolve(100); // Treat as blank if image fails to load
			};
			img.src = `data:image/png;base64,${screenshot}`;
		});
	}
}

export default InterceptionBlankScreenService;
