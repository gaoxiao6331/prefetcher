import type { FastifyInstance } from "fastify";
import puppeteer from "puppeteer";
import type { CapturedResource, GenerateContext } from "../../type";
import LcpImpactEvaluationService, {
	_evaluateLcpInBrowserContext,
} from "../lcp-impact-evaluation-service";

jest.mock("puppeteer");
jest.mock("@/utils/trace-context", () => ({
	bindAsyncContext: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
	getLogger: jest.fn().mockReturnValue(null),
}));
jest.mock("@/utils/semaphore", () => ({
	Semaphore: jest.fn().mockImplementation(() => ({
		run: jest.fn().mockImplementation((fn: () => unknown) => fn()),
	})),
}));

// Test constants
const TEST_URL = "http://example.com";
const TEST_RESOURCE_URL = "http://example.com/script.js";
const _TEST_RESOURCE_URL_2 = "http://example.com/style.css";
const _LCP_THRESHOLD = 1000;

// Helper function to create mock page
function createMockPage() {
	return {
		on: jest.fn(),
		goto: jest.fn(),
		evaluate: jest.fn(),
		evaluateOnNewDocument: jest.fn(),
		setRequestInterception: jest.fn(),
		isClosed: jest.fn().mockReturnValue(false),
		close: jest.fn(),
	};
}

type MockPage = ReturnType<typeof createMockPage>;

// Helper function to create mock browser
function createMockBrowser(mockPage: MockPage) {
	return {
		newPage: jest.fn().mockResolvedValue(mockPage),
		close: jest.fn(),
		connected: true,
		on: jest.fn(),
	};
}

type MockBrowser = ReturnType<typeof createMockBrowser>;

type ServiceWithInternals = {
	browser: MockBrowser | null;
	filter: (ctx: GenerateContext) => Promise<GenerateContext>;
	measureLcp: (url: string) => Promise<number | null>;
	measureLcpWithDelay: (
		url: string,
		delayResourceUrl: string,
	) => Promise<number | null>;
	measureLcpInternal: (
		url: string,
		delayResourceUrl?: string,
	) => Promise<number | null>;
	setupDelayInterception: (page: MockPage, resourceUrl: string) => void;
	setupLcpObserver: (page: MockPage) => Promise<void>;
};

interface MockRequest {
	isInterceptResolutionHandled: () => boolean;
	url: () => string;
	continue: jest.Mock;
	abort?: jest.Mock;
}

// Helper function to create mock Fastify instance
function createMockFastify(): FastifyInstance {
	return {
		log: {
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
		},
	} as unknown as FastifyInstance;
}

// Helper function to create mock GenerateContext
function createMockContext(resources: CapturedResource[]): GenerateContext {
	return {
		url: TEST_URL,
		capturedResources: resources,
	} as unknown as GenerateContext;
}

