import type { Page } from "puppeteer";
import { Semaphore } from "@/utils/semaphore";
import type { CapturedResource, GenerateContext } from "../type";
import AllJsService from "./all-js-service";

class InterceptionBlankScreenService extends AllJsService {
	protected override async filter(
		ctx: GenerateContext,
	): Promise<GenerateContext> {
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
							req.abort().catch(() => {});
						} else {
							req.continue().catch(() => {});
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

					const isBlank = await this.isBlankScreen(page);
					if (isBlank) {
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
		};
	}

	private async isBlankScreen(page: Page): Promise<boolean> {
		try {
			// Take a small, low-resolution screenshot to analyze visual content
			const screenshotBase64 = await page.screenshot({
				type: "jpeg",
				quality: 30,
				encoding: "base64",
			});

			return await page.evaluate(async (base64) => {
				const img = new Image();
				img.src = `data:image/jpeg;base64,${base64}`;
				await new Promise((resolve, reject) => {
					img.onload = resolve;
					img.onerror = reject;
				});

				const canvas = document.createElement("canvas");
				// Use a small sampling size for performance
				const w = 50;
				const h = 50;
				canvas.width = w;
				canvas.height = h;
				const ctx = canvas.getContext("2d");
				if (!ctx) return true;

				ctx.drawImage(img, 0, 0, w, h);
				const imageData = ctx.getImageData(0, 0, w, h);
				const data = imageData.data;

				// Analyze pixel variance to detect if the page is a solid color (blank)
				let sumR = 0;
				let sumG = 0;
				let sumB = 0;
				const pixelCount = data.length / 4;

				for (let i = 0; i < data.length; i += 4) {
					sumR += data[i];
					sumG += data[i + 1];
					sumB += data[i + 2];
				}

				const avgR = sumR / pixelCount;
				const avgG = sumG / pixelCount;
				const avgB = sumB / pixelCount;

				let totalDiff = 0;
				for (let i = 0; i < data.length; i += 4) {
					totalDiff += Math.abs(data[i] - avgR);
					totalDiff += Math.abs(data[i + 1] - avgG);
					totalDiff += Math.abs(data[i + 2] - avgB);
				}

				const avgDiff = totalDiff / pixelCount;

				// A very low average difference (e.g., < 10) indicates a solid-color or nearly blank screen.
				// Compression artifacts and slight gradients may exist, so we use a small tolerance.
				return avgDiff < 8;
			}, screenshotBase64);
		} catch (err) {
			this.log.error(err, "Screenshot-based blank screen detection failed");
			return true; // Safety first: assume blank if we can't determine
		}
	}
}

export default InterceptionBlankScreenService;
