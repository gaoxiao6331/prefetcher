import type { FastifyInstance } from "fastify";
import puppeteer, { type Browser } from "puppeteer";
import { PUPPETEER_EXECUTABLE_PATH } from "@/env";
import { isDebugMode } from "@/utils/is";

import { Semaphore } from "@/utils/semaphore";
import { bindAsyncContext, getLogger } from "@/utils/trace-context";
import type { CapturedResource, GenerateContext, ResourceGeneratorService } from "../type";

abstract class BaseService implements ResourceGeneratorService {
	protected readonly requestHeader = "x-prefetcher-req-id";

	protected browser: Browser | null = null;
	// Limit concurrent pages to 5 to avoid crashing the server
	protected readonly semaphore = new Semaphore(5);

	constructor(protected readonly fastify: FastifyInstance) { }

	/**
	 * Get logger, prioritize logger with traceId
	 */
	protected get log() {
		return getLogger() ?? this.fastify.log;
	}

	static async create(
		this: new (
			fastify: FastifyInstance,
		) => BaseService,
		fastify: FastifyInstance,
	) {
		// biome-ignore lint/complexity/noThisInStatic: biome bug
		const service = new this(fastify);
		await service.initBrowser();
		return service;
	}

	private async initBrowser() {
		if (this.browser?.connected) return;

		try {
			if (this.browser) {
				await this.browser.close();
			}

			const headless = !isDebugMode();
			this.browser = await puppeteer.launch({
				headless,
				args: [
					"--no-sandbox",
					"--disable-setuid-sandbox",
					"--disable-dev-shm-usage",
				],
				executablePath: PUPPETEER_EXECUTABLE_PATH,
			});

			if (!this.browser) {
				throw new Error("Failed to initialize browser");
			}

			this.browser.on("disconnected", () => {
				this.log.warn("Puppeteer browser disconnected");
				this.browser = null;
			});

			this.log.info("Puppeteer browser initialized");
		} catch (error) {
			this.log.error(error, "Failed to initialize puppeteer browser");
			throw error;
		}
	}

	protected abstract filter(ctx: GenerateContext): Promise<GenerateContext>;

	protected abstract rank(ctx: GenerateContext): Promise<GenerateContext>;

	// Public close method to be called on shutdown
	async close() {
		if (this.browser) {
			await this.browser.close();
			this.browser = null;
			this.log.info("Puppeteer browser closed");
		}
	}

	protected async getPage() {
		if (!this.browser || !this.browser.connected) {
			this.log.warn("Browser not connected, re-initializing...");
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

			// Request interception already enabled in getPage()

			// Use bindAsyncContext to bind context, ensuring getLogger() works properly in event callbacks
			page.on(
				"request",
				bindAsyncContext((request) => {
					try {
						if (request.isInterceptResolutionHandled()) return;

						// Only track GET requests, but ensure others are allowed to continue
						if (request.method() !== "GET") {
							request.continue();
							return;
						}

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
						this.log.warn(`Request interception failed: ${err}`);
						if (!request.isInterceptResolutionHandled()) {
							request.continue().catch(() => { });
						}
					}
				}),
			);

			page.on(
				"response",
				bindAsyncContext(async (response) => {
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
						} catch (_e) {
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
						this.log.warn(`Response processing failed: ${err}`);
					}
				}),
			);

			// networkidle2: consider navigation finished when there are no more than 2 network connections for at least 500ms
			await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

			const ctx: GenerateContext = {
				url,
				capturedResources,
			};

			// Filter and rank resources before returning
			const filteredCtx = await this.filter(ctx);
			const rankedCtx = await this.rank(filteredCtx);
			return rankedCtx.capturedResources.map((r) => r.url);
		});
	}
}

export default BaseService;