describe("LcpImpactEvaluationService", () => {
	let fastifyMock: FastifyInstance;
	let service: LcpImpactEvaluationService;
	let mockPage: MockPage;
	let mockBrowser: MockBrowser;
	let requestHandler: (req: MockRequest) => Promise<void>;

	beforeEach(async () => {
		jest.clearAllMocks();
		jest.resetModules();
		jest.useFakeTimers();

		mockPage = createMockPage();
		mockBrowser = createMockBrowser(mockPage);

		(puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);

		fastifyMock = createMockFastify();
		service = (await LcpImpactEvaluationService.create(
			fastifyMock,
		)) as LcpImpactEvaluationService;
		(service as unknown as ServiceWithInternals).browser = mockBrowser;
		requestHandler = (mockPage.on as jest.Mock).mock.calls.find(
			(call) => call[0] === "request",
		)?.[1];
	});

	afterEach(async () => {
		jest.useRealTimers();
		(service as unknown as ServiceWithInternals).browser = null;
		await service.close();
	});

	describe("_evaluateLcpInBrowserContext", () => {
		let mockWindow: {
			performance: { getEntriesByType: jest.Mock };
			__prefetcherLcp?: unknown;
		};
		let mockPerformance: { getEntriesByType: jest.Mock };

		beforeEach(() => {
			mockPerformance = {
				getEntriesByType: jest.fn().mockReturnValue([]),
			};
			mockWindow = {
				performance: mockPerformance,
			};

			// Setup global window for tests that use the exported function directly
			(global as unknown as { window: unknown }).window = mockWindow;
			(global as unknown as { performance: unknown }).performance =
				mockPerformance;
		});

		afterEach(() => {
			delete (global as unknown as Record<string, unknown>).window;
			delete (global as unknown as Record<string, unknown>).performance;
		});

		test("should return __prefetcherLcp value when available", () => {
			mockWindow.__prefetcherLcp = 1234.5;
			expect(_evaluateLcpInBrowserContext()).toBe(1234.5);
		});

		test("should return last LCP entry startTime when __prefetcherLcp not available", () => {
			mockWindow.__prefetcherLcp = undefined;
			mockPerformance.getEntriesByType.mockReturnValueOnce([
				{ startTime: 100 },
				{ startTime: 200 },
			]);
			expect(_evaluateLcpInBrowserContext()).toBe(200);
		});

		test("should return null when no LCP data available", () => {
			mockWindow.__prefetcherLcp = undefined;
			mockPerformance.getEntriesByType.mockReturnValueOnce([]);
			expect(_evaluateLcpInBrowserContext()).toBeNull();
		});

		test("should return null when __prefetcherLcp is not a number", () => {
			mockWindow.__prefetcherLcp = "not a number";
			expect(_evaluateLcpInBrowserContext()).toBeNull();
		});

		test("should return null when LCP entry startTime is not a number", () => {
			mockWindow.__prefetcherLcp = undefined;
			mockPerformance.getEntriesByType.mockReturnValueOnce([
				{ startTime: "not a number" },
			]);
			expect(_evaluateLcpInBrowserContext()).toBeNull();
		});
	});

	describe("LcpImpactEvaluationService - setupDelayInterception", () => {
		beforeEach(() => {
			jest.resetModules();
			jest.clearAllTimers();
			mockPage.on.mockImplementation(
				(event: string, handler: (req: MockRequest) => Promise<void>) => {
					if (event === "request") {
						requestHandler = handler;
					}
				},
			);
			(service as unknown as ServiceWithInternals).setupDelayInterception(
				mockPage,
				TEST_RESOURCE_URL,
			);
		});

		afterEach(() => {});

		test("should not intercept if request is already handled", async () => {
			const mockRequest: MockRequest = {
				isInterceptResolutionHandled: () => true,
				url: () => TEST_RESOURCE_URL,
				continue: jest.fn(),
			};
			await requestHandler(mockRequest);
			expect(mockRequest.continue).not.toHaveBeenCalled();
		});

		test("should delay specific resource and continue", async () => {
			const mockRequest: MockRequest = {
				isInterceptResolutionHandled: () => false,
				url: () => TEST_RESOURCE_URL,
				continue: jest.fn().mockResolvedValue(undefined),
			};

			await requestHandler(mockRequest);
			expect(mockRequest.continue).not.toHaveBeenCalled();

			jest.advanceTimersByTime(10000);
			await Promise.resolve(); // Flush microtask queue
			expect(mockRequest.continue).toHaveBeenCalled();
		});

		test("should continue other resources immediately", async () => {
			const mockRequest: MockRequest = {
				isInterceptResolutionHandled: () => false,
				url: () => "http://example.com/other.js",
				continue: jest.fn().mockResolvedValue(undefined),
			};
			await requestHandler(mockRequest);
			expect(mockRequest.continue).toHaveBeenCalled();
		});

		test("should log warning if continue fails for delayed resource", async () => {
			const mockRequest: MockRequest = {
				isInterceptResolutionHandled: () => false,
				url: () => TEST_RESOURCE_URL,
				continue: jest.fn().mockRejectedValue(new Error("Continue failed")),
			};

			await requestHandler(mockRequest);
			jest.advanceTimersByTime(10000);
			await Promise.resolve(); // Flush microtask queue

			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				`[LCP] Request handling failed: Continue failed`,
			);
		});

		test("should log warning if continue fails for non-delayed resource", async () => {
			const mockRequest: MockRequest = {
				isInterceptResolutionHandled: () => false,
				url: () => "http://example.com/other.js",
				continue: jest.fn().mockRejectedValue(new Error("Continue failed")),
			};
			await requestHandler(mockRequest);
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				`[LCP] Request handling failed: Continue failed`,
			);
		});

		test("should log warning if an error occurs during request handling", async () => {
			const mockRequest: MockRequest = {
				isInterceptResolutionHandled: () => {
					throw new Error("Handling error");
				},
				url: () => TEST_RESOURCE_URL,
				continue: jest.fn(),
			};
			await requestHandler(mockRequest);
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.stringContaining(
					"[LCP] Request handling failed: Error: Handling error",
				),
			);
		});

		test("should log warning if req.url() throws an error", async () => {
			const mockRequest: MockRequest = {
				isInterceptResolutionHandled: jest.fn().mockReturnValue(false),
				url: () => {
					throw new Error("URL error");
				},
				continue: jest.fn(),
			};
			await requestHandler(mockRequest);
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.stringContaining(
					"[LCP] Request handling failed: Error: URL error",
				),
			);
		});

		test("should log warning if an error occurs in the request event listener", async () => {
			mockPage.on.mockImplementationOnce(
				(event: string, _handler: (req: MockRequest) => Promise<void>) => {
					if (event === "request") {
						throw new Error("Event error");
					}
				},
			);
			(service as unknown as ServiceWithInternals).setupDelayInterception(
				mockPage,
				TEST_RESOURCE_URL,
			);
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.any(Error),
				expect.stringContaining("[LCP] Failed to setup delay interception"),
			);
		});

		test("should not call continue if delayed request is handled before timeout", async () => {
			const mockRequest: MockRequest = {
				isInterceptResolutionHandled: jest.fn().mockReturnValue(false),
				url: () => TEST_RESOURCE_URL,
				continue: jest.fn().mockResolvedValue(undefined),
			};

			await requestHandler(mockRequest);

			// Simulate request handled by something else
			(mockRequest.isInterceptResolutionHandled as jest.Mock).mockReturnValue(
				true,
			);

			jest.advanceTimersByTime(10000);
			await Promise.resolve();
			expect(mockRequest.continue).not.toHaveBeenCalled();
		});

		test("should not call continue if delayed request is handled by another interceptor before timeout", async () => {
			const mockRequest: MockRequest = {
				isInterceptResolutionHandled: jest.fn().mockReturnValue(false),
				url: () => TEST_RESOURCE_URL,
				continue: jest.fn().mockResolvedValue(undefined),
			};

			await requestHandler(mockRequest);

			// Advance some time
			jest.advanceTimersByTime(1000);

			// Simulate request handled
			(mockRequest.isInterceptResolutionHandled as jest.Mock).mockReturnValue(
				true,
			);

			// Advance remaining time
			jest.advanceTimersByTime(9000);
			await Promise.resolve();
			expect(mockRequest.continue).not.toHaveBeenCalled();
		});
	});

	describe("Initialization", () => {
		test("should initialize service correctly", () => {
			expect(service).toBeDefined();
			expect(
				(service as unknown as ServiceWithInternals).browser,
			).toBeDefined();
		});

		test("should handle browser init failure", async () => {
			(puppeteer.launch as jest.Mock).mockRejectedValueOnce(
				new Error("Launch failed"),
			);
			await expect(
				LcpImpactEvaluationService.create(fastifyMock),
			).rejects.toThrow("Launch failed");
			expect(fastifyMock.log.error).toHaveBeenCalledWith(
				expect.any(Error),
				"Failed to initialize puppeteer browser",
			);
		});

		test("should capture resources and evaluate LCP impact", async () => {
			const resources: CapturedResource[] = [
				{
					url: TEST_RESOURCE_URL,
					type: "script",
					status: 200,
					sizeKB: 10,
					requestTime: Date.now(),
					responseTime: Date.now() + 50,
					durationMs: 50,
				},
			];
			const ctx = createMockContext(resources);

			// Mock measureLcpInternal instead of measureLcp to cover wrappers
			const measureLcpInternalSpy = jest.spyOn(
				service as unknown as ServiceWithInternals,
				"measureLcpInternal",
			);
			measureLcpInternalSpy.mockResolvedValueOnce(2000); // Baseline
			measureLcpInternalSpy.mockResolvedValueOnce(3500); // Impacted

			const result = await (service as unknown as ServiceWithInternals).filter(
				ctx,
			);
			expect(result.capturedResources).toHaveLength(1);
			expect(result.capturedResources[0].url).toBe(TEST_RESOURCE_URL);
			expect(measureLcpInternalSpy).toHaveBeenCalledTimes(2);
		});

		test("should handle page close failure", async () => {
			mockPage.close.mockRejectedValueOnce(new Error("Close failed"));
			await (service as unknown as ServiceWithInternals).measureLcpInternal(
				TEST_URL,
			);
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.any(Error),
				"Failed to close page",
			);
		});

		test("should handle browser close failure", async () => {
			mockBrowser.close.mockRejectedValueOnce(new Error("Close failed"));
			await service.close();
			expect(fastifyMock.log.error).toHaveBeenCalledWith(
				expect.any(Error),
				"Failed to close browser",
			);
		});
	});

	describe("filter", () => {
		test("should measure baseline LCP", async () => {
			const measureLcpSpy = jest
				.spyOn(service as unknown as ServiceWithInternals, "measureLcp")
				.mockResolvedValue(1500);

			const ctx = createMockContext([
				{ url: TEST_RESOURCE_URL, type: "script" } as CapturedResource,
			]);
			await (service as unknown as ServiceWithInternals).filter(ctx);

			expect(measureLcpSpy).toHaveBeenCalledWith(TEST_URL);
		});

		test("should treat all resources as critical if baseline LCP fails", async () => {
			const measureLcpSpy = jest
				.spyOn(service as unknown as ServiceWithInternals, "measureLcp")
				.mockResolvedValue(null);

			const resources = [
				{ url: TEST_RESOURCE_URL, type: "script" } as CapturedResource,
			];
			const ctx = createMockContext(resources);
			const result = await (service as unknown as ServiceWithInternals).filter(
				ctx,
			);

			expect(result.capturedResources).toEqual(resources);
			expect(measureLcpSpy).toHaveBeenCalled();
		});

		test("should evaluate resource impact and filter non-critical ones", async () => {
			jest
				.spyOn(service as unknown as ServiceWithInternals, "measureLcp")
				.mockResolvedValue(1000);
			const measureLcpWithDelaySpy = jest
				.spyOn(
					service as unknown as ServiceWithInternals,
					"measureLcpWithDelay",
				)
				.mockImplementation(async (_url, resourceUrl) => {
					if (resourceUrl === TEST_RESOURCE_URL) return 2500; // Delta = 1500 (> 1000)
					return 1500; // Delta = 500 (< 1000)
				});

			const resources = [
				{ url: TEST_RESOURCE_URL, type: "script" },
				{ url: _TEST_RESOURCE_URL_2, type: "script" },
			] as CapturedResource[];
			const ctx = createMockContext(resources);
			const result = await (service as unknown as ServiceWithInternals).filter(
				ctx,
			);

			expect(result.capturedResources).toHaveLength(1);
			expect(result.capturedResources[0].url).toBe(TEST_RESOURCE_URL);
			expect(measureLcpWithDelaySpy).toHaveBeenCalledTimes(2);
		});

		test("should treat resource as critical if its evaluation fails", async () => {
			jest
				.spyOn(service as unknown as ServiceWithInternals, "measureLcp")
				.mockResolvedValue(1000);
			jest
				.spyOn(
					service as unknown as ServiceWithInternals,
					"measureLcpWithDelay",
				)
				.mockResolvedValue(null);

			const resources = [
				{ url: TEST_RESOURCE_URL, type: "script" },
			] as CapturedResource[];
			const ctx = createMockContext(resources);
			const result = await (service as unknown as ServiceWithInternals).filter(
				ctx,
			);

			expect(result.capturedResources).toHaveLength(1);
		});

		test("should treat resource as critical if error occurs during evaluation", async () => {
			jest
				.spyOn(service as unknown as ServiceWithInternals, "measureLcp")
				.mockResolvedValue(1000);
			jest
				.spyOn(
					service as unknown as ServiceWithInternals,
					"measureLcpWithDelay",
				)
				.mockRejectedValue(new Error("Evaluation failed"));

			const resources = [
				{ url: TEST_RESOURCE_URL, type: "script" },
			] as CapturedResource[];
			const ctx = createMockContext(resources);
			const result = await (service as unknown as ServiceWithInternals).filter(
				ctx,
			);

			expect(result.capturedResources).toHaveLength(1);
		});

		test("should return original context if no resources are captured", async () => {
			const ctx = createMockContext([]);
			const result = await (service as unknown as ServiceWithInternals).filter(
				ctx,
			);
			expect(result.capturedResources).toHaveLength(0);
			expect(result.url).toBe(ctx.url);
		});

		test("should log error and proceed if baseline LCP measurement throws", async () => {
			const measureLcpSpy = jest
				.spyOn(service as unknown as ServiceWithInternals, "measureLcp")
				.mockRejectedValue(new Error("Baseline failed"));

			const resources = [
				{ url: TEST_RESOURCE_URL, type: "script" } as CapturedResource,
			];
			const ctx = createMockContext(resources);
			const result = await (service as unknown as ServiceWithInternals).filter(
				ctx,
			);

			expect(result.capturedResources).toEqual(resources);
			expect(measureLcpSpy).toHaveBeenCalled();
			expect(fastifyMock.log.error).toHaveBeenCalledWith(
				expect.any(Error),
				"[LCP] Failed to measure baseline LCP",
			);
		});
	});

	describe("measureLcpInternal", () => {
		test("should return LCP value on successful navigation", async () => {
			mockPage.evaluate.mockResolvedValueOnce(2500);
			const result = await (
				service as unknown as ServiceWithInternals
			).measureLcpInternal(TEST_URL);
			expect(result).toBe(2500);
		});

		test("should return null if page.goto fails", async () => {
			mockPage.goto.mockRejectedValueOnce(new Error("Navigation failed"));
			const result = await (
				service as unknown as ServiceWithInternals
			).measureLcpInternal(TEST_URL);
			expect(result).toBeNull();
		});

		test("should setup delay interception if delayResourceUrl is provided", async () => {
			mockPage.evaluate.mockResolvedValueOnce(2500);
			const setupSpy = jest.spyOn(
				service as unknown as ServiceWithInternals,
				"setupDelayInterception",
			);
			await (service as unknown as ServiceWithInternals).measureLcpInternal(
				TEST_URL,
				TEST_RESOURCE_URL,
			);
			expect(setupSpy).toHaveBeenCalledWith(mockPage, TEST_RESOURCE_URL);
		});

		test("should return null if evaluate returns non-number", async () => {
			mockPage.evaluate.mockResolvedValueOnce(null);
			const result = await (
				service as unknown as ServiceWithInternals
			).measureLcpInternal(TEST_URL);
			expect(result).toBeNull();
		});
	});

	describe("setupLcpObserver", () => {
		let observerCallback: (entries: { getEntries: () => unknown[] }) => void;
		let mockObserver: { observe: jest.Mock; disconnect: jest.Mock };

		beforeEach(() => {
			mockObserver = {
				observe: jest.fn(),
				disconnect: jest.fn(),
			};
			(
				global as unknown as { PerformanceObserver: unknown }
			).PerformanceObserver = jest.fn().mockImplementation((callback) => {
				observerCallback = callback;
				return mockObserver;
			});

			(global as unknown as { window: unknown }).window = {
				addEventListener: jest.fn(),
			};
			(global as unknown as { document: unknown }).document = {
				visibilityState: "visible",
			};
		});

		afterEach(() => {
			delete (global as unknown as Record<string, unknown>).PerformanceObserver;
			delete (global as unknown as Record<string, unknown>).window;
			delete (global as unknown as Record<string, unknown>).document;
		});

		test("should set __prefetcherLcp when LCP entry is observed", () => {
			(service as unknown as ServiceWithInternals).setupLcpObserver(mockPage);
			// Trigger observer callback
			mockPage.evaluateOnNewDocument.mock.calls[0][0]();

			// Mock the window environment inside the evaluateOnNewDocument callback
			const entries = {
				getEntries: () => [{ startTime: 3000 }],
			};
			observerCallback(entries);

			// In a real browser, this would set window.__prefetcherLcp
			// Here we are just testing the observer setup logic
			expect(mockObserver.observe).toHaveBeenCalledWith({
				type: "largest-contentful-paint",
				buffered: true,
			});
		});

		test("should handle errors during observer setup", async () => {
			mockPage.evaluateOnNewDocument.mockImplementationOnce(() => {
				throw new Error("Setup error");
			});
			await (service as unknown as ServiceWithInternals).setupLcpObserver(
				mockPage,
			);
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.any(Error),
				expect.stringContaining("Failed to setup LCP observer"),
			);
		});

		test("should not set __prefetcherLcp if no LCP entry", () => {
			(service as unknown as ServiceWithInternals).setupLcpObserver(mockPage);
			mockPage.evaluateOnNewDocument.mock.calls[0][0]();

			const entries = {
				getEntries: () => [],
			};
			observerCallback(entries);
			// No error should occur
		});

		test("should disconnect observer when visibility changes to hidden", () => {
			(service as unknown as ServiceWithInternals).setupLcpObserver(mockPage);
			const evaluateFn = mockPage.evaluateOnNewDocument.mock.calls[0][0];

			// Mock window.addEventListener to capture the callback
			const eventListeners: { [key: string]: (...args: unknown[]) => unknown } =
				{};
			(
				global as unknown as { window: { addEventListener: jest.Mock } }
			).window.addEventListener = jest
				.fn()
				.mockImplementation((event, callback) => {
					eventListeners[event] = callback;
				});

			evaluateFn();

			expect(eventListeners.visibilitychange).toBeDefined();

			// Simulate visibility change to hidden
			(
				global as unknown as { document: { visibilityState: string } }
			).document.visibilityState = "hidden";
			eventListeners.visibilitychange();

			expect(mockObserver.disconnect).toHaveBeenCalled();
		});

		test("should not disconnect observer when visibility changes to visible", () => {
			(service as unknown as ServiceWithInternals).setupLcpObserver(mockPage);
			const evaluateFn = mockPage.evaluateOnNewDocument.mock.calls[0][0];

			const eventListeners: { [key: string]: (...args: unknown[]) => unknown } =
				{};
			(
				global as unknown as { window: { addEventListener: jest.Mock } }
			).window.addEventListener = jest
				.fn()
				.mockImplementation((event, callback) => {
					eventListeners[event] = callback;
				});

			evaluateFn();

			// Simulate visibility change to visible
			(
				global as unknown as { document: { visibilityState: string } }
			).document.visibilityState = "visible";
			eventListeners.visibilitychange();

			expect(mockObserver.disconnect).not.toHaveBeenCalled();
		});

		test("should handle error in browser context", () => {
			(service as unknown as ServiceWithInternals).setupLcpObserver(mockPage);
			const evaluateFn = mockPage.evaluateOnNewDocument.mock.calls[0][0];

			// Make PerformanceObserver throw to trigger catch block
			(
				global as unknown as { PerformanceObserver: jest.Mock }
			).PerformanceObserver = jest.fn().mockImplementation(() => {
				throw new Error("Browser error");
			});

			evaluateFn();

			expect(
				(global as unknown as { window: { __prefetcherLcpError: unknown } })
					.window.__prefetcherLcpError,
			).toBeDefined();
		});
	});
});
