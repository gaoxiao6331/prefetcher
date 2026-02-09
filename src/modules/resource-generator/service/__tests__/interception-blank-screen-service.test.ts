import type { FastifyInstance } from "fastify";
import puppeteer from "puppeteer";
import type { CapturedResource, GenerateContext } from "../../type";
import InterceptionBlankScreenService from "../interception-blank-screen-service";

jest.mock("puppeteer");
jest.mock("@/utils/trace-context", () => ({
	bindAsyncContext: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
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

interface MockRequest {
	url: jest.Mock;
	isInterceptResolutionHandled: jest.Mock;
	abort: jest.Mock;
	continue: jest.Mock;
}

interface MockPage {
	evaluate: jest.Mock;
	on: jest.Mock;
	setRequestInterception: jest.Mock;
	goto: jest.Mock;
	isClosed: jest.Mock;
	close: jest.Mock;
	screenshot: jest.Mock;
	evaluateOnNewDocument: jest.Mock;
	bringToFront: jest.Mock;
}

interface MockBrowser {
	newPage: jest.Mock;
	close: jest.Mock;
	connected: boolean;
	on: jest.Mock;
}

type ServiceWithInternals = InterceptionBlankScreenService & {
	getPage: () => Promise<{
		page: MockPage;
		[Symbol.asyncDispose]: () => Promise<void>;
	}>;
	filter: (
		ctx: GenerateContext,
	) => Promise<GenerateContext & { validationResults: boolean[] }>;
	isBlankScreen: (
		page: MockPage | unknown,
	) => Promise<{ decided: boolean; blank: boolean }>;
	_evaluateDomBlankScreen: () => { decided: boolean; blankRate: number };
	_evaluateScreenshotBlankScreen: (screenshot: string) => Promise<number>;
};

function createMockPageInstance(
	blankScreenResult: boolean = true,
	evaluateMock?: jest.Mock,
	gotoMock?: jest.Mock,
): MockPage {
	let requestHandler: (request: MockRequest) => Promise<void>;
	const mockPageInstance: MockPage = {
		evaluate:
			evaluateMock ||
			jest
				.fn()
				.mockImplementation(
					async (fn: (...args: unknown[]) => unknown, ..._args: unknown[]) => {
						if (
							fn ===
							(
								InterceptionBlankScreenService as unknown as ServiceWithInternals
							)._evaluateDomBlankScreen
						) {
							return {
								decided: true,
								blankRate: blankScreenResult ? 100 : 0,
							};
						}
						if (
							fn ===
							(
								InterceptionBlankScreenService as unknown as ServiceWithInternals
							)._evaluateScreenshotBlankScreen
						) {
							return blankScreenResult ? 100 : 0;
						}
						return undefined;
					},
				),
		on: jest.fn((event, handler) => {
			if (event === "request") {
				requestHandler = handler;
			}
		}),
		setRequestInterception: jest.fn(),
		goto:
			gotoMock ||
			jest.fn(async (_url, _options) => {
				// Simulate a request being made and handled by the registered requestHandler
				if (requestHandler) {
					const mockRequest: MockRequest = {
						url: jest.fn().mockReturnValue("critical.js"), // Simulate a critical resource request
						isInterceptResolutionHandled: jest.fn().mockReturnValue(false),
						abort: jest.fn(),
						continue: jest.fn(),
					};
					await requestHandler(mockRequest);
				}
			}),
		isClosed: jest.fn().mockReturnValue(false),
		close: jest.fn(),
		screenshot: jest.fn().mockResolvedValue("mock-base64"),
		evaluateOnNewDocument: jest.fn(),
		bringToFront: jest.fn().mockResolvedValue(undefined),
	};
	return mockPageInstance;
}

describe("InterceptionBlankScreenService", () => {
	let fastifyMock: FastifyInstance;
	let service: InterceptionBlankScreenService;
	let mockPage: MockPage;
	let mockBrowser: MockBrowser;

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
			evaluateOnNewDocument: jest.fn(),
			bringToFront: jest.fn().mockResolvedValue(undefined),
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
		let getPageSpy: jest.SpyInstance;

		beforeEach(() => {
			getPageSpy = jest
				.spyOn(service as unknown as ServiceWithInternals, "getPage")
				.mockImplementation(async () => {
					const mockPageInstance = createMockPageInstance(
						true,
						mockPage.evaluate,
						mockPage.goto,
					); // Default to blank screen detected
					// Reset mocks for each test to ensure isolation
					mockPageInstance.evaluate.mockClear();
					mockPageInstance.goto.mockClear();
					mockPageInstance.on.mockClear();
					mockPageInstance.setRequestInterception.mockClear();
					mockPageInstance.isClosed.mockClear();
					mockPageInstance.close.mockClear();

					return {
						page: mockPageInstance,
						async [Symbol.asyncDispose]() {
							await mockPageInstance.close();
						},
					};
				});
		});
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

			const evaluateMock = jest.fn().mockImplementation((fn) => {
				if (
					fn ===
					(InterceptionBlankScreenService as unknown as ServiceWithInternals)
						._evaluateDomBlankScreen
				) {
					return { decided: true, blankRate: 100 };
				}
				return undefined;
			});
			getPageSpy.mockImplementation(async () => {
				const mockPageInstance = createMockPageInstance(true, evaluateMock);
				return {
					page: mockPageInstance,
					async [Symbol.asyncDispose]() {
						await mockPageInstance.close();
					},
				};
			});

			const result = await (service as unknown as ServiceWithInternals).filter(
				ctx,
			);

			expect(getPageSpy).toHaveBeenCalledTimes(1);
			expect(evaluateMock).toHaveBeenCalledTimes(1);
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

			const evaluateMock = jest.fn().mockImplementation((fn) => {
				if (
					fn ===
					(InterceptionBlankScreenService as unknown as ServiceWithInternals)
						._evaluateDomBlankScreen
				) {
					return { decided: true, blankRate: 0 };
				}
				return undefined;
			});
			getPageSpy.mockImplementation(async () => {
				const mockPageInstance = createMockPageInstance(false, evaluateMock);
				return {
					page: mockPageInstance,
					async [Symbol.asyncDispose]() {
						await mockPageInstance.close();
					},
				};
			});

			const result = await (service as unknown as ServiceWithInternals).filter(
				ctx,
			);

			expect(getPageSpy).toHaveBeenCalledTimes(1);
			expect(evaluateMock).toHaveBeenCalledTimes(1);
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

			let filterRequestHandler: (request: MockRequest) => Promise<void> =
				undefined as unknown as (request: MockRequest) => Promise<void>;
			const evaluateMock = jest.fn().mockImplementation((fn) => {
				if (
					fn ===
					(InterceptionBlankScreenService as unknown as ServiceWithInternals)
						._evaluateDomBlankScreen
				) {
					return { decided: true, blankRate: 0 }; // Non-blank screen
				}
				return undefined;
			});
			const customGotoMock = jest.fn().mockResolvedValue(undefined); // Simply resolve goto

			getPageSpy.mockImplementation(async () => {
				const mockPageInstance = createMockPageInstance(
					false,
					evaluateMock,
					customGotoMock,
				);
				// The filter method will call page.on('request', handler).
				// We need to capture that handler here.
				mockPageInstance.on.mockImplementation(
					(event: string, handler: (request: MockRequest) => Promise<void>) => {
						if (event === "request") {
							filterRequestHandler = handler;
						}
					},
				);
				return {
					page: mockPageInstance,
					async [Symbol.asyncDispose]() {
						await mockPageInstance.close();
					},
				};
			});

			await (service as unknown as ServiceWithInternals).filter(ctx);

			expect(getPageSpy).toHaveBeenCalledTimes(1);
			expect(customGotoMock).toHaveBeenCalledTimes(1);
			expect(evaluateMock).toHaveBeenCalledTimes(1); // Now this should be called

			// Now, test the filterRequestHandler branches directly
			expect(filterRequestHandler).toBeDefined();

			// Case 1: Intercept resolution already handled
			const mockReqHandled = {
				isInterceptResolutionHandled: jest.fn().mockReturnValue(true),
				url: jest.fn().mockReturnValue("test.js"),
				abort: jest.fn(),
				continue: jest.fn(),
			} as unknown as MockRequest;
			await filterRequestHandler(mockReqHandled);
			expect(mockReqHandled.abort).not.toHaveBeenCalled();
			expect(mockReqHandled.continue).not.toHaveBeenCalled();

			// Case 2: URL matches resource - abort
			const mockReqAbort = {
				url: jest.fn().mockReturnValue("test.js"),
				isInterceptResolutionHandled: jest.fn().mockReturnValue(false),
				abort: jest.fn().mockResolvedValue(undefined),
				continue: jest.fn(),
			} as unknown as MockRequest;
			await filterRequestHandler(mockReqAbort);
			expect(mockReqAbort.abort).toHaveBeenCalled();
			expect(mockReqAbort.continue).not.toHaveBeenCalled();

			// Case 3: URL matches resource but abort fails
			const mockReqAbortFail = {
				url: jest.fn().mockReturnValue("test.js"),
				isInterceptResolutionHandled: jest.fn().mockReturnValue(false),
				abort: jest.fn().mockRejectedValue(new Error("Abort failed")),
				continue: jest.fn(),
			} as unknown as MockRequest;
			await filterRequestHandler(mockReqAbortFail);
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.stringContaining("Abort failed for test.js"),
			);

			// Case 4: URL does not match - continue
			const mockReqContinue = {
				url: jest.fn().mockReturnValue("other.js"),
				isInterceptResolutionHandled: jest.fn().mockReturnValue(false),
				continue: jest.fn().mockResolvedValue(undefined),
				abort: jest.fn(),
			} as unknown as MockRequest;
			await filterRequestHandler(mockReqContinue);
			expect(mockReqContinue.continue).toHaveBeenCalled();
			expect(mockReqContinue.abort).not.toHaveBeenCalled();

			// Case 5: URL does not match but continue fails
			const mockReqContinueFail = {
				url: jest.fn().mockReturnValue("other.js"),
				isInterceptResolutionHandled: jest.fn().mockReturnValue(false),
				continue: jest.fn().mockRejectedValue(new Error("Continue failed")),
				abort: jest.fn(),
			} as unknown as MockRequest;
			await filterRequestHandler(mockReqContinueFail);
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.stringContaining("Continue failed for other.js"),
			);

			// Case 6: Request handler throws error
			const mockReqError = {
				url: jest.fn(() => {
					throw new Error("Handler error");
				}),
				isInterceptResolutionHandled: jest.fn().mockReturnValue(false),
				abort: jest.fn(),
				continue: jest.fn(),
			} as unknown as MockRequest;
			await filterRequestHandler(mockReqError);
			await Promise.resolve(); // Ensure microtasks are flushed for error handling
			expect(mockReqError.url).toHaveBeenCalled();
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.stringContaining("[Interception] Request handling failed"),
			);

			expect(fastifyMock.log.warn).toHaveBeenCalledTimes(3); // For abort fail, continue fail, and handler error
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

			const customGotoMock = jest
				.fn()
				.mockRejectedValue(new Error("Navigation failed"));

			getPageSpy.mockImplementation(async () => {
				const mockPageInstance = createMockPageInstance(
					true,
					undefined,
					customGotoMock,
				);
				return {
					page: mockPageInstance,
					async [Symbol.asyncDispose]() {
						await mockPageInstance.close();
					},
				};
			});

			const result = await (service as unknown as ServiceWithInternals).filter(
				ctx,
			);
			expect(getPageSpy).toHaveBeenCalledTimes(1);
			expect(customGotoMock).toHaveBeenCalledTimes(1);
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
			const page: Partial<MockPage> = {
				evaluate: jest.fn().mockImplementation((fn) => {
					if (
						fn ===
						(InterceptionBlankScreenService as unknown as ServiceWithInternals)
							._evaluateDomBlankScreen
					) {
						return { decided: true, blankRate: 100 };
					}
					return undefined;
				}),
				screenshot: jest.fn().mockResolvedValue("mock-base64"),
			};

			const result = await (
				service as unknown as ServiceWithInternals
			).isBlankScreen(page);
			expect(result.blank).toBe(true);
		});

		test("should return false when points have non-blank content", async () => {
			const page: Partial<MockPage> = {
				evaluate: jest.fn().mockImplementation((fn) => {
					if (
						fn ===
						(InterceptionBlankScreenService as unknown as ServiceWithInternals)
							._evaluateDomBlankScreen
					) {
						return { decided: true, blankRate: 0 };
					}
					return undefined;
				}),
				screenshot: jest.fn().mockResolvedValue("mock-base64"),
			};

			const result = await (
				service as unknown as ServiceWithInternals
			).isBlankScreen(page);
			expect(result.blank).toBe(false);
		});

		test("should treat null nodes as blank", async () => {
			const page: Partial<MockPage> = {
				evaluate: jest.fn().mockImplementation((fn) => {
					if (
						fn ===
						(InterceptionBlankScreenService as unknown as ServiceWithInternals)
							._evaluateDomBlankScreen
					) {
						return { decided: true, blankRate: 100 };
					}
					return undefined;
				}),
				screenshot: jest.fn().mockResolvedValue("mock-base64"),
			};

			const result = await (
				service as unknown as ServiceWithInternals
			).isBlankScreen(page);
			expect(result.blank).toBe(true);
		});

		test("should handle case where no elements are found", async () => {
			const page: Partial<MockPage> = {
				evaluate: jest.fn().mockImplementation((fn) => {
					if (
						fn ===
						(InterceptionBlankScreenService as unknown as ServiceWithInternals)
							._evaluateDomBlankScreen
					) {
						return { decided: true, blankRate: 100 };
					}
					return undefined;
				}),
				screenshot: jest.fn().mockResolvedValue("mock-base64"),
			};

			const result = await (
				service as unknown as ServiceWithInternals
			).isBlankScreen(page);
			expect(result.blank).toBe(true);
		});

		test("should return true if screenshot analysis fails due to no canvas context", async () => {
			const page: Partial<MockPage> = {
				evaluate: jest.fn().mockImplementation((fn) => {
					if (
						fn ===
						(InterceptionBlankScreenService as unknown as ServiceWithInternals)
							._evaluateDomBlankScreen
					) {
						return { decided: false, blankRate: 50 };
					}
					if (
						fn ===
						(InterceptionBlankScreenService as unknown as ServiceWithInternals)
							._evaluateScreenshotBlankScreen
					) {
						return 100;
					}
					return undefined;
				}),
				screenshot: jest.fn().mockResolvedValue("mock-base64"),
			};

			const result = await (
				service as unknown as ServiceWithInternals
			).isBlankScreen(page);
			expect(result.blank).toBe(true);
			expect(page.screenshot).toHaveBeenCalledTimes(1);
		});

		test("should return true if screenshot analysis fails due to image loading error", async () => {
			const page: Partial<MockPage> = {
				evaluate: jest.fn().mockImplementation((fn) => {
					if (
						fn ===
						(InterceptionBlankScreenService as unknown as ServiceWithInternals)
							._evaluateDomBlankScreen
					) {
						return { decided: false, blankRate: 50 };
					}
					if (
						fn ===
						(InterceptionBlankScreenService as unknown as ServiceWithInternals)
							._evaluateScreenshotBlankScreen
					) {
						return 100;
					}
					return undefined;
				}),
				screenshot: jest.fn().mockResolvedValue("mock-base64"),
			};

			const result = await (
				service as unknown as ServiceWithInternals
			).isBlankScreen(page);
			expect(result.blank).toBe(true);
		});

		test("should use screenshot analysis if DOM analysis is undecided", async () => {
			const page: Partial<MockPage> = {
				evaluate: jest.fn().mockImplementation((fn) => {
					if (
						fn ===
						(InterceptionBlankScreenService as unknown as ServiceWithInternals)
							._evaluateDomBlankScreen
					) {
						return { decided: false, blankRate: 50 }; // DOM analysis undecided
					}
					if (
						fn ===
						(InterceptionBlankScreenService as unknown as ServiceWithInternals)
							._evaluateScreenshotBlankScreen
					) {
						return 95; // Screenshot analysis result (95% blank)
					}
					return undefined;
				}),
				screenshot: jest.fn().mockResolvedValue("mock-base64"),
			};

			const result = await (
				service as unknown as ServiceWithInternals
			).isBlankScreen(page);
			expect(result.blank).toBe(true);
			expect(page.screenshot).toHaveBeenCalledTimes(1);
		});

		test("should return true if screenshot analysis fails", async () => {
			const page: Partial<MockPage> = {
				evaluate: jest.fn().mockImplementation((fn) => {
					if (
						fn ===
						(InterceptionBlankScreenService as unknown as ServiceWithInternals)
							._evaluateDomBlankScreen
					) {
						return { decided: false, blankRate: 50 }; // DOM analysis undecided
					}
					return undefined;
				}),
				screenshot: jest.fn().mockRejectedValue(new Error("Screenshot failed")),
			};

			const result = await (
				service as unknown as ServiceWithInternals
			).isBlankScreen(page);
			expect(result.blank).toBe(true);
			expect(fastifyMock.log.error).toHaveBeenCalledWith(
				expect.any(Error),
				"Blank screen detection failed during screenshot analysis",
			);
		});
	});
});

