import type { FastifyInstance } from "fastify";
import puppeteer from "puppeteer";
import LcpImpactEvaluationService, { _evaluateLcpInBrowserContext } from "../lcp-impact-evaluation-service";
import type { GenerateContext, CapturedResource } from "../../type";

jest.mock("puppeteer");
jest.mock("@/utils/trace-context", () => ({
	bindAsyncContext: (fn: any) => fn,
	getLogger: jest.fn().mockReturnValue(null),
}));
jest.mock("@/utils/semaphore", () => ({
	Semaphore: jest.fn().mockImplementation(() => ({
		run: jest.fn().mockImplementation((fn: any) => fn()),
	}))
}));

// Test constants
const TEST_URL = "http://example.com";
const TEST_RESOURCE_URL = "http://example.com/script.js";
const TEST_RESOURCE_URL_2 = "http://example.com/style.css";
const LCP_THRESHOLD = 1000;

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

// Helper function to create mock browser
function createMockBrowser(mockPage: any) {
	return {
		newPage: jest.fn().mockResolvedValue(mockPage),
		close: jest.fn(),
		connected: true,
		on: jest.fn(),
	};
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
		capturedResources: resources.map(resource => ({ ...resource, type: "script" })),
	} as unknown as GenerateContext;
}

describe("LcpImpactEvaluationService", () => {
	let fastifyMock: FastifyInstance;
	let service: any;
	let mockPage: any;
	let mockBrowser: any;

	beforeEach(async () => {
		jest.clearAllMocks();
		jest.resetModules();
		jest.useFakeTimers("legacy" as any);

		mockPage = createMockPage();
		mockBrowser = createMockBrowser(mockPage);

		(puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);

		fastifyMock = createMockFastify();
		service = await LcpImpactEvaluationService.create(fastifyMock);
		service.browser = mockBrowser;
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe("_evaluateLcpInBrowserContext", () => {
		let mockWindow: any;
		let mockPerformance: any;

		beforeEach(() => {
			mockWindow = {
				__prefetcherLcp: undefined,
			};
			mockPerformance = {
				getEntriesByType: jest.fn().mockReturnValue([]),
			};

			(global as any).window = mockWindow;
			(global as any).performance = mockPerformance;
		});

		afterEach(() => {
			delete (global as any).window;
			delete (global as any).performance;
		});

		test("should return __prefetcherLcp value when available", () => {
			mockWindow.__prefetcherLcp = 123.45;
			expect(_evaluateLcpInBrowserContext()).toBe(123.45);
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
		let requestHandler: Function;

		beforeEach(() => {
			jest.resetModules();
			jest.clearAllTimers();
			mockPage.on.mockImplementation((event: string, handler: Function) => {
				if (event === "request") {
					requestHandler = handler;
				}
			});
			service.setupDelayInterception(mockPage, TEST_RESOURCE_URL);
		});

		afterEach(() => {
		});

		test("should not intercept if request is already handled", async () => {
			const mockRequest = {
				isInterceptResolutionHandled: () => true,
				url: () => TEST_RESOURCE_URL,
				continue: jest.fn(),
			};
			await requestHandler(mockRequest);
			expect(mockRequest.continue).not.toHaveBeenCalled();
		});

		test("should delay specific resource and continue", async () => {
			const mockRequest = {
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
			const mockRequest = {
				isInterceptResolutionHandled: () => false,
				url: () => "http://example.com/other.js",
				continue: jest.fn().mockResolvedValue(undefined),
			};
			await requestHandler(mockRequest);
			expect(mockRequest.continue).toHaveBeenCalled();
		});

		test("should log warning if continue fails for delayed resource", async () => {
			const mockRequest = {
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
			const mockRequest = {
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
			const mockRequest = {
				isInterceptResolutionHandled: () => {
					throw new Error("Handling error");
				},
				url: () => TEST_RESOURCE_URL,
				continue: jest.fn(),
			};
			await requestHandler(mockRequest);
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.stringContaining("[LCP] Request handling failed: Error: Handling error"),
			);
		});

		test("should log warning if req.url() throws an error", async () => {
			const mockRequest = {
				isInterceptResolutionHandled: jest.fn().mockReturnValue(false),
				url: () => {
					throw new Error("URL error");
				},
				continue: jest.fn(),
			};
			await requestHandler(mockRequest);
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.stringContaining("[LCP] Request handling failed: Error: URL error"),
			);
		});

		test("should log warning if an error occurs in the request event listener", async () => {
			const mockRequest = {
				isInterceptResolutionHandled: () => {
					throw new Error("Handler error");
				},
				url: () => TEST_RESOURCE_URL,
			};

			await requestHandler(mockRequest);

			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.stringContaining("[LCP] Request handling failed: Error: Handler error"),
			);
		});

		test("should not call continue if delayed request is handled before timeout", async () => {
			const mockRequest = {
				isInterceptResolutionHandled: jest.fn()
					.mockReturnValueOnce(false)
					.mockReturnValueOnce(true), // Handled before timeout
				url: () => TEST_RESOURCE_URL,
				continue: jest.fn(),
			};

			await requestHandler(mockRequest);
			jest.advanceTimersByTime(10000);

			expect(mockRequest.continue).not.toHaveBeenCalled();
		});

		test("should not call continue if delayed request is handled by another interceptor before timeout", async () => {
			const mockRequest = {
				isInterceptResolutionHandled: jest.fn()
					.mockReturnValueOnce(false) // First call when requestHandler is invoked
					.mockReturnValueOnce(true),  // Second call when setTimeout callback executes
				url: () => TEST_RESOURCE_URL,
				continue: jest.fn(),
			};

			await requestHandler(mockRequest);
			// Simulate some other part of the system handling the request before our timeout
			// We don't need to explicitly call a mock function here, just ensure isInterceptResolutionHandled returns true later.

			jest.advanceTimersByTime(10000); // Advance timers to trigger the setTimeout callback

			expect(mockRequest.isInterceptResolutionHandled).toHaveBeenCalledTimes(2);
			expect(mockRequest.continue).not.toHaveBeenCalled();
			expect(fastifyMock.log.warn).not.toHaveBeenCalled(); // No warning should be logged as it was handled
		});
	});

	describe("Initialization", () => {
		test("should initialize service correctly", () => {
			expect(service).toBeDefined();
			expect(puppeteer.launch).toHaveBeenCalled();
		});

		test("should handle browser init failure", async () => {
			jest.spyOn(service, "getPage").mockRejectedValueOnce(
				new Error("Browser init failed"),
			);
			await expect(service.captureResources(TEST_URL)).rejects.toThrow(
				"Browser init failed",
			);
		});

		test("should capture resources and evaluate LCP impact", async () => {
			const mockPageForCaptureResources = createMockPage();
			const mockPageForMeasureLcpInternal = createMockPage();
			const mockPageForMeasureLcpWithDelay = createMockPage();

			mockPageForMeasureLcpInternal.evaluate.mockResolvedValue(100); // Baseline LCP
			mockPageForMeasureLcpWithDelay.evaluate.mockResolvedValue(1200); // Impacted LCP

			jest.spyOn(service, "getPage")
				.mockResolvedValueOnce({
					page: mockPageForCaptureResources as any,
					[Symbol.asyncDispose]: jest.fn(),
				})
				.mockResolvedValueOnce({
					page: mockPageForMeasureLcpInternal as any,
					[Symbol.asyncDispose]: jest.fn(),
				})
				.mockResolvedValueOnce({
					page: mockPageForMeasureLcpWithDelay as any,
					[Symbol.asyncDispose]: jest.fn(),
				});

			await service.captureResources(TEST_URL);
			await service.filter({
				url: TEST_URL,
				capturedResources: [{ url: TEST_RESOURCE_URL, type: "script" } as CapturedResource],
			});

			expect(mockPageForCaptureResources.goto).toHaveBeenCalledWith(TEST_URL, {
				waitUntil: "networkidle2",
				timeout: 30000,
			});
			expect(mockPageForMeasureLcpInternal.evaluate).toHaveBeenCalledWith(
				_evaluateLcpInBrowserContext,
			);
			expect(mockPageForMeasureLcpWithDelay.evaluate).toHaveBeenCalledWith(
				_evaluateLcpInBrowserContext,
			);
			expect(fastifyMock.log.info).toHaveBeenCalledWith(
				expect.stringContaining("Resource http://example.com/script.js is critical"),
			);
		});

		test("should handle page close failure", async () => {
			const mockPage = {
				goto: jest.fn().mockResolvedValue(undefined),
				on: jest.fn(),
				setRequestInterception: jest.fn(),
				evaluate: jest.fn().mockResolvedValue(100),
				evaluateOnNewDocument: jest.fn(),
				close: jest.fn().mockRejectedValueOnce(new Error("Page close failed")),
			};
			jest.spyOn(service, "getPage").mockResolvedValue({
				page: mockPage as any,
				[Symbol.asyncDispose]: jest.fn().mockRejectedValueOnce(new Error("Page close failed")),
			});

			await expect(service.captureResources(TEST_URL)).rejects.toThrow(
				"Page close failed",
			);
		});

		test("should handle browser close failure", async () => {
			const mockPage = {
				goto: jest.fn().mockResolvedValue(undefined),
				on: jest.fn(),
				setRequestInterception: jest.fn(),
				evaluate: jest.fn().mockResolvedValue(100),
				evaluateOnNewDocument: jest.fn(),
				close: jest.fn(),
			};
			jest.spyOn(service, "getPage").mockResolvedValue({
				page: mockPage as any,
				[Symbol.asyncDispose]: jest.fn().mockRejectedValueOnce(new Error("Browser close failed")),
			});

			await expect(service.captureResources(TEST_URL)).rejects.toThrow(
				"Browser close failed",
			);
		});
	});





	describe("filter", () => {
		test("should return baseCtx if capturedResources is empty", async () => {
			const ctx = createMockContext([]);
			const result = await service.filter(ctx);
			expect(result).toEqual(ctx);
		});

		test("should log error if baselineLcp measurement fails", async () => {
			jest.spyOn(service, "measureLcp").mockRejectedValueOnce(new Error("Baseline LCP error"));
			const resources = [{ url: TEST_RESOURCE_URL, type: "script" }] as CapturedResource[];
			const ctx = createMockContext(resources);
			const result = await service.filter(ctx);
			expect(fastifyMock.log.error).toHaveBeenCalledWith(
				expect.any(Error),
				"[LCP] Failed to measure baseline LCP",
			);
			expect(result.capturedResources).toEqual(resources); // Should still return all resources as critical
		});

		test("should return all resources as critical if baselineLcp is null", async () => {
			jest.spyOn(service, "measureLcp").mockResolvedValueOnce(null);
			const resources = [{ url: TEST_RESOURCE_URL, type: "script" }] as CapturedResource[];
			const ctx = createMockContext(resources);
			const result = await service.filter(ctx);
			expect(result.capturedResources).toEqual(resources);
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				"[LCP] Baseline LCP is unavailable, treating all resources as critical",
			);
		});

			test("should handle resource with LCP impact", async () => {
				const mockPage = {
					goto: jest.fn().mockResolvedValue(undefined),
					on: jest.fn(),
					setRequestInterception: jest.fn(),
					evaluate: jest.fn(),
					evaluateOnNewDocument: jest.fn(),
					close: jest.fn(),
				};
				jest.spyOn(service, "getPage").mockResolvedValue({
					page: mockPage as any,
					[Symbol.asyncDispose]: jest.fn(),
				});

				jest.spyOn(service as any, "measureLcp").mockResolvedValue(100); // Baseline LCP
				jest.spyOn(service as any, "measureLcpWithDelay").mockImplementation(
					async (...args: any[]) => {
						const resourceUrl = args[1];
						if (resourceUrl === TEST_RESOURCE_URL) {
							return 1200; // Critical resource
						}
						return 150; // Non-critical resource
					},
				);

				const ctx: GenerateContext = {
					url: TEST_URL,
					capturedResources: [{ url: TEST_RESOURCE_URL, type: "script" } as CapturedResource],
				};

				const result = await service.filter(ctx);

				expect(result.capturedResources).toHaveLength(1);
				expect(result.capturedResources[0].url).toBe(TEST_RESOURCE_URL);
			});

			test("should handle resource with non-critical LCP impact", async () => {
				const mockPage = {
					goto: jest.fn().mockResolvedValue(undefined),
					on: jest.fn(),
					setRequestInterception: jest.fn(),
					evaluate: jest.fn(),
					evaluateOnNewDocument: jest.fn(),
					close: jest.fn(),
				};
				jest.spyOn(service, "getPage").mockResolvedValue({
					page: mockPage as any,
					[Symbol.asyncDispose]: jest.fn(),
				});

				jest.spyOn(service as any, "measureLcp").mockResolvedValue(100); // Baseline LCP
				jest.spyOn(service as any, "measureLcpWithDelay").mockResolvedValue(150); // Impacted LCP (delta = 50 < 1000)

				const ctx: GenerateContext = {
					url: TEST_URL,
					capturedResources: [{ url: TEST_RESOURCE_URL, type: "script" } as CapturedResource],
				};

				const result = await service.filter(ctx);

				expect(result.capturedResources).toHaveLength(0); // Should not be critical
				expect(fastifyMock.log.info).toHaveBeenCalledWith(
					expect.stringContaining("Resource http://example.com/script.js is NOT critical"),
				);
			});

		test("should treat resource as critical if measureLcpWithDelay fails", async () => {
			jest.spyOn(service, "measureLcpInternal")
				.mockResolvedValueOnce(1000) // baselineLcp
				.mockRejectedValueOnce(new Error("Delay measurement failed")); // impactedLcp for critical resource (delta = 1500)

			const resources = [{ url: TEST_RESOURCE_URL, type: "script" }] as CapturedResource[];
			const ctx = createMockContext(resources);
			const result = await service.filter(ctx);

			expect(result.capturedResources).toHaveLength(1);
			expect(result.capturedResources[0].url).toBe(TEST_RESOURCE_URL);
			expect(fastifyMock.log.error).toHaveBeenCalledWith(
				expect.any(Error),
				`[LCP] Failed to evaluate resource impact: ${TEST_RESOURCE_URL}`,
			);
		});

		test("should treat resource as critical if impactedLcp is null", async () => {
			jest.spyOn(service, "measureLcpInternal")
				.mockResolvedValueOnce(1000) // baselineLcp
				.mockResolvedValueOnce(null); // impactedLcp for critical resource (delta = 1500)

			const resources = [{ url: TEST_RESOURCE_URL, type: "script" }] as CapturedResource[];
			const ctx = createMockContext(resources);
			const result = await service.filter(ctx);

			expect(result.capturedResources).toHaveLength(1);
			expect(result.capturedResources[0].url).toBe(TEST_RESOURCE_URL);
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				`[LCP] Failed to measure LCP with delayed resource: ${TEST_RESOURCE_URL}, treating as critical`,
			);
		});

		test("should log warning and treat resource as critical if measureLcpWithDelay returns null", async () => {
			jest.spyOn(service, "measureLcp").mockResolvedValueOnce(100);
			jest.spyOn(service, "measureLcpWithDelay").mockResolvedValueOnce(null);

			const resources = [{ url: TEST_RESOURCE_URL, type: "script" }] as CapturedResource[];
			const ctx = createMockContext(resources);

			const result = await service.filter(ctx);

			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				`[LCP] Failed to measure LCP with delayed resource: ${TEST_RESOURCE_URL}, treating as critical`,
			);
			expect(result.capturedResources).toEqual(resources);
		});

		test("should log warning if req.continue() fails during delay interception", async () => {
			jest.useFakeTimers();

			const mockRequest = {
				url: () => TEST_RESOURCE_URL,
				continue: jest.fn().mockRejectedValue(new Error("Request continue failed")),
				isInterceptResolutionHandled: jest.fn().mockReturnValue(false),
			};

			let capturedRequestHandler: Function | undefined;
			let handlerRegisteredPromise: Promise<void>;
			let resolveHandlerRegistered: () => void;

			handlerRegisteredPromise = new Promise(resolve => {
				resolveHandlerRegistered = resolve;
			});

			mockPage.on.mockImplementation((event: string, handler: Function) => {
				if (event === "request") {
					capturedRequestHandler = handler;
					resolveHandlerRegistered(); // Resolve the promise when the handler is captured
				}
			});

			// Mock page.goto and page.evaluate for measureLcpInternal
			mockPage.goto.mockResolvedValue(undefined);
			mockPage.evaluate.mockResolvedValue(100); // Mock LCP value

			const measureLcpInternalPromise = service.measureLcpInternal(TEST_URL, TEST_RESOURCE_URL);

			// Wait for the handler to be registered
			await handlerRegisteredPromise;

			// Ensure the handler was captured
			expect(capturedRequestHandler).toBeDefined();

			// Now, simulate a request coming in
			if (capturedRequestHandler) {
				capturedRequestHandler(mockRequest);
			}

			// Advance timers to allow setTimeout to execute
			jest.advanceTimersByTime(10000); // Advance by 10 seconds as per setTimeout in setupDelayInterception

			// Wait for the measureLcpInternal promise to resolve
			await measureLcpInternalPromise;

			expect(mockPage.on).toHaveBeenCalledWith("request", expect.any(Function));
			expect(mockRequest.continue).toHaveBeenCalled();
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				`[LCP] Request handling failed: Request continue failed`,
			);

			jest.useRealTimers();
		});
	});

	describe("measureLcpInternal", () => {
		test("should return LCP value on successful navigation", async () => {
			mockPage.evaluate.mockResolvedValueOnce(1234);
			mockPage.goto.mockResolvedValueOnce(undefined);

			const lcp = await service.measureLcpInternal(TEST_URL);
			expect(lcp).toBe(1234);
			expect(mockPage.goto).toHaveBeenCalledWith(TEST_URL, {
				waitUntil: "networkidle2",
				timeout: 60000,
			});
			expect(mockPage.evaluate).toHaveBeenCalledWith(_evaluateLcpInBrowserContext);
		});

		test("should return null if page.goto fails", async () => {
			mockPage.goto.mockRejectedValueOnce(new Error("Navigation failed"));

			const lcp = await service.measureLcpInternal(TEST_URL);
			expect(lcp).toBeNull();
			expect(fastifyMock.log.error).toHaveBeenCalledWith(
				expect.any(Error),
				`[LCP] Failed to navigate to ${TEST_URL}`,
			);
		});

		test("should setup delay interception if delayResourceUrl is provided", async () => {
			mockPage.evaluate.mockResolvedValueOnce(1234);
			mockPage.goto.mockResolvedValueOnce(undefined);

			const lcp = await service.measureLcpInternal(TEST_URL, TEST_RESOURCE_URL);
			expect(lcp).toBe(1234);
			expect(mockPage.on).toHaveBeenCalledWith("request", expect.any(Function));
		});

		test("should return null if evaluate returns non-number", async () => {
			mockPage.evaluate.mockResolvedValueOnce(null);
			mockPage.goto.mockResolvedValueOnce(undefined);

			const lcp = await service.measureLcpInternal(TEST_URL);
			expect(lcp).toBeNull();
		});
	});



	describe("setupLcpObserver", () => {
		let mockWindow: any;
		let mockPerformance: any;
		let mockLcpObserverInstance: any; // To hold the instance created in evaluateOnNewDocument
		let mockPerformanceObserverConstructor: jest.Mock; // To control the constructor behavior
		let capturedEvaluateOnNewDocumentCallback: Function | undefined;

		beforeEach(() => {
			mockLcpObserverInstance = {
				observe: jest.fn(),
				disconnect: jest.fn(),
				getEntries: jest.fn(),
				entryListCallback: jest.fn(),
			};

			mockPerformanceObserverConstructor = jest.fn().mockImplementation((cb: Function) => {
				mockLcpObserverInstance.entryListCallback = cb;
				return mockLcpObserverInstance;
			});

			mockWindow = {
				__prefetcherLcp: null,
				__prefetcherLcpError: null,
				PerformanceObserver: mockPerformanceObserverConstructor,
				addEventListener: jest.fn(),
			};
			mockPerformance = {
				getEntriesByType: jest.fn(),
			};

			// Set global window and performance once for the suite
			(global as any).window = mockWindow;
  (global as any).performance = mockPerformance;
  (global as any).PerformanceObserver = mockPerformanceObserverConstructor;

			mockPage.evaluateOnNewDocument.mockImplementation((cb: Function) => {
    capturedEvaluateOnNewDocumentCallback = cb;
  });
		});

		afterEach(() => {
			// Clean up global mocks
			delete (global as any).window;
			delete (global as any).performance;
		});

		test("should set __prefetcherLcp when LCP entry is observed", async () => {
			const mockLcpEntry = { startTime: 123.45 };
			await service.setupLcpObserver(mockPage);
			capturedEvaluateOnNewDocumentCallback?.(); // Execute the captured callback

			// Simulate PerformanceObserver calling its callback with an entry list
			mockLcpObserverInstance.entryListCallback({
				getEntries: () => [mockLcpEntry],
			});

			expect(mockWindow.__prefetcherLcp).toBe(123.45);
			expect(mockLcpObserverInstance.observe).toHaveBeenCalledWith({
				type: "largest-contentful-paint",
				buffered: true,
			});
			expect(mockWindow.addEventListener).toHaveBeenCalledWith(
				"visibilitychange",
				expect.any(Function),
				{ once: true },
			);
		});

		test("should handle errors during observer setup", async () => {
			mockPerformanceObserverConstructor.mockImplementationOnce(() => {
				throw new Error("Observer error");
			});
			await service.setupLcpObserver(mockPage);
			capturedEvaluateOnNewDocumentCallback?.(); // Execute the captured callback to trigger the try-catch
			expect(mockWindow.__prefetcherLcpError).toBeInstanceOf(Error);
			expect((mockWindow.__prefetcherLcpError as Error).message).toBe("Observer error");
			expect(mockLcpObserverInstance.observe).not.toHaveBeenCalled();
		});

		test("should not set __prefetcherLcp if no LCP entry", async () => {
			await service.setupLcpObserver(mockPage);
			capturedEvaluateOnNewDocumentCallback?.(); // Execute the captured callback

			mockLcpObserverInstance.entryListCallback({ getEntries: () => [] });

			expect(mockWindow.__prefetcherLcp).toBeNull();
		});

		test("should disconnect observer when visibility changes to hidden", async () => {
			let visibilityChangeHandler: Function | undefined;
			mockWindow.addEventListener.mockImplementation((event: string, handler: Function) => {
				if (event === "visibilitychange") {
					visibilityChangeHandler = handler;
				}
			});

			await service.setupLcpObserver(mockPage);
			capturedEvaluateOnNewDocumentCallback?.();

			expect(visibilityChangeHandler).toBeDefined();

			// Simulate visibility changing to hidden
			(global as any).document = { visibilityState: "hidden" };
			visibilityChangeHandler?.();

			expect(mockLcpObserverInstance.disconnect).toHaveBeenCalled();
			delete (global as any).document;
		});

		test("should not disconnect observer when visibility changes to visible", async () => {
			let visibilityChangeHandler: Function | undefined;
			mockWindow.addEventListener.mockImplementation((event: string, handler: Function) => {
				if (event === "visibilitychange") {
					visibilityChangeHandler = handler;
				}
			});

			await service.setupLcpObserver(mockPage);
			capturedEvaluateOnNewDocumentCallback?.();

			expect(visibilityChangeHandler).toBeDefined();

			// Simulate visibility changing to visible
			(global as any).document = { visibilityState: "visible" };
			visibilityChangeHandler?.();

			expect(mockLcpObserverInstance.disconnect).not.toHaveBeenCalled();
			delete (global as any).document;
		});
	});
})