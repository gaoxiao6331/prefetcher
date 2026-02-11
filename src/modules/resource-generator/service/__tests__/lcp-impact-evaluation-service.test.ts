import type { FastifyInstance } from "fastify";
import type { HTTPResponse } from "puppeteer";
import puppeteer from "puppeteer";
import type { CapturedResource, GenerateContext } from "../../type";
import LcpImpactEvaluationService from "../lcp-impact-evaluation-service";

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

jest.mock("@/utils/is", () => ({
	isDebugMode: jest.fn().mockReturnValue(false),
}));

import { isDebugMode } from "@/utils/is";

// Test constants
const TEST_URL = "http://example.com";
const TEST_RESOURCE_URL = "http://example.com/script.js";
const _TEST_RESOURCE_URL_2 = "http://example.com/style.css";
const _LCP_THRESHOLD = 1000;

// Helper function to create mock page
function createMockPage() {
	const handlers = new Map<string, Set<(...args: unknown[]) => unknown>>();
	const mock = {
		on: jest.fn(),
		off: jest.fn(),
		emit: (event: string, ...args: unknown[]) => {
			const set = handlers.get(event);
			if (set) {
				for (const h of set) {
					h(...args);
				}
			}
		},
		goto: jest.fn().mockResolvedValue(undefined),
		evaluate: jest.fn(),
		evaluateOnNewDocument: jest.fn(),
		setRequestInterception: jest.fn(),
		setCacheEnabled: jest.fn(),
		bringToFront: jest.fn(),
		waitForFunction: jest.fn(),
		isClosed: jest.fn().mockReturnValue(false),
		close: jest.fn(),
	};

	mock.on.mockImplementation(
		(event: string, handler: (...args: unknown[]) => unknown) => {
			const set = handlers.get(event);
			if (set) {
				set.add(handler);
			} else {
				handlers.set(event, new Set([handler]));
			}
			return mock;
		},
	);

	mock.off.mockImplementation(
		(event: string, handler: (...args: unknown[]) => unknown) => {
			handlers.get(event)?.delete(handler);
			return mock;
		},
	);

	return mock;
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
	normalizeUrl: (url: string) => string;
	LCP_IMPACT_THRESHOLD_MS: number;
	_checkLcpStatus: () => boolean;
	_getLcpResult: () => { lcp: number | null; error: string | null };
};

interface MockRequest {
	isInterceptResolutionHandled: () => boolean;
	url: () => string;
	resourceType: () => string;
	continue: jest.Mock;
	abort?: jest.Mock;
}

