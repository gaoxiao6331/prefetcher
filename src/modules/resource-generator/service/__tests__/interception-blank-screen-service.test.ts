import type { FastifyInstance } from "fastify";
import puppeteer from "puppeteer";
import type { CapturedResource, GenerateContext } from "../../type";
import InterceptionBlankScreenService from "../interception-blank-screen-service";

jest.mock("puppeteer");
jest.mock("@/utils/trace-context", () => ({
	// biome-ignore lint/suspicious/noExplicitAny: mock bind
	bindAsyncContext: (fn: any) => fn,
	getLogger: jest.fn().mockReturnValue(null),
}));

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

describe("InterceptionBlankScreenService", () => {
	let fastifyMock: FastifyInstance;
	let service: InterceptionBlankScreenService;
	// biome-ignore lint/suspicious/noExplicitAny: mock page
	let mockPage: any;
	// biome-ignore lint/suspicious/noExplicitAny: mock browser
	let mockBrowser: any;

	beforeEach(async () => {
		jest.clearAllMocks();

		mockPage = {
			on: jest.fn(),
			goto: jest.fn(),
			setRequestInterception: jest.fn(),
			isClosed: jest.fn().mockReturnValue(false),
			close: jest.fn(),
			screenshot: jest.fn().mockResolvedValue("mock-base64"),
			evaluate: jest
				.fn()
				.mockImplementation(async (fn: any, ...args: any[]) => {
					// Default mock implementation - can be overridden in tests
					return false;
				}),
		};

		mockBrowser = {
			newPage: jest.fn().mockResolvedValue(mockPage),
			close: jest.fn(),
			connected: true,
			on: jest.fn(),
		};

		(puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);

		fastifyMock = createMockFastify();
		service = (await InterceptionBlankScreenService.create(
			fastifyMock,
		)) as InterceptionBlankScreenService;
	});

	describe("filter", () => {
		test("should retain critical resources and remove non-critical ones", async () => {
			const resources: CapturedResource[] = [
				{
					url: "critical.js",
					type: "script",
					status: 200,
					sizeKB: 10,
					requestTime: 0,
					responseTime: 0,
					durationMs: 0,
				},
				{
					url: "non-critical.js",
					type: "script",
					status: 200,
					sizeKB: 10,
					requestTime: 0,
					responseTime: 0,
					durationMs: 0,
				},
			];
			const ctx: GenerateContext = {
				url: "http://test.com",
				capturedResources: resources,
			};

			// Mock isBlankScreen results: true for critical.js, false for non-critical.js
			mockPage.evaluate
				.mockResolvedValueOnce(true) // critical.js
				.mockResolvedValueOnce(false); // non-critical.js

			const result = await (service as any).filter(ctx);

			expect(result.capturedResources).toHaveLength(1);
			expect(result.capturedResources[0].url).toBe("critical.js");
		});

		test("should handle request interception branches", async () => {
			const resources: CapturedResource[] = [
				{
					url: "test.js",
					type: "script",
					status: 200,
					sizeKB: 10,
					requestTime: 0,
					responseTime: 0,
					durationMs: 0,
				},
			];
			const ctx: GenerateContext = {
				url: "http://test.com",
				capturedResources: resources,
			};

			let requestHandler: any;
			mockPage.on.mockImplementation((event: string, handler: any) => {
				if (event === "request") requestHandler = handler;
			});

			mockPage.goto.mockImplementation(async () => {
				// Case 1: Intercept resolution already handled
				const mockReqHandled = {
					isInterceptResolutionHandled: () => true,
					url: () => "test.js",
					abort: jest.fn(),
					continue: jest.fn(),
				};
				await requestHandler(mockReqHandled);
				expect(mockReqHandled.abort).not.toHaveBeenCalled();

				// Case 2: URL matches resource - abort
				const mockReqAbort = {
					url: () => "test.js",
					isInterceptResolutionHandled: () => false,
					abort: jest.fn().mockResolvedValue(undefined),
					continue: jest.fn(),
				};
				await requestHandler(mockReqAbort);
				expect(mockReqAbort.abort).toHaveBeenCalled();

				// Case 3: URL matches resource but abort fails
				const mockReqAbortFail = {
					url: () => "test.js",
					isInterceptResolutionHandled: () => false,
					abort: jest.fn().mockRejectedValue(new Error("Abort failed")),
					continue: jest.fn(),
				};
				await requestHandler(mockReqAbortFail);

				// Case 4: URL does not match - continue
				const mockReqContinue = {
					url: () => "other.js",
					isInterceptResolutionHandled: () => false,
					continue: jest.fn().mockResolvedValue(undefined),
					abort: jest.fn(),
				};
				await requestHandler(mockReqContinue);
				expect(mockReqContinue.continue).toHaveBeenCalled();

				// Case 5: URL does not match but continue fails
				const mockReqContinueFail = {
					url: () => "other.js",
					isInterceptResolutionHandled: () => false,
					continue: jest.fn().mockRejectedValue(new Error("Continue failed")),
					abort: jest.fn(),
				};
				await requestHandler(mockReqContinueFail);

				// Case 6: Request handler throws error
				const mockReqError = {
					url: () => {
						throw new Error("Handler error");
					},
					isInterceptResolutionHandled: () => false,
				};
				await requestHandler(mockReqError);
			});

			mockPage.evaluate.mockResolvedValue(false);

			await (service as any).filter(ctx);
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.stringContaining("[Interception] Request handling failed"),
			);
		});

		test("should handle validation failure and retain resource (safety first)", async () => {
			const resources: CapturedResource[] = [
				{
					url: "fail.js",
					type: "script",
					status: 200,
					sizeKB: 10,
					requestTime: 0,
					responseTime: 0,
					durationMs: 0,
				},
			];
			const ctx: GenerateContext = {
				url: "http://test.com",
				capturedResources: resources,
			};

			mockPage.goto.mockRejectedValue(new Error("Navigation failed"));

			const result = await (service as any).filter(ctx);
			expect(result.capturedResources).toHaveLength(1);
			expect(result.capturedResources[0].url).toBe("fail.js");
			expect(fastifyMock.log.error).toHaveBeenCalledWith(
				expect.any(Error),
				expect.stringContaining("Failed to validate resource"),
			);
		});
	});

	describe("isBlankScreen", () => {
		test("should return true if screenshot fails", async () => {
			const resources: CapturedResource[] = [
				{
					url: "test.js",
					type: "script",
					status: 200,
					sizeKB: 10,
					requestTime: 0,
					responseTime: 0,
					durationMs: 0,
				},
			];
			const ctx: GenerateContext = {
				url: "http://test.com",
				capturedResources: resources,
			};

			mockPage.screenshot.mockRejectedValue(new Error("Screenshot crash"));

			const result = await (service as any).filter(ctx);
			expect(result.capturedResources).toHaveLength(1); // retained due to error
			expect(fastifyMock.log.error).toHaveBeenCalledWith(
				expect.any(Error),
				"Screenshot-based blank screen detection failed",
			);
		});

		test("should exercise internal evaluate logic branches using mock environment", async () => {
			const resources: CapturedResource[] = [
				{
					url: "test.js",
					type: "script",
					status: 200,
					sizeKB: 10,
					requestTime: 0,
					responseTime: 0,
					durationMs: 0,
				},
			];
			const ctx: GenerateContext = {
				url: "http://test.com",
				capturedResources: resources,
			};

			// Mock browser environment for evaluate
			// biome-ignore lint/suspicious/noExplicitAny: mock
			const setupMockEnv = (canvasContext: any, imageData: any) => {
				// biome-ignore lint/suspicious/noExplicitAny: mock
				(global as any).Image = class {
					onload: any;
					onerror: any;
					set src(_val: string) {
						setTimeout(() => this.onload(), 0);
					}
				};
				(global as any).document = {
					createElement: () => ({
						getContext: () => canvasContext,
						width: 50,
						height: 50,
					}),
				};
			};

			const originalImage = (global as any).Image;
			const originalDocument = (global as any).document;

			try {
				mockPage.evaluate.mockImplementation(
					async (fn: any, ...args: any[]) => {
						return await fn(...args);
					},
				);

				// Branch 1: Canvas context is null
				setupMockEnv(null, null);
				let result = await (service as any).filter(ctx);
				expect(result.capturedResources).toHaveLength(1); // true due to null ctx

				// Branch 2: avgDiff < 8 (Result is true, blank screen)
				const blankData = new Uint8ClampedArray(50 * 50 * 4).fill(0);
				setupMockEnv(
					{
						drawImage: () => {},
						getImageData: () => ({ data: blankData }),
					},
					blankData,
				);
				result = await (service as any).filter(ctx);
				expect(result.capturedResources).toHaveLength(1);

				// Branch 3: avgDiff >= 8 (Result is false, NOT blank screen)
				const colorfulData = new Uint8ClampedArray(50 * 50 * 4);
				for (let i = 0; i < colorfulData.length; i++) {
					colorfulData[i] = i % 256;
				}
				setupMockEnv(
					{
						drawImage: () => {},
						getImageData: () => ({ data: colorfulData }),
					},
					colorfulData,
				);
				result = await (service as any).filter(ctx);
				expect(result.capturedResources).toHaveLength(0);

				// Branch 4: Image load failure
				// biome-ignore lint/suspicious/noExplicitAny: mock
				(global as any).Image = class {
					onload: any;
					onerror: any;
					set src(_val: string) {
						setTimeout(() => this.onerror(new Error("load fail")), 0);
					}
				};
				result = await (service as any).filter(ctx);
				expect(result.capturedResources).toHaveLength(1);
			} finally {
				(global as any).Image = originalImage;
				(global as any).document = originalDocument;
			}
		});
	});
});
