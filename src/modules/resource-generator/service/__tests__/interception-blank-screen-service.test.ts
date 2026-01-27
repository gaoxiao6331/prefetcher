import type { FastifyInstance } from "fastify";
import puppeteer from "puppeteer";
import type { CapturedResource, GenerateContext } from "../../type";
import InterceptionBlankScreenService from "../interception-blank-screen-service";

jest.mock("puppeteer");
jest.mock("@/utils/trace-context", () => ({
	bindAsyncContext: (fn: any) => fn,
	getLogger: jest.fn().mockReturnValue(null),
}));
jest.mock("@/utils/semaphore", () => {
	class MockSemaphore {
		max: number;
		constructor(max: number) {
			this.max = max;
		}
		async run<T>(fn: () => Promise<T>): Promise<T> {
			return fn();
		}
	}
	return { Semaphore: MockSemaphore };
});

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
			evaluate: jest.fn().mockResolvedValue({ decided: false, blankRate: 50 }),

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
		test("should retain resource when blank screen is detected", async () => {
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
			];
			const ctx: GenerateContext = {
				url: "http://test.com",
				capturedResources: resources,
			};

			mockPage.evaluate.mockResolvedValue(true);

			const result = await (service as any).filter(ctx);

			expect(result.capturedResources).toHaveLength(1);
			expect(result.capturedResources[0].url).toBe("critical.js");
			expect(fastifyMock.log.info).toHaveBeenCalledWith(
				expect.stringContaining("critical (causes blank screen)"),
			);
		});

		test("should remove resource when screen is not blank", async () => {
			const resources: CapturedResource[] = [
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

			mockPage.evaluate.mockResolvedValue(false);

			const result = await (service as any).filter(ctx);

			expect(result.capturedResources).toHaveLength(0);
			expect(fastifyMock.log.info).toHaveBeenCalledWith(
				expect.stringContaining("is NOT critical"),
			);
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

			// biome-ignore lint/suspicious/noExplicitAny: mock
			let requestHandler: any;
			// biome-ignore lint/suspicious/noExplicitAny: mock
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

		test("should handle validation failure and retain resource", async () => {
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

			// biome-ignore lint/suspicious/noExplicitAny: mock
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
		test("should return true when most points are blank containers", async () => {
			const page = {
				evaluate: jest.fn(async (fn: any) => {
					const originalWindow = (global as any).window;
					const originalDocument = (global as any).document;
					(global as any).window = { innerWidth: 100, innerHeight: 100 };
					const bodyEl = { matches: (sel: string) => sel === "body" };
					(global as any).document = {
						elementsFromPoint: () => [bodyEl],
					};
					try {
						return fn();
					} finally {
						(global as any).window = originalWindow;
						(global as any).document = originalDocument;
					}
				}),
			};

			const result = await (service as any).isBlankScreen(page);
			expect(result).toBe(true);
		});

		test("should return false when points have non-blank content", async () => {
			const page = {
				evaluate: jest.fn(async (fn: any) => {
					const originalWindow = (global as any).window;
					const originalDocument = (global as any).document;
					(global as any).window = { innerWidth: 100, innerHeight: 100 };
					const contentEl = { matches: () => false };
					(global as any).document = {
						elementsFromPoint: () => [contentEl],
					};
					try {
						return fn();
					} finally {
						(global as any).window = originalWindow;
						(global as any).document = originalDocument;
					}
				}),
			};

			const result = await (service as any).isBlankScreen(page);
			expect(result).toBe(false);
		});

		test("should treat null nodes as blank", async () => {
			const page = {
				evaluate: jest.fn(async (fn: any) => {
					const originalWindow = (global as any).window;
					const originalDocument = (global as any).document;
					(global as any).window = { innerWidth: 100, innerHeight: 100 };
					(global as any).document = {
						elementsFromPoint: () => [null],
					};
					try {
						return fn();
					} finally {
						(global as any).window = originalWindow;
						(global as any).document = originalDocument;
					}
				}),
			};

			const result = await (service as any).isBlankScreen(page);
			expect(result).toBe(true);
		});

		test("should handle case where no elements are found", async () => {
			const page = {
				evaluate: jest.fn(async (fn: any) => {
					const originalWindow = (global as any).window;
					const originalDocument = (global as any).document;
					(global as any).window = { innerWidth: 100, innerHeight: 100 };
					(global as any).document = {
						elementsFromPoint: () => [],
					};
					try {
						return fn();
					} finally {
						(global as any).window = originalWindow;
						(global as any).document = originalDocument;
					}
				}),
			};

			const result = await (service as any).isBlankScreen(page);
			expect(result).toBe(false);
		});
	});
});