// Helper function to create mock Fastify instance
function createMockFastify(): FastifyInstance {
	const log = {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	};
	return {
		log,
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

	describe("setupLcpObserver (coverage)", () => {
		test("should do nothing if largest-contentful-paint is not supported", async () => {
			let scriptFn: () => void = () => {};
			mockPage.evaluateOnNewDocument.mockImplementation((fn: () => void) => {
				scriptFn = fn;
			});

			await (service as unknown as ServiceWithInternals).setupLcpObserver(
				mockPage,
			);

			const mockWindow: Record<string, unknown> & {
				__prefetcherLcp?: number;
			} = {
				PerformanceObserver: {
					supportedEntryTypes: ["other-entry-type"],
				},
			};
			const originalWindow = global.window;
			(global as unknown as Record<string, unknown>).window = mockWindow;

			try {
				scriptFn();
				expect(mockWindow.__prefetcherLcp).toBeNull();
			} finally {
				(global as unknown as Record<string, unknown>).window = originalWindow;
			}
		});

		test("should handle missing PerformanceObserver.supportedEntryTypes", async () => {
			let scriptFn: () => void = () => {};
			mockPage.evaluateOnNewDocument.mockImplementation((fn: () => void) => {
				scriptFn = fn;
			});

			await (service as unknown as ServiceWithInternals).setupLcpObserver(
				mockPage,
			);

			const mockWindow: Record<string, unknown> & {
				__prefetcherLcp?: number;
			} = {
				PerformanceObserver: {
					supportedEntryTypes: null as unknown as string[],
				},
			};
			const originalWindow = global.window;
			(global as unknown as Record<string, unknown>).window = mockWindow;

			try {
				scriptFn();
				expect(mockWindow.__prefetcherLcp).toBeNull();
			} finally {
				(global as unknown as Record<string, unknown>).window = originalWindow;
			}
		});
	});

	afterEach(async () => {
		(service as unknown as ServiceWithInternals).browser = null;
		await service.close();
	});

	describe("LcpImpactEvaluationService - setupDelayInterception", () => {
		beforeEach(() => {
			mockPage.on.mockImplementation(
				(event: string, handler: (req: MockRequest) => Promise<void>) => {
					if (event === "request") {
						requestHandler = handler;
					}
					return mockPage;
				},
			);
			(service as unknown as ServiceWithInternals).setupDelayInterception(
				mockPage,
				TEST_RESOURCE_URL,
			);
		});

		afterEach(() => {
			// No need to call useRealTimers here as it's handled at top level
		});

		test("should not intercept if request is already handled", async () => {
			const mockRequest: MockRequest = {
				isInterceptResolutionHandled: () => true,
				url: () => TEST_RESOURCE_URL,
				resourceType: () => "script",
				continue: jest.fn(),
			};
			await requestHandler(mockRequest);
			expect(mockRequest.continue).not.toHaveBeenCalled();
		});

		test("should delay specific resource and continue", async () => {
			const mockRequest: MockRequest = {
				isInterceptResolutionHandled: () => false,
				url: () => TEST_RESOURCE_URL,
				resourceType: () => "script",
				continue: jest.fn().mockResolvedValue(undefined),
			};

			await requestHandler(mockRequest);
			expect(mockRequest.continue).not.toHaveBeenCalled();

			jest.advanceTimersByTime(20000);
			await Promise.resolve(); // Flush microtask queue
			expect(mockRequest.continue).toHaveBeenCalled();
		});

		test("should continue other resources immediately", async () => {
			const mockRequest: MockRequest = {
				isInterceptResolutionHandled: () => false,
				url: () => "http://example.com/other.js",
				resourceType: () => "script",
				continue: jest.fn().mockResolvedValue(undefined),
			};
			await requestHandler(mockRequest);
			expect(mockRequest.continue).toHaveBeenCalled();
		});

		test("should log warning if continue fails for delayed resource", async () => {
			const mockRequest: MockRequest = {
				isInterceptResolutionHandled: () => false,
				url: () => TEST_RESOURCE_URL,
				resourceType: () => "script",
				continue: jest.fn().mockRejectedValue(new Error("Continue failed")),
			};

			await requestHandler(mockRequest);
			jest.advanceTimersByTime(20000);
			await Promise.resolve(); // Flush microtask queue

			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.stringMatching(
					/\[LCP\] Request handling failed for delayed resource: Continue failed/,
				),
			);
		});

		test("should silently handle continue failure for non-delayed resource", async () => {
			const mockRequest: MockRequest = {
				isInterceptResolutionHandled: () => false,
				url: () => "http://example.com/other.js",
				resourceType: () => "script",
				continue: jest.fn().mockRejectedValue(new Error("Continue failed")),
			};
			await requestHandler(mockRequest);
			expect(fastifyMock.log.warn).not.toHaveBeenCalled();
		});

		test("should log warning if an error occurs during request handling", async () => {
			const mockRequest: MockRequest = {
				isInterceptResolutionHandled: () => {
					throw new Error("Handling error");
				},
				url: () => TEST_RESOURCE_URL,
				resourceType: () => "script",
				continue: jest.fn(),
			};
			await requestHandler(mockRequest);
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.stringContaining(
					"[LCP] Request listener error: Error: Handling error",
				),
			);
		});

		test("should log warning if req.url() throws an error", async () => {
			const mockRequest: MockRequest = {
				isInterceptResolutionHandled: jest.fn().mockReturnValue(false),
				url: () => {
					throw new Error("URL error");
				},
				resourceType: () => "script",
				continue: jest.fn(),
			};
			await requestHandler(mockRequest);
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.stringMatching(
					/\[LCP\] Request listener error: Error: URL error/,
				),
			);
		});

		test("should log warning if an error occurs in the request event listener", async () => {
			mockPage.on.mockImplementationOnce(
				(event: string, _handler: (req: MockRequest) => Promise<void>) => {
					if (event === "request") {
						throw new Error("Event error");
					}
					return mockPage;
				},
			);
			await (service as unknown as ServiceWithInternals).setupDelayInterception(
				mockPage,
				TEST_RESOURCE_URL,
			);
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.any(Error),
				"[LCP] Failed to set up delay interception",
			);
		});

		test("should not call continue if delayed request is handled before timeout", async () => {
			const mockRequest: MockRequest = {
				isInterceptResolutionHandled: jest.fn().mockReturnValue(false),
				url: () => TEST_RESOURCE_URL,
				resourceType: () => "script",
				continue: jest.fn().mockResolvedValue(undefined),
			};

			await requestHandler(mockRequest);

			// Simulate request handled by something else
			(mockRequest.isInterceptResolutionHandled as jest.Mock).mockReturnValue(
				true,
			);

			jest.advanceTimersByTime(20000);
			await Promise.resolve();
			expect(mockRequest.continue).not.toHaveBeenCalled();
		});

		test("should not call continue if delayed request is handled by another interceptor before timeout", async () => {
			const mockRequest: MockRequest = {
				isInterceptResolutionHandled: jest.fn().mockReturnValue(false),
				url: () => TEST_RESOURCE_URL,
				resourceType: () => "script",
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
			jest.advanceTimersByTime(19000);
			await Promise.resolve();
			expect(mockRequest.continue).not.toHaveBeenCalled();
		});

		test("should not call continue if request is already handled before entering the listener", async () => {
			const mockRequest: MockRequest = {
				isInterceptResolutionHandled: () => true,
				url: () => TEST_RESOURCE_URL,
				resourceType: () => "script",
				continue: jest.fn().mockResolvedValue(undefined),
			};

			await requestHandler(mockRequest);
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
			measureLcpInternalSpy.mockResolvedValueOnce(25000); // Critical (> 20000 * 0.9)

			const result = await (service as unknown as ServiceWithInternals).filter(
				ctx,
			);
			expect(result.capturedResources).toHaveLength(1);
			expect(result.capturedResources[0].url).toBe(TEST_RESOURCE_URL);
			expect(measureLcpInternalSpy).toHaveBeenCalledTimes(1);
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
		test("should evaluate resource impact and filter non-critical ones", async () => {
			const measureLcpInternalSpy = jest
				.spyOn(service as unknown as ServiceWithInternals, "measureLcpInternal")
				.mockImplementation(async (_url, resourceUrl) => {
					if (resourceUrl === TEST_RESOURCE_URL) return 25000; // Critical (> 10000 * 0.9)
					return 5000; // Not critical
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
			expect(measureLcpInternalSpy).toHaveBeenCalledTimes(2);
		});

		test("should treat resource as critical if its evaluation fails", async () => {
			jest
				.spyOn(service as unknown as ServiceWithInternals, "measureLcpInternal")
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
				.spyOn(service as unknown as ServiceWithInternals, "measureLcpInternal")
				.mockRejectedValue(new Error("Evaluation failed"));

			const resources = [
				{ url: TEST_RESOURCE_URL, type: "script" },
			] as CapturedResource[];
			const ctx = createMockContext(resources);
			const result = await (service as unknown as ServiceWithInternals).filter(
				ctx,
			);

			expect(result.capturedResources).toHaveLength(1);
			expect(fastifyMock.log.error).toHaveBeenCalled();
		});

		test("should return original context if no resources are captured", async () => {
			const ctx = createMockContext([]);
			const result = await (service as unknown as ServiceWithInternals).filter(
				ctx,
			);
			expect(result).toBe(ctx);
		});

		test("should skip impact evaluation for main document", async () => {
			const resources = [
				{ url: TEST_URL, type: "document" },
			] as CapturedResource[];
			const ctx = createMockContext(resources);

			const measureSpy = jest.spyOn(
				service as unknown as ServiceWithInternals,
				"measureLcpInternal",
			);

			const result = await (service as unknown as ServiceWithInternals).filter(
				ctx,
			);
			expect(result.capturedResources).toHaveLength(1);
			expect(measureSpy).not.toHaveBeenCalled();
		});
	});

	describe("measureLcpInternal", () => {
		beforeEach(() => {
			jest.useRealTimers();
			// Mock default successful behavior for all async calls
			mockPage.goto.mockResolvedValue(undefined);
			mockPage.waitForFunction.mockResolvedValue(undefined);
			mockPage.evaluate.mockResolvedValue({ lcp: 2500, error: null });
			mockPage.close.mockResolvedValue(undefined);
			mockPage.bringToFront.mockResolvedValue(undefined);
			mockPage.setCacheEnabled.mockResolvedValue(undefined);
		});

		afterEach(() => {
			jest.useFakeTimers();
		});

		test("should return LCP value on successful navigation", async () => {
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
			expect(fastifyMock.log.error).toHaveBeenCalledWith(
				expect.any(Error),
				expect.stringContaining("Failed to navigate to page"),
			);
		});

		test("should setup delay interception if delayResourceUrl is provided", async () => {
			const setupSpy = jest.spyOn(
				service as unknown as ServiceWithInternals,
				"setupDelayInterception",
			);

			const result = await (
				service as unknown as ServiceWithInternals
			).measureLcpInternal(TEST_URL, TEST_RESOURCE_URL);

			expect(result).toBe(2500);
			expect(setupSpy).toHaveBeenCalledWith(mockPage, TEST_RESOURCE_URL);
		});

		test("should handle LCP measurement failure and return diagnostics", async () => {
			mockPage.evaluate.mockResolvedValueOnce({
				lcp: null,
				error: "LCP not found",
			});

			const result = await (
				service as unknown as ServiceWithInternals
			).measureLcpInternal(TEST_URL);

			expect(result).toBeNull();
			expect(fastifyMock.log.error).toHaveBeenCalledWith(
				expect.stringContaining(
					"Browser-side error during LCP observation: LCP not found",
				),
			);
		});

		test("should handle page close failure", async () => {
			mockPage.close.mockRejectedValueOnce(new Error("Close failed"));

			const result = await (
				service as unknown as ServiceWithInternals
			).measureLcpInternal(TEST_URL);
			expect(result).toBe(2500);
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.any(Error),
				"Failed to close page",
			);
		});

		test("should not close page in debug mode", async () => {
			(isDebugMode as jest.Mock).mockReturnValue(true);
			try {
				await (service as unknown as ServiceWithInternals).measureLcpInternal(
					TEST_URL,
				);
				expect(mockPage.close).not.toHaveBeenCalled();
			} finally {
				(isDebugMode as jest.Mock).mockReturnValue(false);
			}
		});

		test("should return diagnostics if LCP measurement times out", async () => {
			mockPage.waitForFunction.mockRejectedValue(new Error("Timeout"));
			mockPage.evaluate.mockResolvedValueOnce({
				lcp: null,
				error: "LCP Timeout",
			});

			const result = await (
				service as unknown as ServiceWithInternals
			).measureLcpInternal(TEST_URL);
			expect(result).toBeNull();
			expect(fastifyMock.log.debug).toHaveBeenCalledWith(
				expect.stringContaining("Timeout waiting for LCP value"),
			);
		});

		test("should return LCP if found even after timeout", async () => {
			mockPage.waitForFunction.mockRejectedValue(new Error("Timeout"));
			mockPage.evaluate.mockResolvedValueOnce({
				lcp: 5000,
				error: null,
			});

			const result = await (
				service as unknown as ServiceWithInternals
			).measureLcpInternal(TEST_URL);
			expect(result).toBe(5000);
		});

		test("should handle LCP error in result", async () => {
			mockPage.evaluate.mockResolvedValueOnce({
				lcp: null,
				error: "Script Error",
			});

			const result = await (
				service as unknown as ServiceWithInternals
			).measureLcpInternal(TEST_URL);
			expect(result).toBeNull();
			expect(fastifyMock.log.error).toHaveBeenCalledWith(
				expect.stringContaining(
					"Browser-side error during LCP observation: Script Error",
				),
			);
		});

		test("should return null if finalLcp is not a number", async () => {
			mockPage.evaluate.mockResolvedValueOnce({
				lcp: "not a number",
				error: null,
			});

			const result = await (
				service as unknown as ServiceWithInternals
			).measureLcpInternal(TEST_URL);
			expect(result).toBeNull();
		});
	});

	describe("setupDelayInterception - response monitoring", () => {
		test("should log warning for error response", async () => {
			let responseHandler: (res: unknown) => void = () => {};
			mockPage.on.mockImplementation(
				(event: string, handler: (...args: unknown[]) => unknown) => {
					if (event === "response") responseHandler = handler;
					return mockPage;
				},
			);

			await (service as unknown as ServiceWithInternals).setupDelayInterception(
				mockPage,
				TEST_RESOURCE_URL,
			);

			const mockResponse = {
				status: () => 404,
				url: () => "http://example.com/missing.js",
				request: () => ({
					resourceType: () => "script",
				}),
			};

			responseHandler(mockResponse);

			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.stringContaining("[LCP] Browser resource error: 404"),
			);
		});

		test("should log warning for redirect response", async () => {
			let responseHandler: (res: unknown) => void = () => {};
			mockPage.on.mockImplementation(
				(event: string, handler: (...args: unknown[]) => unknown) => {
					if (event === "response") responseHandler = handler;
					return mockPage;
				},
			);

			const normalizedUrl = (
				service as unknown as ServiceWithInternals
			).normalizeUrl(TEST_RESOURCE_URL);

			await (service as unknown as ServiceWithInternals).setupDelayInterception(
				mockPage,
				normalizedUrl,
			);

			const mockResponse = {
				status: () => 302,
				url: () => "http://example.com/redirect.js",
				request: () => ({
					resourceType: () => "script",
				}),
			};

			responseHandler(mockResponse);

			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.stringContaining("[LCP] Browser resource redirect: 302"),
			);
		});

		test("should log debug for successful response", async () => {
			let responseHandler: (res: unknown) => void = () => {};
			mockPage.on.mockImplementation(
				(event: string, handler: (...args: unknown[]) => unknown) => {
					if (event === "response") responseHandler = handler;
					return mockPage;
				},
			);

			const normalizedUrl = (
				service as unknown as ServiceWithInternals
			).normalizeUrl(TEST_RESOURCE_URL);

			await (service as unknown as ServiceWithInternals).setupDelayInterception(
				mockPage,
				normalizedUrl,
			);

			const mockResponse = {
				status: () => 200,
				url: () => "http://example.com/found.js",
				request: () => ({
					resourceType: () => "script",
				}),
			};

			responseHandler(mockResponse);

			expect(fastifyMock.log.debug).toHaveBeenCalledWith(
				expect.stringContaining("[LCP] Browser resource success: 200"),
			);
		});
	});

	describe("normalizeUrl", () => {
		test("should return original URL if parsing fails", () => {
			const result = (service as unknown as ServiceWithInternals).normalizeUrl(
				"invalid-url",
			);
			expect(result).toBe("invalid-url");
		});

		test("should remove hash from URL", () => {
			const result = (service as unknown as ServiceWithInternals).normalizeUrl(
				"http://example.com/#hash",
			);
			expect(result).toBe("http://example.com/");
		});
	});

	describe("setupLcpObserver (internal logic)", () => {
		test("should handle script execution error in evaluateOnNewDocument", async () => {
			let scriptFn: () => void = () => {};
			mockPage.evaluateOnNewDocument.mockImplementation((fn: () => void) => {
				scriptFn = fn;
			});

			await (service as unknown as ServiceWithInternals).setupLcpObserver(
				mockPage,
			);

			// Mock window to throw error when PerformanceObserver is accessed
			const mockWindow: Record<string, unknown> & {
				__prefetcherLcpError?: Error;
			} = {};
			Object.defineProperty(mockWindow, "PerformanceObserver", {
				get: () => {
					throw new Error("Observer Error");
				},
			});

			const originalWindow = global.window;
			(global as unknown as Record<string, unknown>).window = mockWindow;

			try {
				scriptFn();
				expect(mockWindow.__prefetcherLcpError).toBeDefined();
				expect(mockWindow.__prefetcherLcpError?.message).toBe("Observer Error");
			} finally {
				(global as unknown as Record<string, unknown>).window = originalWindow;
			}
		});

		test("should record LCP from PerformanceObserver", async () => {
			let scriptFn: () => void = () => {};
			let observerCallback: (list: {
				getEntries: () => Array<{ renderTime?: number; startTime?: number }>;
			}) => void = () => {};

			mockPage.evaluateOnNewDocument.mockImplementation((fn: () => void) => {
				scriptFn = fn;
			});

			await (service as unknown as ServiceWithInternals).setupLcpObserver(
				mockPage,
			);

			class MockPerformanceObserver {
				constructor(
					cb: (list: {
						getEntries: () => Array<{
							renderTime?: number;
							startTime?: number;
						}>;
					}) => void,
				) {
					observerCallback = cb;
				}
				observe() {}
			}
			(
				MockPerformanceObserver as unknown as Record<string, unknown>
			).supportedEntryTypes = ["largest-contentful-paint"];

			const mockWindow: Record<string, unknown> & {
				__prefetcherLcp?: number;
			} = {
				PerformanceObserver: MockPerformanceObserver,
			};

			const originalWindow = global.window;
			const originalPerformanceObserver = global.PerformanceObserver;
			(global as unknown as Record<string, unknown>).window = mockWindow;
			(global as unknown as Record<string, unknown>).PerformanceObserver =
				MockPerformanceObserver;

			try {
				scriptFn();

				// Simulate observer callback
				const mockEntry = {
					renderTime: 1234.56,
				};
				observerCallback({
					getEntries: () => [mockEntry],
				});

				expect(mockWindow.__prefetcherLcp).toBe(1234.56);

				// Simulate another entry with startTime (fallback)
				const mockEntry2 = {
					startTime: 2345.67,
				};
				observerCallback({
					getEntries: () => [mockEntry, mockEntry2],
				});
				expect(mockWindow.__prefetcherLcp).toBe(2345.67);

				// Simulate entry with no value
				const mockEntry3 = {};
				observerCallback({
					getEntries: () => [mockEntry3],
				});
				expect(mockWindow.__prefetcherLcp).toBe(2345.67); // Should keep last valid value or not crash
			} finally {
				(global as unknown as Record<string, unknown>).window = originalWindow;
				(global as unknown as Record<string, unknown>).PerformanceObserver =
					originalPerformanceObserver;
			}
		});
	});

	describe("setupLcpObserver", () => {
		test("should call evaluateOnNewDocument", async () => {
			await (service as unknown as ServiceWithInternals).setupLcpObserver(
				mockPage,
			);
			expect(mockPage.evaluateOnNewDocument).toHaveBeenCalled();
		});

		test("should handle setup error", async () => {
			mockPage.evaluateOnNewDocument.mockRejectedValue(
				new Error("Setup failed"),
			);
			await (service as unknown as ServiceWithInternals).setupLcpObserver(
				mockPage,
			);
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.any(Error),
				"[LCP] Failed to set up LCP observer",
			);
		});

		test("should handle unsupported PerformanceObserver", async () => {
			let scriptFn: () => void = () => {};
			mockPage.evaluateOnNewDocument.mockImplementation((fn: () => void) => {
				scriptFn = fn;
			});

			await (service as unknown as ServiceWithInternals).setupLcpObserver(
				mockPage,
			);

			// Test case 1: PerformanceObserver is missing
			const mockWindow1: Record<string, unknown> = {
				PerformanceObserver: undefined,
			};
			const originalWindow = global.window;
			(global as unknown as Record<string, unknown>).window = mockWindow1;
			try {
				scriptFn();
				expect(mockWindow1.__prefetcherLcp).toBeNull();
			} finally {
				(global as unknown as Record<string, unknown>).window = originalWindow;
			}

			// Test case 2: supportedEntryTypes is missing
			const mockWindow2: Record<string, unknown> = {
				PerformanceObserver: {},
			};
			(global as unknown as Record<string, unknown>).window = mockWindow2;
			try {
				scriptFn();
				expect(mockWindow2.__prefetcherLcp).toBeNull();
			} finally {
				(global as unknown as Record<string, unknown>).window = originalWindow;
			}

			// Test case 3: largest-contentful-paint not in supportedEntryTypes
			const mockWindow3: Record<string, unknown> = {
				PerformanceObserver: {
					supportedEntryTypes: ["other-entry-type"],
				},
			};
			(global as unknown as Record<string, unknown>).window = mockWindow3;
			try {
				scriptFn();
				expect(mockWindow3.__prefetcherLcp).toBeNull();
			} finally {
				(global as unknown as Record<string, unknown>).window = originalWindow;
			}
		});

		test("should handle PerformanceObserver error in script", async () => {
			let scriptFn: () => void = () => {};
			mockPage.evaluateOnNewDocument.mockImplementation((fn: () => void) => {
				scriptFn = fn;
			});

			await (service as unknown as ServiceWithInternals).setupLcpObserver(
				mockPage,
			);

			// Mock global window to throw error
			const mockWindow: Record<string, unknown> & {
				__prefetcherLcpError?: Error;
			} = {
				get PerformanceObserver() {
					throw new Error("Observer error");
				},
			};
			const originalWindow = global.window;
			(global as unknown as Record<string, unknown>).window = mockWindow;

			try {
				scriptFn();
				expect(mockWindow.__prefetcherLcpError).toBeDefined();
			} finally {
				(global as unknown as Record<string, unknown>).window = originalWindow;
			}
		});

		test("should handle PerformanceObserver entry correctly", async () => {
			let observerCallback: (entryList: {
				getEntries: () => Array<{ renderTime?: number; startTime?: number }>;
			}) => void = () => {};
			const mockObserver = {
				observe: jest.fn(),
			};

			let scriptFn: () => void = () => {};
			mockPage.evaluateOnNewDocument.mockImplementation((fn: () => void) => {
				scriptFn = fn;
			});

			await (service as unknown as ServiceWithInternals).setupLcpObserver(
				mockPage,
			);

			// Mock global window and PerformanceObserver
			const mockWindow: Record<string, unknown> & {
				__prefetcherLcp?: number;
				PerformanceObserver: jest.Mock & { supportedEntryTypes?: string[] };
			} = {
				PerformanceObserver: jest.fn().mockImplementation((cb) => {
					observerCallback = cb;
					return mockObserver;
				}),
			};
			mockWindow.PerformanceObserver.supportedEntryTypes = [
				"largest-contentful-paint",
			];

			const originalWindow = global.window;
			const originalPO = global.PerformanceObserver;
			(global as unknown as Record<string, unknown>).window = mockWindow;
			(global as unknown as Record<string, unknown>).PerformanceObserver =
				mockWindow.PerformanceObserver;

			try {
				scriptFn();

				// Simulate entry
				observerCallback({
					getEntries: () => [{ renderTime: 1234 }],
				});
				expect(mockWindow.__prefetcherLcp).toBe(1234);

				// Simulate entry with startTime only
				observerCallback({
					getEntries: () => [{ renderTime: 0, startTime: 5678 }],
				});
				expect(mockWindow.__prefetcherLcp).toBe(5678);
			} finally {
				(global as unknown as Record<string, unknown>).window = originalWindow;
				(global as unknown as Record<string, unknown>).PerformanceObserver =
					originalPO;
			}
		});

		test("should handle missing entry in PerformanceObserver callback", async () => {
			let scriptFn: () => void = () => {};
			mockPage.evaluateOnNewDocument.mockImplementation((fn: () => void) => {
				scriptFn = fn;
			});

			await (service as unknown as ServiceWithInternals).setupLcpObserver(
				mockPage,
			);

			let observerCallback: (list: {
				getEntries: () => Array<{ renderTime?: unknown; startTime?: unknown }>;
			}) => void = () => {};
			const mockWindow: Record<string, unknown> & {
				__prefetcherLcp?: number;
				PerformanceObserver: jest.Mock & { supportedEntryTypes?: string[] };
			} = {
				PerformanceObserver: jest.fn().mockImplementation((cb) => {
					observerCallback = cb;
					return { observe: jest.fn() };
				}),
			};
			mockWindow.PerformanceObserver.supportedEntryTypes = [
				"largest-contentful-paint",
			];

			const originalWindow = global.window;
			const originalPO = global.PerformanceObserver;
			(global as unknown as Record<string, unknown>).window = mockWindow;
			(global as unknown as Record<string, unknown>).PerformanceObserver =
				mockWindow.PerformanceObserver;

			try {
				scriptFn();
				// Call with empty list
				observerCallback({ getEntries: () => [] });
				expect(mockWindow.__prefetcherLcp).toBeNull();
			} finally {
				(global as unknown as Record<string, unknown>).window = originalWindow;
				(global as unknown as Record<string, unknown>).PerformanceObserver =
					originalPO;
			}
		});

		test("should handle non-number value in PerformanceObserver callback", async () => {
			let scriptFn: () => void = () => {};
			mockPage.evaluateOnNewDocument.mockImplementation((fn: () => void) => {
				scriptFn = fn;
			});

			await (service as unknown as ServiceWithInternals).setupLcpObserver(
				mockPage,
			);

			let observerCallback: (list: {
				getEntries: () => Array<{ renderTime?: unknown; startTime?: unknown }>;
			}) => void = () => {};
			const mockWindow: Record<string, unknown> & {
				__prefetcherLcp?: number;
				PerformanceObserver: jest.Mock & { supportedEntryTypes?: string[] };
			} = {
				PerformanceObserver: jest.fn().mockImplementation((cb) => {
					observerCallback = cb;
					return { observe: jest.fn() };
				}),
			};
			mockWindow.PerformanceObserver.supportedEntryTypes = [
				"largest-contentful-paint",
			];

			const originalWindow = global.window;
			const originalPO = global.PerformanceObserver;
			(global as unknown as Record<string, unknown>).window = mockWindow;
			(global as unknown as Record<string, unknown>).PerformanceObserver =
				mockWindow.PerformanceObserver;

			try {
				scriptFn();
				// Call with invalid value
				observerCallback({
					getEntries: () => [{ renderTime: "invalid" }],
				});
				expect(mockWindow.__prefetcherLcp).toBeNull();
			} finally {
				(global as unknown as Record<string, unknown>).window = originalWindow;
				(global as unknown as Record<string, unknown>).PerformanceObserver =
					originalPO;
			}
		});
	});

	describe("normalizeUrl", () => {
		test("should remove hash from URL", () => {
			const url = "http://example.com/page#hash";
			const result = (service as unknown as ServiceWithInternals).normalizeUrl(
				url,
			);
			expect(result).toBe("http://example.com/page");
		});

		test("should return original string if URL is invalid", () => {
			const url = "invalid-url";
			const result = (service as unknown as ServiceWithInternals).normalizeUrl(
				url,
			);
			expect(result).toBe("invalid-url");
		});
	});

	describe("setupDelayInterception - extended", () => {
		test("should log warning on 404 response", async () => {
			let responseHandler: (res: unknown) => void = () => {};
			mockPage.on.mockImplementation(
				(event: string, handler: (...args: unknown[]) => unknown) => {
					if (event === "response") {
						responseHandler = handler;
					}
					return mockPage;
				},
			);

			await (service as unknown as ServiceWithInternals).setupDelayInterception(
				mockPage,
				"http://example.com/delay",
			);

			const mockRes = {
				status: () => 404,
				url: () => "http://example.com/delay",
				request: () => ({
					resourceType: () => "script",
				}),
			};

			responseHandler(mockRes);

			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.stringContaining("[LCP] Browser resource error: 404"),
			);
		});

		test("should handle setup failure", async () => {
			mockPage.setRequestInterception.mockRejectedValue(
				new Error("Interception error"),
			);
			await (service as unknown as ServiceWithInternals).setupDelayInterception(
				mockPage,
				"http://example.com",
			);
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.any(Error),
				"[LCP] Failed to set up delay interception",
			);
		});
		describe("Static Browser Helpers", () => {
			test("_checkLcpStatus should return true if __prefetcherLcp is not null", () => {
				const mockWindow = {
					__prefetcherLcp: 1000,
					__prefetcherLcpError: null,
				};
				(global as unknown as Record<string, unknown>).window = mockWindow;
				expect(
					(
						LcpImpactEvaluationService as unknown as ServiceWithInternals
					)._checkLcpStatus(),
				).toBe(true);
				delete (global as unknown as Record<string, unknown>).window;
			});

			test("_checkLcpStatus should return true if __prefetcherLcpError is set", () => {
				const mockWindow = {
					__prefetcherLcp: null,
					__prefetcherLcpError: "Error",
				};
				(global as unknown as Record<string, unknown>).window = mockWindow;
				expect(
					(
						LcpImpactEvaluationService as unknown as ServiceWithInternals
					)._checkLcpStatus(),
				).toBe(true);
				delete (global as unknown as Record<string, unknown>).window;
			});

			test("_checkLcpStatus should return false if both are null/empty", () => {
				const mockWindow = {
					__prefetcherLcp: null,
					__prefetcherLcpError: null,
				};
				(global as unknown as Record<string, unknown>).window = mockWindow;
				expect(
					(
						LcpImpactEvaluationService as unknown as ServiceWithInternals
					)._checkLcpStatus(),
				).toBe(false);
				delete (global as unknown as Record<string, unknown>).window;
			});

			test("_getLcpResult should return LCP and null error", () => {
				const mockWindow = {
					__prefetcherLcp: 1200,
					__prefetcherLcpError: null,
				};
				(global as unknown as Record<string, unknown>).window = mockWindow;
				expect(
					(
						LcpImpactEvaluationService as unknown as ServiceWithInternals
					)._getLcpResult(),
				).toEqual({
					lcp: 1200,
					error: null,
				});
				delete (global as unknown as Record<string, unknown>).window;
			});

			test("_getLcpResult should return error string if error exists", () => {
				const mockWindow = {
					__prefetcherLcp: null,
					__prefetcherLcpError: new Error("Failed"),
				};
				(global as unknown as Record<string, unknown>).window = mockWindow;
				expect(
					(
						LcpImpactEvaluationService as unknown as ServiceWithInternals
					)._getLcpResult(),
				).toEqual({
					lcp: null,
					error: "Error: Failed",
				});
				delete (global as unknown as Record<string, unknown>).window;
			});
		});

		describe("setupDelayInterception additional coverage", () => {
			test("should handle already handled request in request listener", async () => {
				const mockReq = {
					url: () => TEST_RESOURCE_URL,
					isInterceptResolutionHandled: jest.fn().mockReturnValue(true),
					resourceType: () => "script",
					continue: jest.fn(),
				} as unknown as MockRequest;

				await (
					service as unknown as ServiceWithInternals
				).setupDelayInterception(mockPage, TEST_RESOURCE_URL);

				const requestHandler = mockPage.on.mock.calls.find(
					(call) => call[0] === "request",
				)[1];
				await requestHandler(mockReq);

				expect(mockReq.continue).not.toHaveBeenCalled();
			});

			test("should handle already handled request after timeout", async () => {
				jest.useFakeTimers();
				const mockReq = {
					url: () => TEST_RESOURCE_URL,
					isInterceptResolutionHandled: jest
						.fn()
						.mockReturnValueOnce(false) // First call in listener
						.mockReturnValueOnce(true), // Second call in timeout
					resourceType: () => "script",
					continue: jest.fn(),
				} as unknown as MockRequest;

				await (
					service as unknown as ServiceWithInternals
				).setupDelayInterception(mockPage, TEST_RESOURCE_URL);

				const requestHandler = mockPage.on.mock.calls.find(
					(call) => call[0] === "request",
				)[1];
				await requestHandler(mockReq);

				jest.advanceTimersByTime(
					(LcpImpactEvaluationService as unknown as ServiceWithInternals)
						.LCP_IMPACT_THRESHOLD_MS,
				);

				expect(mockReq.continue).not.toHaveBeenCalled();
				expect(fastifyMock.log.debug).toHaveBeenCalledWith(
					expect.stringContaining("Request already handled, skipping continue"),
				);
				jest.useRealTimers();
			});

			test("should handle response with status < 400 silently", async () => {
				const mockRes = {
					status: () => 200,
					url: () => TEST_RESOURCE_URL,
					request: () => ({ resourceType: () => "script" }),
				} as unknown as HTTPResponse;

				await (
					service as unknown as ServiceWithInternals
				).setupDelayInterception(mockPage, TEST_RESOURCE_URL);

				const responseHandler = mockPage.on.mock.calls.find(
					(call) => call[0] === "response",
				)[1];
				responseHandler(mockRes);

				expect(fastifyMock.log.warn).not.toHaveBeenCalledWith(
					expect.stringContaining("Browser resource error"),
				);
			});
		});
	});
});
