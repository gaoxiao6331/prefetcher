import path from "node:path";
import fs from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import puppeteer, {
	type Browser,
	type HTTPRequest,
	type HTTPResponse,
} from "puppeteer";
import { PUPPETEER_EXECUTABLE_PATH } from "@/env";
import { isDebugMode } from "@/utils/is";

import { Semaphore } from "@/utils/semaphore";
import { bindAsyncContext, getLogger, getTraceId } from "@/utils/trace-context";
import type {
	CapturedResource,
	GenerateContext,
	ResourceGeneratorService,
} from "../type";

abstract class BaseService implements ResourceGeneratorService {
	protected readonly requestHeader = "x-prefetcher-req-id";

	/** Maximum concurrent browser pages to avoid resource exhaustion */
	protected static readonly MAX_CONCURRENT_PAGES = 5;

	/** Default timeout for page navigation */
	protected static readonly DEFAULT_PAGE_GOTO_TIMEOUT_MS = 30_000;

	/** Wait time for all resources to be ready after page load */
	protected static readonly RESOURCE_READY_WAIT_MS = 5_000;

	/** Bytes per Kilobyte */
	protected static readonly BYTES_PER_KB = 1024;

	/** HTTP Status OK */
	protected static readonly HTTP_STATUS_OK = 200;

	/** HTTP Status Multiple Choices (Start of 3xx) */
	protected static readonly HTTP_STATUS_MULTIPLE_CHOICES = 300;

	/** Global flag to prevent concurrent tracing sessions in the same browser */
	private static isGlobalTracingActive = false;

	protected readonly BROWSER_TRACE_DIR_COUNT_THRESHOLD = 5;

	protected browser: Browser | null = null;
	// Limit concurrent pages to avoid crashing the server
	protected readonly semaphore = new Semaphore(BaseService.MAX_CONCURRENT_PAGES);

	constructor(protected readonly fastify: FastifyInstance) {}

	/**
	 * Get logger, prioritize logger with traceId
	 */
	protected get log() {
		return getLogger() ?? this.fastify.log;
	}

	static async create<T extends BaseService>(
		this: new (
			fastify: FastifyInstance,
		) => T,
		fastify: FastifyInstance,
	): Promise<T> {
		// biome-ignore lint/complexity/noThisInStatic: factory method in abstract class
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
				devtools: !headless, // Automatically open DevTools in non-headless mode
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
			try {
				await this.browser.close();
				this.log.info("Puppeteer browser closed");
			} catch (error) {
				this.log.error(error, "Failed to close browser");
			} finally {
				this.browser = null;
			}
		}
	}

	protected async getPage(options?: { traceName?: string }) {
		if (!this.browser || !this.browser.connected) {
			this.log.warn("Browser not connected, re-initializing...");
			await this.initBrowser();
		}

		if (!this.browser) {
			throw new Error("Failed to initialize browser");
		}

		const page = await this.browser.newPage();

		// Forward browser console logs to our logger
		page.on("console", (msg) => {
			const type = msg.type();
			const text = msg.text();
			if (type === "error") {
				this.log.error(`[Browser] ${text}`);
			} else if (type === "warn") {
				this.log.warn(`[Browser] ${text}`);
			} else if (isDebugMode()) {
				this.log.debug(`[Browser] ${text}`);
			}
		});

		await page.setRequestInterception(true);

		// Record performance in debug mode
		let isTracingStartedByThisPage = false;
		const stopTracing = async () => {
			if (isTracingStartedByThisPage) {
				try {
					await page.tracing.stop();
					this.log.debug("[Browser] Performance tracing stopped and saved");
				} catch (err) {
					this.log.warn(`[Browser] Failed to stop tracing: ${err}`);
				} finally {
					isTracingStartedByThisPage = false;
					BaseService.isGlobalTracingActive = false;
				}
			}
		};

		if (!BaseService.isGlobalTracingActive) {
			BaseService.isGlobalTracingActive = true;
			isTracingStartedByThisPage = true;

			const traceId = getTraceId() || "unknown-trace";

			const baseDir = "browser-traces";

			// up to BROWSER_TRACE_DIR_COUNT_THRESHOLD dirs
			const traceDirs = await fs.readdir(baseDir);
			await Promise.all(
				traceDirs.slice(this.BROWSER_TRACE_DIR_COUNT_THRESHOLD).map((dir) => fs.rm(path.resolve(baseDir, dir), { recursive: true })),
			);

			const tracesDir = path.resolve(baseDir, traceId);
			try {
				await fs.access(tracesDir);
			} catch {
				await fs.mkdir(tracesDir, { recursive: true });
			}

			// Sanitize trace name if provided
			const tracePrefix = options?.traceName
				? options.traceName.replace(/[^a-z0-9]/gi, "-").toLowerCase()
				: "trace";

			const tracePath = path.join(
				tracesDir,
				`${tracePrefix}.json`,
			);

			try {
				await page.tracing.start({
					path: tracePath,
					screenshots: true,
					categories: [
						"-*", // Start with nothing
						"toplevel",
						"v8.execute",
						"blink.console",
						"blink.user_timing",
						"benchmark",
						"loading",
						"devtools.timeline",
						"disabled-by-default-devtools.timeline",
						"disabled-by-default-devtools.timeline.frame",
						"disabled-by-default-devtools.timeline.stack",
						"disabled-by-default-devtools.screenshot",
						"disabled-by-default-v8.cpu_profiler",
						"disabled-by-default-v8.cpu_profiler.hires",
						"latencyInfo",
						"cc",
						"gpu",
						"devtools.timeline.layers",
						"devtools.timeline.picture",
						"disabled-by-default-devtools.timeline.layers",
					],
				});
				this.log.debug(`[Browser] Performance tracing started: ${tracePath}`);
			} catch (err) {
				BaseService.isGlobalTracingActive = false;
				isTracingStartedByThisPage = false;
				this.log.warn(`[Browser] Failed to start tracing: ${err}`);
			}
		}

		return {
			page,
			stopTracing,
			[Symbol.asyncDispose]: async () => {
				try {
					await stopTracing();
					if (!page.isClosed()) {
						await page.close();
					}
				} catch (error) {
					this.log.warn(error, "Failed to close page");
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

			await using pageObj = await this.getPage({
				traceName: `capture-${url}`,
			});
			const page = pageObj.page;

			// Request interception already enabled in getPage()

			// Use bindAsyncContext to bind context, ensuring getLogger() works properly in event callbacks
			page.on(
				"request",
				bindAsyncContext((request: HTTPRequest) => {
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
							request.continue().catch(() => {});
						}
					}
				}),
			);

			page.on(
				"response",
				bindAsyncContext(async (response: HTTPResponse) => {
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
						if (status < BaseService.HTTP_STATUS_OK || status >= BaseService.HTTP_STATUS_MULTIPLE_CHOICES) return;

						let resourceSizeKB = 0;
						try {
							const buffer = await response.buffer();
							resourceSizeKB = buffer.length / BaseService.BYTES_PER_KB;
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

			await page.goto(url, { waitUntil: "networkidle0", timeout: BaseService.DEFAULT_PAGE_GOTO_TIMEOUT_MS });

			// wait for all resource loaded
			await new Promise((resolve) => setTimeout(resolve, BaseService.RESOURCE_READY_WAIT_MS));

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
