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
			// DOM-first detection to avoid background-only and loading-only false positives
			const domResult = await page.evaluate(() => {
				const viewportW = Math.max(
					document.documentElement.clientWidth,
					window.innerWidth || 0,
				);
				const viewportH = Math.max(
					document.documentElement.clientHeight,
					window.innerHeight || 0,
				);
				const viewportArea = viewportW * viewportH;

				const isVisible = (el: Element) => {
					const style = getComputedStyle(el as HTMLElement);
					if (style.visibility === "hidden" || style.display === "none") return false;
					if (parseFloat(style.opacity || "1") === 0) return false;
					const rect = (el as HTMLElement).getBoundingClientRect();
					return (
						rect.width > 0 &&
						rect.height > 0 &&
						rect.bottom > 0 &&
						rect.right > 0 &&
						rect.top < viewportH &&
						rect.left < viewportW
					);
				};

				const nodes = Array.from(document.body.querySelectorAll("*"))
					.filter((el) => isVisible(el) && !["HTML", "BODY"].includes(el.tagName));

				const loadingRegex = /loading|spinner|skeleton|progress|shimmer/i;
				const textLoadingRegex = /loading|加载|稍候|载入|讀取|読み込み|로딩/i;

				const significant: Element[] = [];
				let textCount = 0;
				let hasLoadedMedia = false;
				const loadingIndicators: Element[] = [];

				nodes.forEach((el) => {
					const tag = el.tagName.toLowerCase();
					const rect = (el as HTMLElement).getBoundingClientRect();
					const areaFrac = (rect.width * rect.height) / viewportArea;
					const text = (el.textContent || "").trim();
					const cls = (el as HTMLElement).className?.toString() || "";
					const id = (el as HTMLElement).id || "";
					const role = (el as HTMLElement).getAttribute("role") || "";
					const ariaBusy = (el as HTMLElement).getAttribute("aria-busy") === "true";
					const style = getComputedStyle(el as HTMLElement);
					const animName = style.animationName || "";

					const isLoadingEl =
						loadingRegex.test(cls) ||
						loadingRegex.test(id) ||
						/progressbar/i.test(role) ||
						ariaBusy ||
						textLoadingRegex.test(text) ||
						/spin|pulse|skeleton|shimmer/i.test(animName);
					if (isLoadingEl) loadingIndicators.push(el);

					const hasText = text.length >= 3 && !textLoadingRegex.test(text);
					if (hasText) textCount++;

					const semantic = [
						"h1",
						"h2",
						"h3",
						"p",
						"main",
						"article",
						"section",
						"img",
						"video",
						"canvas",
						"svg",
					].includes(tag);
					if (semantic || areaFrac >= 0.02 || hasText) significant.push(el);

					if (
						(tag === "img" && (el as HTMLImageElement).naturalWidth > 0) ||
						(tag === "video" && (el as HTMLVideoElement).readyState >= 2)
					) {
						hasLoadedMedia = true;
					}
				});

				const coverage =
					significant.reduce((acc, el) => {
						const r = (el as HTMLElement).getBoundingClientRect();
						return acc + r.width * r.height;
					}, 0) / viewportArea;

				const hasContent = textCount >= 2 || hasLoadedMedia || coverage >= 0.1;

				// If only loading elements exist and no meaningful content, treat as blank
				if (!hasContent && loadingIndicators.length > 0) {
					return { decided: true, blank: true };
				}

				// If there is meaningful content, it's not blank
				if (hasContent) {
					return { decided: true, blank: false };
				}

				// If there are no visible child nodes, it's likely just a background
				if (nodes.length === 0) {
					return { decided: true, blank: true };
				}

				// Otherwise, fall back to screenshot-based detection
				return { decided: false, blank: true };
			});

			if (domResult && typeof domResult === "object" && (domResult as any).decided) {
				return Boolean((domResult as any).blank as boolean);
			}

			// Screenshot fallback: pixel variance + edge density to avoid gradient backgrounds being counted as content
			const screenshotBase64 = await page.screenshot({
				type: "jpeg",
				quality: 30,
				encoding: "base64",
			});

			const isBlank = await page.evaluate((base64: string) => {
				return new Promise((resolve) => {
					const img = new Image();
					img.src = `data:image/jpeg;base64,${base64}`;
					img.onload = () => {
						const canvas = document.createElement("canvas");
						const w = 100;
						const h = 100;
						canvas.width = w;
						canvas.height = h;
						const ctx = canvas.getContext("2d");
						if (!ctx) {
							resolve(true);
							return;
						}

						ctx.drawImage(img, 0, 0, w, h);
						const imageData = ctx.getImageData(0, 0, w, h);
						const data = imageData.data;

						const pixelCount = data.length / 4;
						let sumR = 0;
						let sumG = 0;
						let sumB = 0;
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

						const colorDist = (i1: number, i2: number) => {
							const dr = data[i1] - data[i2];
							const dg = data[i1 + 1] - data[i2 + 1];
							const db = data[i1 + 2] - data[i2 + 2];
							return Math.sqrt(dr * dr + dg * dg + db * db);
						};
						let highContrastPairs = 0;
						let totalPairs = 0;
						for (let y = 0; y < h; y++) {
							for (let x = 0; x < w; x++) {
								const idx = (y * w + x) * 4;
								if (x + 1 < w) {
									totalPairs++;
									if (colorDist(idx, idx + 4) > 30) highContrastPairs++;
								}
								if (y + 1 < h) {
									totalPairs++;
									if (colorDist(idx, idx + 4 * w) > 30) highContrastPairs++;
								}
							}
						}
						const edgeFrac = totalPairs ? highContrastPairs / totalPairs : 0;

						resolve(avgDiff < 6 && edgeFrac < 0.02);
					};
					img.onerror = () => resolve(true);
				});
			}, screenshotBase64) as boolean;

			return isBlank;
		} catch (err) {
			this.log.error(err, "Blank screen detection failed");
			return true; // Safety first: assume blank if detection fails
		}
	}
}

export default InterceptionBlankScreenService;
