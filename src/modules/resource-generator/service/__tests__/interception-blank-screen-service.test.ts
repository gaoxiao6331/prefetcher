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

function createMockPageInstance(
	blankScreenResult: boolean = true,
	evaluateMock?: jest.Mock,
	gotoMock?: jest.Mock,
) {
	// biome-ignore lint/suspicious/noExplicitAny: mock
	let requestHandler: any;
	const mockPageInstance = {
		evaluate:
			evaluateMock ||
			jest.fn().mockImplementation(async (fn: Function, ...args: any[]) => {
				if (
					fn === (InterceptionBlankScreenService as any)._evaluateDomBlankScreen
				) {
					return {
						decided: true,
						blankRate: blankScreenResult ? 100 : 0,
					};
				}
				if (
					fn ===
					(InterceptionBlankScreenService as any)._evaluateScreenshotBlankScreen
				) {
					return blankScreenResult ? 100 : 0;
				}
				console.log("mockPageInstance.evaluate called with unknown function");
				return undefined;
			}),
		on: jest.fn((event, handler) => {
			console.log(`mockPageInstance.on called for event: ${event}`);
			if (event === "request") {
				requestHandler = handler;
			}
		}),
		setRequestInterception: jest.fn(),
		goto:
			gotoMock ||
			jest.fn(async (url, options) => {
				console.log(`mockPageInstance.goto called with url: ${url}`);
				// Simulate a request being made and handled by the registered requestHandler
				if (requestHandler) {
					const mockRequest = {
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
	};
	return mockPageInstance;
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
		let getPageSpy: jest.SpyInstance;

		beforeEach(() => {
			getPageSpy = jest
				.spyOn(service as any, "getPage")
				.mockImplementation(async () => {
					console.log("[Test] getPageSpy mock called");
					const mockPageInstance = createMockPageInstance(
						true,
						mockPage.evaluate,
						mockPage.goto,
					); // Default to blank screen detected
					console.log("[Test] mockPageInstance created:", mockPageInstance);
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
					fn === (InterceptionBlankScreenService as any)._evaluateDomBlankScreen
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

			const result = await (service as any).filter(ctx);

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
					fn === (InterceptionBlankScreenService as any)._evaluateDomBlankScreen
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

			const result = await (service as any).filter(ctx);

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

			let filterRequestHandler: any;
			const evaluateMock = jest.fn().mockImplementation((fn) => {
				if (
					fn === (InterceptionBlankScreenService as any)._evaluateDomBlankScreen
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
					(event: string, handler: any) => {
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

			await (service as any).filter(ctx);

			expect(getPageSpy).toHaveBeenCalledTimes(1);
			expect(customGotoMock).toHaveBeenCalledTimes(1);
			expect(evaluateMock).toHaveBeenCalledTimes(1); // Now this should be called

			// Now, test the filterRequestHandler branches directly
			expect(filterRequestHandler).toBeDefined();

			// Case 1: Intercept resolution already handled
			const mockReqHandled = {
				isInterceptResolutionHandled: () => true,
				url: () => "test.js",
				abort: jest.fn(),
				continue: jest.fn(),
			};
			await filterRequestHandler(mockReqHandled);
			expect(mockReqHandled.abort).not.toHaveBeenCalled();
			expect(mockReqHandled.continue).not.toHaveBeenCalled();

			// Case 2: URL matches resource - abort
			const mockReqAbort = {
				url: () => "test.js",
				isInterceptResolutionHandled: () => false,
				abort: jest.fn().mockResolvedValue(undefined),
				continue: jest.fn(),
			};
			await filterRequestHandler(mockReqAbort);
			expect(mockReqAbort.abort).toHaveBeenCalled();
			expect(mockReqAbort.continue).not.toHaveBeenCalled();

			// Case 3: URL matches resource but abort fails
			const mockReqAbortFail = {
				url: () => "test.js",
				isInterceptResolutionHandled: () => false,
				abort: jest.fn().mockRejectedValue(new Error("Abort failed")),
				continue: jest.fn(),
			};
			await filterRequestHandler(mockReqAbortFail);
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.stringContaining("Abort failed for test.js"),
			);

			// Case 4: URL does not match - continue
			const mockReqContinue = {
				url: () => "other.js",
				isInterceptResolutionHandled: () => false,
				continue: jest.fn().mockResolvedValue(undefined),
				abort: jest.fn(),
			};
			await filterRequestHandler(mockReqContinue);
			expect(mockReqContinue.continue).toHaveBeenCalled();
			expect(mockReqContinue.abort).not.toHaveBeenCalled();

			// Case 5: URL does not match but continue fails
			const mockReqContinueFail = {
				url: () => "other.js",
				isInterceptResolutionHandled: () => false,
				continue: jest.fn().mockRejectedValue(new Error("Continue failed")),
				abort: jest.fn(),
			};
			await filterRequestHandler(mockReqContinueFail);
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.stringContaining("Continue failed for other.js"),
			);

			// Case 6: Request handler throws error
			const mockReqError = {
				url: jest.fn(() => {
					throw new Error("Handler error");
				}),
				isInterceptResolutionHandled: () => false,
				abort: jest.fn(),
				continue: jest.fn(),
			};
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

			// biome-ignore lint/suspicious/noExplicitAny: mock
			const result = await (service as any).filter(ctx);
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
			const page = {
				evaluate: jest.fn().mockImplementation((fn) => {
					if (
						fn ===
						(InterceptionBlankScreenService as any)._evaluateDomBlankScreen
					) {
						return { decided: true, blankRate: 100 };
					}
					return undefined;
				}),
				screenshot: jest.fn().mockResolvedValue("mock-base64"),
			};

			const result = await (service as any).isBlankScreen(page);
			expect(result.blank).toBe(true);
		});

		test("should return false when points have non-blank content", async () => {
			const page = {
				evaluate: jest.fn().mockImplementation((fn) => {
					if (
						fn ===
						(InterceptionBlankScreenService as any)._evaluateDomBlankScreen
					) {
						return { decided: true, blankRate: 0 };
					}
					return undefined;
				}),
				screenshot: jest.fn().mockResolvedValue("mock-base64"),
			};

			const result = await (service as any).isBlankScreen(page);
			expect(result.blank).toBe(false);
		});

		test("should treat null nodes as blank", async () => {
			const page = {
				evaluate: jest.fn().mockImplementation((fn) => {
					if (
						fn ===
						(InterceptionBlankScreenService as any)._evaluateDomBlankScreen
					) {
						return { decided: true, blankRate: 100 };
					}
					return undefined;
				}),
				screenshot: jest.fn().mockResolvedValue("mock-base64"),
			};

			const result = await (service as any).isBlankScreen(page);
			expect(result.blank).toBe(true);
		});

		test("should handle case where no elements are found", async () => {
			const page = {
				evaluate: jest.fn().mockImplementation((fn) => {
					if (
						fn ===
						(InterceptionBlankScreenService as any)._evaluateDomBlankScreen
					) {
						return { decided: true, blankRate: 100 };
					}
					return undefined;
				}),
				screenshot: jest.fn().mockResolvedValue("mock-base64"),
			};

			const result = await (service as any).isBlankScreen(page);
			expect(result.blank).toBe(true);
		});

		test("should return true if screenshot analysis fails due to no canvas context", async () => {
			const page = {
				evaluate: jest.fn().mockImplementation((fn) => {
					if (
						fn ===
						(InterceptionBlankScreenService as any)._evaluateDomBlankScreen
					) {
						return { decided: false, blankRate: 50 };
					}
					if (
						fn ===
						(InterceptionBlankScreenService as any)
							._evaluateScreenshotBlankScreen
					) {
						return 100;
					}
					return undefined;
				}),
				screenshot: jest.fn().mockResolvedValue("mock-base64"),
			};

			const result = await (service as any).isBlankScreen(page);
			expect(result.blank).toBe(true);
			expect(page.screenshot).toHaveBeenCalledTimes(1);
		});

		test("should return true if screenshot analysis fails due to image loading error", async () => {
			const page = {
				evaluate: jest.fn().mockImplementation((fn) => {
					if (
						fn ===
						(InterceptionBlankScreenService as any)._evaluateDomBlankScreen
					) {
						return { decided: false, blankRate: 50 };
					}
					if (
						fn ===
						(InterceptionBlankScreenService as any)
							._evaluateScreenshotBlankScreen
					) {
						return 100;
					}
					return undefined;
				}),
				screenshot: jest.fn().mockResolvedValue("mock-base64"),
			};

			const result = await (service as any).isBlankScreen(page);
			expect(result.blank).toBe(true);
			expect(page.screenshot).toHaveBeenCalledTimes(1);
		});

		test("should use screenshot analysis if DOM analysis is undecided", async () => {
			const page = {
				evaluate: jest.fn().mockImplementation((fn) => {
					if (
						fn ===
						(InterceptionBlankScreenService as any)._evaluateDomBlankScreen
					) {
						return { decided: false, blankRate: 50 }; // DOM analysis undecided
					}
					if (
						fn ===
						(InterceptionBlankScreenService as any)
							._evaluateScreenshotBlankScreen
					) {
						return 95; // Screenshot analysis result (95% blank)
					}
					return undefined;
				}),
				screenshot: jest.fn().mockResolvedValue("mock-base64"),
			};

			const result = await (service as any).isBlankScreen(page);
			expect(result.blank).toBe(true);
			expect(page.screenshot).toHaveBeenCalledTimes(1);
		});

		test("should return true if screenshot analysis fails", async () => {
			const page = {
				evaluate: jest.fn().mockImplementation((fn) => {
					if (
						fn ===
						(InterceptionBlankScreenService as any)._evaluateDomBlankScreen
					) {
						return { decided: false, blankRate: 50 }; // DOM analysis undecided
					}
					return undefined;
				}),
				screenshot: jest.fn().mockRejectedValue(new Error("Screenshot failed")),
			};

			const result = await (service as any).isBlankScreen(page);
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
		global.window = originalWindow as any;
		global.document = originalDocument as any;
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
				InterceptionBlankScreenService as any
			)._evaluateDomBlankScreen();
			expect(result).toEqual({ decided: true, blankRate: 100 });
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
				InterceptionBlankScreenService as any
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
				InterceptionBlankScreenService as any
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
				InterceptionBlankScreenService as any
			)._evaluateDomBlankScreen();
			expect(result.decided).toBe(true);
			expect(result.blankRate).toBe(100);
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
				} else {
					return [mockElement(false)];
				}
			});
			const result = (
				InterceptionBlankScreenService as any
			)._evaluateDomBlankScreen();
			expect(result.decided).toBe(false);
			expect(result.blankRate).toBe(50);
		});
	});

	describe("_evaluateScreenshotBlankScreen", () => {
		let mockImage: any;
		let mockCanvas: any;
		let mockContext: any;

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
			const promise = (
				InterceptionBlankScreenService as any
			)._evaluateScreenshotBlankScreen("mock-base64");
			mockImage.onload(); // Trigger onload
			const result = await promise;
			expect(result).toBe(100);
		});

		test("should return 100 if image fails to load", async () => {
			const promise = (
				InterceptionBlankScreenService as any
			)._evaluateScreenshotBlankScreen("mock-base64");
			mockImage.onerror(); // Trigger onerror
			const result = await promise;
			expect(result).toBe(100);
		});

		test("should calculate blank rate correctly for a uniform image", async () => {
			// Simulate a uniform image (all pixels are the same color)
			const imageData = new Uint8ClampedArray(4 * 100); // 100 pixels
			for (let i = 0; i < imageData.length; i += 4) {
				imageData[i] = 10; // R
				imageData[i + 1] = 20; // G
				imageData[i + 2] = 30; // B
				imageData[i + 3] = 255; // A
			}
			mockContext.getImageData.mockReturnValue({ data: imageData });

			const promise = (
				InterceptionBlankScreenService as any
			)._evaluateScreenshotBlankScreen("mock-base64");
			mockImage.onload();
			const result = await promise;
			expect(result).toBe(100); // All pixels are within threshold of the first
		});

		test("should calculate blank rate correctly for a non-uniform image", async () => {
			// Simulate an image with some different pixels
			const imageData = new Uint8ClampedArray(4 * 100); // 100 pixels
			for (let i = 0; i < imageData.length; i += 4) {
				imageData[i] = 10;
				imageData[i + 1] = 20;
				imageData[i + 2] = 30;
				imageData[i + 3] = 255;
			}
			// Change some pixels to be outside the threshold
			imageData[4 * 50] = 100; // Pixel 50 R
			imageData[4 * 51] = 100; // Pixel 51 R
			mockContext.getImageData.mockReturnValue({ data: imageData });

			const promise = (
				InterceptionBlankScreenService as any
			)._evaluateScreenshotBlankScreen("mock-base64");
			mockImage.onload();
			const result = await promise;
			// Expect 98% blank (2 pixels are different)
			expect(result).toBe(98);
		});

		test("should handle threshold correctly", async () => {
			const imageData = new Uint8ClampedArray(4 * 100); // 100 pixels
			for (let i = 0; i < imageData.length; i += 4) {
				imageData[i] = 10;
				imageData[i + 1] = 20;
				imageData[i + 2] = 30;
				imageData[i + 3] = 255;
			}
			// Change one pixel to be just within threshold (e.g., R=14, threshold=5)
			imageData[4 * 50] = 14;
			imageData[4 * 50 + 1] = 20;
			imageData[4 * 50 + 2] = 30;
			mockContext.getImageData.mockReturnValue({ data: imageData });

			const promise = (
				InterceptionBlankScreenService as any
			)._evaluateScreenshotBlankScreen("mock-base64");
			mockImage.onload();
			const result = await promise;
			expect(result).toBe(100); // Still 100% blank because it's within threshold
		});
	});
});
