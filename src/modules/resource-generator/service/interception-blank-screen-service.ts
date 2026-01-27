import type { Page } from "puppeteer";
import { Semaphore } from "@/utils/semaphore";
import type { CapturedResource, GenerateContext } from "../type";
import AllJsService from "./all-js-service";

class InterceptionBlankScreenService extends AllJsService {
	protected override async filter(
		ctx: GenerateContext,
	): Promise<GenerateContext & { validationResults: boolean[] }> {
		// First filter and get all JS files
		const baseCtx = await super.filter(ctx);
		const resources = baseCtx.capturedResources;

		// Use a separate semaphore for validation to avoid deadlocking with the main capture semaphore
		// We use a small number to avoid resource exhaustion
		const validationSemaphore = new Semaphore(3);

		const tasks = resources.map((resource: CapturedResource) =>
			validationSemaphore.run(async () => {
				await using pageObj = await this.getPage();
				const page = pageObj.page;

				// Intercept and block THIS specific resource
				page.on("request", (req) => {
					try {
						if (req.isInterceptResolutionHandled()) return;

						if (req.url() === resource.url) {
							req.abort().catch(() => { });
						} else {
							req.continue().catch(() => { });
						}
					} catch (err) {
						this.log.warn(`[Interception] Request handling failed: ${err}`);
					}
				});

				try {
					// Navigate and wait for content
					await page.goto(ctx.url, {
						waitUntil: "networkidle2",
						timeout: 30000,
					});

					const { blank } = await this.isBlankScreen(page);
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

	private async isBlankScreen(
		page: Page,
	): Promise<{ decided: boolean; blank: boolean }> {
		const domAnalysisResult = await page.evaluate(() => {
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
		});
		this.log.info(
			`[Interception] isBlankScreen DOM analysis result: ${JSON.stringify(
				domAnalysisResult,
			)}`,
		);

		if (domAnalysisResult.decided) {
			return { decided: true, blank: domAnalysisResult.blankRate > 90 };
		}

		// If DOM analysis is undecided, proceed with screenshot analysis
		let blankRateFromScreenshot = 0;
		try {
			const screenshot = await page.screenshot({ encoding: "base64" });
			blankRateFromScreenshot = (await page.evaluate((screenshot) => {
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

						const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

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
			}, screenshot)) as number;
		} catch (error) {
			this.log.error(error, "Blank screen detection failed during screenshot analysis");
			return { decided: true, blank: true }; // If screenshot fails, treat as blank
		}

		this.log.info(
			`[Interception] isBlankScreen screenshot analysis blankRate: ${blankRateFromScreenshot}`,
		);
		return { decided: true, blank: blankRateFromScreenshot > 90 };
	}
}

export default InterceptionBlankScreenService;
