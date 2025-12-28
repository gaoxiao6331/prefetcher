import type { FastifyInstance } from "fastify";
import puppeteer, { type Browser } from "puppeteer";
import type { CapturedResource } from "./type";
import { PUPPETEER_EXECUTABLE_PATH } from "@/env";

import { Semaphore } from "@/utils/semaphore";

class ResourceGeneratorService {
	private readonly requestHeader = "x-prefetcher-req-id";

	private browser: Browser | null = null;
	// Limit concurrent pages to 5 to avoid crashing the server
	private readonly semaphore = new Semaphore(5);

	private constructor(
		private readonly fastify: FastifyInstance,
	) { }

	static async create(fastify: FastifyInstance) {
		const service = new ResourceGeneratorService(fastify);
		await service.initBrowser();
		return service;
	}

	private async initBrowser() {
		if (this.browser && this.browser.connected) return;

		try {
			if (this.browser) {
				await this.browser.close();
			}

			const headless = this.fastify.config.env !== "dev";
			this.browser = await puppeteer.launch({
				headless,
				args: [
					'--no-sandbox',
					'--disable-setuid-sandbox',
					'--disable-dev-shm-usage',
				],
				executablePath: PUPPETEER_EXECUTABLE_PATH,
			});

			this.browser.on('disconnected', () => {
				this.fastify.log.warn('Puppeteer browser disconnected');
				this.browser = null;
			});

			this.fastify.log.info('Puppeteer browser initialized');
		} catch (error) {
			this.fastify.log.error(error, "Failed to initialize puppeteer browser");
			throw error;
		}
	}

	private filter(resource: CapturedResource[]) {
		// 只保留js文件
		return resource.filter((item) => item.type === "script");
	}

	private rank(res: CapturedResource[]) {
		// 按照资源体积从大到小排序
		return res.sort((a, b) => b.sizeKB - a.sizeKB);
	}

	// Public close method to be called on shutdown
	async close() {
		if (this.browser) {
			await this.browser.close();
			this.browser = null;
			this.fastify.log.info('Puppeteer browser closed');
		}
	}

	private async getPage() {
		if (!this.browser || !this.browser.connected) {
			this.fastify.log.warn("Browser not connected, re-initializing...");
			await this.initBrowser();
		}

		if (!this.browser) {
			throw new Error("Failed to initialize browser");
		}

		const page = await this.browser.newPage();
		await page.setRequestInterception(true);

		return {
			page,
			async [Symbol.asyncDispose]() {
				if (!page.isClosed()) {
					await page.close();
				}
			},
		};
	}

	/**
	 * Capture resources (specifically JS files) loaded by a target URL.
	 * Uses Puppeteer to render the page and intercept network requests.
	 * 
	 * @param url Target URL to inspect
	 * @returns List of captured resource URLs (sorted by size)
	 */
	async captureResources(url: string) {
		// Use semaphore to limit concurrent browser page instances
		return this.semaphore.run(async () => {
			let id = 0;

			const requestStartTimeMap = new Map();
			const capturedResources: CapturedResource[] = [];

			await using pageObj = await this.getPage();
			const page = pageObj.page;

			// Enable request interception to inject tracking headers
			await page.setRequestInterception(true);

			page.on("request", (request) => {
				if (request.isInterceptResolutionHandled()) return;

				// Only track GET requests, but ensure others are allowed to continue
				if (request.method() !== "GET") {
					request.continue();
					return;
				}

				try {
					id++;
					const requestId = id.toString();
					// Inject a custom header to correlate request and response later
					const headers = {
						...request.headers(),
						[this.requestHeader]: requestId,
					};

					// Record start time
					requestStartTimeMap.set(requestId, {
						url: request.url(),
						timestamp: Date.now(),
					});

					request.continue({ headers });
				} catch (err) {
					this.fastify.log.warn(`Request interception failed: ${err}`);
					if (!request.isInterceptResolutionHandled()) {
						request.continue();
					}
				}
			});

			page.on("response", async (response) => {
				try {
					const request = response.request();
					if (request.method() !== "GET") return;

					// Try to get requestId
					// Note: Not all requests accept headers (e.g. redirects). Skip if ID is missing.
					const headers = request.headers();
					const requestId = headers[this.requestHeader];

					// If ID is missing in headers, skip.
					if (!requestId) return;

					const requestInfo = requestStartTimeMap.get(requestId);
					if (!requestInfo) return;

					const status = response.status();
					// Only record successful requests (2xx)
					if (status < 200 || status >= 300) return;

					let resourceSizeKB = 0;
					try {
						const buffer = await response.buffer();
						resourceSizeKB = buffer.length / 1024;
					} catch (e) {
						// Ignored: Buffer access might fail for various reasons (CORS, etc.)
					}

					const now = Date.now();
					capturedResources.push({
						url: response.url(),
						status: status,
						type: request.resourceType(),
						sizeKB: resourceSizeKB,
						requestTime: requestInfo.timestamp,
						responseTime: now,
						durationMs: now - requestInfo.timestamp,
					});

					// Cleanup map to prevent memory leaks
					requestStartTimeMap.delete(requestId);

				} catch (err) {
					this.fastify.log.warn(`Response processing failed: ${err}`);
				}
			});

			try {
				// networkidle2: consider navigation finished when there are no more than 2 network connections for at least 500ms
				await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
			} catch (error) {
				this.fastify.log.error(`Page navigation error for ${url}: ${error}`);
				throw error;
			}

			// Filter and rank resources before returning
			const res = this.rank(this.filter(capturedResources));
			return res.map((r) => r.url);
		});
	}
}

export default ResourceGeneratorService;
