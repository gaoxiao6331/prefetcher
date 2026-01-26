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
		return await page.evaluate(() => {
			debugger
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

			// 3. Define "blank" container selectors
			// If the topmost element is still body or html, the point is considered blank
			const blankSelector = ['html', 'body', '#app', '#root'];

			// 4. Filter nodes and compute the proportion of blank points
			const blankPoints = nodes.filter(node => {
				if (!node) return true;
				// 判断是否是空白容器
				const el = node as Element;
				return blankSelector.some(sel => el.matches(sel));
			}).length;

			const blankRate = (blankPoints / nodes.length) * 100;

			// 5. Decision threshold: if over 90% of points match container selectors, treat as blank screen
			return blankRate > 90;
		});
	}
}

export default InterceptionBlankScreenService;