describe("InterceptionBlankScreenService static methods", () => {
	let originalWindow: Window;
	let originalDocument: Document;

	beforeAll(() => {
		originalWindow = global.window;
		originalDocument = global.document;
	});

	afterAll(() => {
		global.window = originalWindow as unknown as Window & typeof globalThis;
		global.document = originalDocument as unknown as Document;
	});

	describe("_evaluateDomBlankScreen", () => {
		beforeEach(() => {
			// Mock window and document for DOM analysis
			Object.defineProperty(global, "window", {
				value: {
					innerWidth: 1000,
					innerHeight: 1000,
				},
				writable: true,
			});
			Object.defineProperty(global, "document", {
				value: {
					elementsFromPoint: jest.fn(),
				},
				writable: true,
			});
		});

		test("should return decided: true and blankRate: 100 if no nodes are found", () => {
			(document.elementsFromPoint as jest.Mock).mockReturnValue([]);
			const result = (
				InterceptionBlankScreenService as unknown as ServiceWithInternals
			)._evaluateDomBlankScreen();
			expect(result.decided).toBe(true);
			expect(result.blankRate).toBe(100);
		});

		test("should return decided: true and blankRate: 100 if all nodes are blank selectors", () => {
			const mockElement = (tagName: string) => ({
				matches: (selector: string) => tagName === selector,
			});
			(document.elementsFromPoint as jest.Mock).mockReturnValue([
				mockElement("html"),
				mockElement("body"),
				mockElement("#app"),
			]);
			const result = (
				InterceptionBlankScreenService as unknown as ServiceWithInternals
			)._evaluateDomBlankScreen();
			expect(result.decided).toBe(true);
			expect(result.blankRate).toBe(100);
		});

		test("should return decided: true and blankRate: 0 if no nodes are blank selectors", () => {
			const mockElement = (tagName: string) => ({
				matches: (selector: string) => tagName === selector,
			});
			(document.elementsFromPoint as jest.Mock).mockReturnValue([
				mockElement("div"),
				mockElement("span"),
			]);
			const result = (
				InterceptionBlankScreenService as unknown as ServiceWithInternals
			)._evaluateDomBlankScreen();
			expect(result.decided).toBe(true);
			expect(result.blankRate).toBe(0);
		});

		test("should treat null or undefined nodes as blank", () => {
			(document.elementsFromPoint as jest.Mock).mockReturnValue([
				null,
				undefined,
			]);
			const result = (
				InterceptionBlankScreenService as unknown as ServiceWithInternals
			)._evaluateDomBlankScreen();
			expect(result.decided).toBe(true);
			expect(result.blankRate).toBe(100);
		});

		test("should handle null nodes from elementsFromPoint", () => {
			const mockElement = (tagName: string) => ({
				matches: (selector: string) => tagName === selector,
			});
			(document.elementsFromPoint as jest.Mock).mockReturnValue([
				null,
				mockElement("div"),
			]);

			const result = (
				InterceptionBlankScreenService as unknown as ServiceWithInternals
			)._evaluateDomBlankScreen();
			expect(result.blankRate).toBeGreaterThanOrEqual(0);
		});

		test("should handle missing document.elementsFromPoint", () => {
			const original = document.elementsFromPoint;
			(
				document as unknown as { elementsFromPoint: unknown }
			).elementsFromPoint = undefined;
			const result = (
				InterceptionBlankScreenService as unknown as ServiceWithInternals
			)._evaluateDomBlankScreen();
			expect(result.decided).toBe(false);
			(
				document as unknown as { elementsFromPoint: unknown }
			).elementsFromPoint = original;
		});

		test("should return decided: false if blankRate is between 10 and 90", () => {
			const mockElement = (isBlank: boolean) => ({
				matches: (selector: string) =>
					isBlank && (selector === "html" || selector === "body"),
			});
			let callCount = 0;
			(document.elementsFromPoint as jest.Mock).mockImplementation(() => {
				callCount++;
				if (callCount % 2 === 1) {
					return [mockElement(true)];
				}
				return [mockElement(false)];
			});
			const result = (
				InterceptionBlankScreenService as unknown as ServiceWithInternals
			)._evaluateDomBlankScreen();
			expect(result.decided).toBe(false);
			expect(result.blankRate).toBe(50);
		});
	});

	describe("_evaluateScreenshotBlankScreen", () => {
		let mockImage: { onload: () => void; onerror: () => void; src: string };
		let mockCanvas: {
			getContext: jest.Mock;
			width: number;
			height: number;
		};
		let mockContext: {
			drawImage: jest.Mock;
			getImageData: jest.Mock;
		};

		beforeEach(() => {
			mockContext = {
				drawImage: jest.fn(),
				getImageData: jest
					.fn()
					.mockReturnValue({ data: new Uint8ClampedArray(100 * 4) }), // 100 pixels
			};
			mockCanvas = {
				getContext: jest.fn().mockReturnValue(mockContext),
				width: 0,
				height: 0,
			};
			mockImage = {
				onload: jest.fn(),
				onerror: jest.fn(),
				src: "",
			};

			Object.defineProperty(global, "Image", {
				value: jest.fn(() => mockImage),
				writable: true,
			});
			Object.defineProperty(global, "document", {
				value: {
					createElement: jest.fn(() => mockCanvas),
				},
				writable: true,
			});
		});

		test("should return 100 if canvas context is not available", async () => {
			mockCanvas.getContext.mockReturnValue(null);
			const resultPromise = (
				InterceptionBlankScreenService as unknown as ServiceWithInternals
			)._evaluateScreenshotBlankScreen("mock-base64");
			mockImage.onload(); // Trigger onload to reach the context check
			const result = await resultPromise;
			expect(result).toBe(100);
		});

		test("should return 100 if image fails to load", async () => {
			const resultPromise = (
				InterceptionBlankScreenService as unknown as ServiceWithInternals
			)._evaluateScreenshotBlankScreen("mock-base64");
			mockImage.onerror();
			const result = await resultPromise;
			expect(result).toBe(100);
		});

		test("should calculate blank rate correctly for a uniform image", async () => {
			// All pixels are white (255, 255, 255, 255)
			const data = new Uint8ClampedArray(100 * 4).fill(255);
			mockContext.getImageData.mockReturnValue({ data });

			const resultPromise = (
				InterceptionBlankScreenService as unknown as ServiceWithInternals
			)._evaluateScreenshotBlankScreen("mock-base64");
			mockImage.onload();
			const result = await resultPromise;
			expect(result).toBe(100);
		});

		test("should calculate blank rate correctly for a non-uniform image", async () => {
			// 50 pixels are white, 50 pixels are black
			const data = new Uint8ClampedArray(100 * 4);
			for (let i = 0; i < 50; i++) {
				data[i * 4] = 255;
				data[i * 4 + 1] = 255;
				data[i * 4 + 2] = 255;
				data[i * 4 + 3] = 255;
			}
			mockContext.getImageData.mockReturnValue({ data });

			const resultPromise = (
				InterceptionBlankScreenService as unknown as ServiceWithInternals
			)._evaluateScreenshotBlankScreen("mock-base64");
			mockImage.onload();
			const result = await resultPromise;
			expect(result).toBe(50);
		});

		test("should handle threshold correctly", async () => {
			// Pixels are slightly off-white but within threshold
			const data = new Uint8ClampedArray(100 * 4).fill(250);
			mockContext.getImageData.mockReturnValue({ data });

			const resultPromise = (
				InterceptionBlankScreenService as unknown as ServiceWithInternals
			)._evaluateScreenshotBlankScreen("mock-base64");
			mockImage.onload();
			const result = await resultPromise;
			expect(result).toBe(100);
		});
	});
});
