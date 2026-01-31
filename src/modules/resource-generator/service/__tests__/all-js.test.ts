import type { FastifyInstance } from "fastify";
import puppeteer from "puppeteer";
import type { GenerateContext } from "../../type";
import AllJsService from "../all-js-service";

jest.mock("puppeteer");
jest.mock("@/utils/trace-context", () => ({
	bindAsyncContext: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
	getLogger: jest.fn().mockReturnValue(null),
}));

// Test constants
const TEST_URL = "http://example.com";
const TEST_SCRIPT_URL = "http://example.com/script.js";
const TEST_REQUEST_ID = "1";
const BUFFER_SIZE = 1024;

// Helper function to create mock page
function createMockPage() {
	return {
		on: jest.fn(),
		goto: jest.fn(),
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

// Helper function to create mock request
function createMockRequest(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		method: () => "GET",
		url: () => TEST_SCRIPT_URL,
		headers: () => ({}),
		continue: jest.fn(),
		isInterceptResolutionHandled: () => false,
		resourceType: () => "script",
		...overrides,
	};
}

// Helper function to create mock response
function createMockResponse(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		request: () => ({
			method: () => "GET",
			headers: () => ({ "x-prefetcher-req-id": TEST_REQUEST_ID }),
			resourceType: () => "script",
		}),
		status: () => 200,
		url: () => TEST_SCRIPT_URL,
		buffer: jest.fn().mockResolvedValue(Buffer.alloc(BUFFER_SIZE)),
		...overrides,
	};
}

describe("AllJsService", () => {
	let fastifyMock: FastifyInstance;
	let service: AllJsService;
	let mockPage: MockPage;
	let mockBrowser: MockBrowser;

	type ServiceWithInternals = AllJsService & {
		browser: MockBrowser | null;
		filter: (ctx: GenerateContext) => Promise<GenerateContext>;
		rank: (ctx: GenerateContext) => Promise<GenerateContext>;
	};

	beforeEach(async () => {
		jest.clearAllMocks();

		mockPage = createMockPage();
		mockBrowser = createMockBrowser(mockPage);

		(puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);

		fastifyMock = createMockFastify();
		service = (await AllJsService.create(fastifyMock)) as AllJsService;
	});

	test("should initialize successfully", async () => {
		expect(service).toBeInstanceOf(AllJsService);
		expect(puppeteer.launch).toHaveBeenCalled();
	});

	test("should handle browser disconnected event", async () => {
		let disconnectListener: (() => void) | undefined;
		(puppeteer.launch as jest.Mock).mockImplementationOnce(async () => {
			const browserWithListener = { ...mockBrowser, on: jest.fn() };
			browserWithListener.on.mockImplementation(
				(event: string, listener: () => void) => {
					if (event === "disconnected") disconnectListener = listener;
				},
			);
			return browserWithListener;
		});

		service = (await AllJsService.create(fastifyMock)) as AllJsService;
		if (disconnectListener) disconnectListener();
		expect(fastifyMock.log.warn).toHaveBeenCalledWith(
			expect.stringContaining("disconnected"),
		);
	});

	test("should handle browser init returning null", async () => {
		const browser = (service as unknown as ServiceWithInternals).browser;
		if (browser) {
			(browser as { connected: boolean }).connected = false;
		}
		(puppeteer.launch as jest.Mock).mockResolvedValueOnce(null);
		await expect(service.captureResources(TEST_URL)).rejects.toThrow(
			"Failed to initialize browser",
		);
	});

	test("should handle browser close and re-init in captureResources", async () => {
		const browser = (service as unknown as ServiceWithInternals).browser;
		if (browser) {
			(browser as { connected: boolean }).connected = false;
		}
		const newMockBrowser = {
			...mockBrowser,
			connected: true,
			close: jest.fn(),
		};
		(puppeteer.launch as jest.Mock).mockResolvedValueOnce(newMockBrowser);

		await service.captureResources(TEST_URL);
		expect(puppeteer.launch).toHaveBeenCalledTimes(2);
	});

	describe("Resource Capture", () => {
		test("should handle request and response events", async () => {
			let requestListener: ((arg: unknown) => void | Promise<void>) | undefined;
			let responseListener:
				| ((arg: unknown) => void | Promise<void>)
				| undefined;

			mockPage.on.mockImplementation(
				(event: string, listener: (arg: unknown) => void | Promise<void>) => {
					if (event === "request") requestListener = listener;
					if (event === "response") responseListener = listener;
				},
			);

			mockPage.goto.mockImplementation(async () => {
				const mockRequest = createMockRequest();
				if (requestListener) await requestListener(mockRequest);

				const mockResponse = createMockResponse();
				if (responseListener) await responseListener(mockResponse);
			});

			const resources = await service.captureResources(TEST_URL);
			expect(resources).toContain(TEST_SCRIPT_URL);
		});
	});

	describe("Request Interception", () => {
		test("should handle non-GET requests", async () => {
			let requestListener: ((arg: unknown) => void | Promise<void>) | undefined;
			mockPage.on.mockImplementation(
				(event: string, listener: (arg: unknown) => void | Promise<void>) => {
					if (event === "request") requestListener = listener;
				},
			);

			const mockPostRequest = createMockRequest({
				method: () => "POST",
			});

			mockPage.goto.mockImplementation(async () => {
				if (requestListener) await requestListener(mockPostRequest);
			});

			await service.captureResources(TEST_URL);
			expect(mockPostRequest.continue).toHaveBeenCalled();
		});

		test("should handle request interception failure", async () => {
			let requestListener: ((arg: unknown) => void | Promise<void>) | undefined;
			mockPage.on.mockImplementation(
				(event: string, listener: (arg: unknown) => void | Promise<void>) => {
					if (event === "request") requestListener = listener;
				},
			);

			const mockRequest = createMockRequest({
				method: () => {
					throw new Error("Method fail");
				},
				continue: jest.fn().mockRejectedValue(new Error("Continue fail")),
			});

			mockPage.goto.mockImplementation(async () => {
				if (requestListener) await requestListener(mockRequest);
			});

			await service.captureResources(TEST_URL);
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.stringContaining("Request interception failed"),
			);
		});

		test("should handle already resolved interception", async () => {
			let requestListener: ((arg: unknown) => void | Promise<void>) | undefined;
			mockPage.on.mockImplementation(
				(event: string, listener: (arg: unknown) => void | Promise<void>) => {
					if (event === "request") requestListener = listener;
				},
			);

			const mockRequest = createMockRequest({
				isInterceptResolutionHandled: () => true,
			});

			mockPage.goto.mockImplementation(async () => {
				if (requestListener) await requestListener(mockRequest);
			});

			await service.captureResources(TEST_URL);
			expect(mockRequest.continue).not.toHaveBeenCalled();
		});
	});

	describe("Response Processing", () => {
		test("should handle response processing failure", async () => {
			let responseListener:
				| ((arg: unknown) => void | Promise<void>)
				| undefined;
			mockPage.on.mockImplementation(
				(event: string, listener: (arg: unknown) => void | Promise<void>) => {
					if (event === "response") responseListener = listener;
				},
			);

			mockPage.goto.mockImplementation(async () => {
				const mockResponse = {
					request: () => {
						throw new Error("Response fail");
					},
				};
				if (responseListener) await responseListener(mockResponse);
			});

			await service.captureResources(TEST_URL);
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.stringContaining("Response processing failed"),
			);
		});

		test("should skip non-GET responses", async () => {
			let responseListener:
				| ((arg: unknown) => void | Promise<void>)
				| undefined;
			mockPage.on.mockImplementation(
				(event: string, listener: (arg: unknown) => void | Promise<void>) => {
					if (event === "response") responseListener = listener;
				},
			);

			mockPage.goto.mockImplementation(async () => {
				const mockResponse = createMockResponse({
					request: () => ({ method: () => "POST" }),
				});
				if (responseListener) await responseListener(mockResponse);
			});

			const resources = await service.captureResources(TEST_URL);
			expect(resources).toHaveLength(0);
		});

		test("should skip responses without request ID", async () => {
			let responseListener:
				| ((arg: unknown) => void | Promise<void>)
				| undefined;
			mockPage.on.mockImplementation(
				(event: string, listener: (arg: unknown) => void | Promise<void>) => {
					if (event === "response") responseListener = listener;
				},
			);

			mockPage.goto.mockImplementation(async () => {
				const mockResponse = createMockResponse({
					request: () => ({ method: () => "GET", headers: () => ({}) }),
				});
				if (responseListener) await responseListener(mockResponse);
			});

			const resources = await service.captureResources(TEST_URL);
			expect(resources).toHaveLength(0);
		});

		test("should handle various HTTP status codes", async () => {
			let requestListener: ((arg: unknown) => void | Promise<void>) | undefined;
			let responseListener:
				| ((arg: unknown) => void | Promise<void>)
				| undefined;

			mockPage.on.mockImplementation(
				(event: string, listener: (arg: unknown) => void | Promise<void>) => {
					if (event === "request") requestListener = listener;
					if (event === "response") responseListener = listener;
				},
			);

			mockPage.goto.mockImplementation(async () => {
				// Set up request first
				if (requestListener) {
					await requestListener(
						createMockRequest({
							headers: () => ({ "x-prefetcher-req-id": TEST_REQUEST_ID }),
						}),
					);
				}

				// Test various status codes
				const statusCodes = [100, 199, 200, 299, 300, 500];
				for (const status of statusCodes) {
					if (responseListener) {
						await responseListener(
							createMockResponse({
								status: () => status,
								url: () => `${TEST_URL}/${status}.js`,
							}),
						);
					}
				}
			});

			await service.captureResources(TEST_URL);
			// Only 200 and 299 should be captured (2xx range)
			expect(fastifyMock.log.warn).not.toHaveBeenCalledWith(
				expect.stringContaining("Response processing failed"),
			);
		});

		test("should handle buffer retrieval failure", async () => {
			let requestListener: ((arg: unknown) => void | Promise<void>) | undefined;
			let responseListener:
				| ((arg: unknown) => void | Promise<void>)
				| undefined;

			mockPage.on.mockImplementation(
				(event: string, listener: (arg: unknown) => void | Promise<void>) => {
					if (event === "request") requestListener = listener;
					if (event === "response") responseListener = listener;
				},
			);

			mockPage.goto.mockImplementation(async () => {
				if (requestListener) {
					await requestListener(
						createMockRequest({
							headers: () => ({ "x-prefetcher-req-id": TEST_REQUEST_ID }),
						}),
					);
				}

				if (responseListener) {
					await responseListener(
						createMockResponse({
							buffer: jest.fn().mockRejectedValue(new Error("Buffer fail")),
						}),
					);
				}
			});

			await service.captureResources(TEST_URL);
			// Should not throw, buffer errors are silently handled
			expect(fastifyMock.log.warn).not.toHaveBeenCalledWith(
				expect.stringContaining("Response processing failed"),
			);
		});
	});

	describe("Filter and Rank", () => {
		test("filter should return context as is", async () => {
			const ctx = {
				url: TEST_URL,
				capturedResources: [],
			} as GenerateContext;
			const result = await (service as unknown as ServiceWithInternals).filter(
				ctx,
			);
			expect(result.capturedResources).toEqual(ctx.capturedResources);
		});

		test("rank should return context as is", async () => {
			const ctx = {
				url: TEST_URL,
				capturedResources: [],
			} as GenerateContext;
			const result = await (service as unknown as ServiceWithInternals).rank(
				ctx,
			);
			expect(result.capturedResources).toEqual(ctx.capturedResources);
		});
	});

	describe("Page Management", () => {
		test("should not close already closed page", async () => {
			mockPage.isClosed.mockReturnValue(true);
			await service.captureResources(TEST_URL);
			expect(mockPage.close).not.toHaveBeenCalled();
		});
	});

	describe("Edge Cases", () => {
		test("should handle complex edge case scenarios", async () => {
			let requestListener: ((arg: unknown) => void | Promise<void>) | undefined;
			let responseListener:
				| ((arg: unknown) => void | Promise<void>)
				| undefined;

			mockPage.on.mockImplementation(
				(event: string, listener: (arg: unknown) => void | Promise<void>) => {
					if (event === "request") requestListener = listener;
					if (event === "response") responseListener = listener;
				},
			);

			mockPage.goto.mockImplementation(async () => {
				// 1. Normal request to populate map
				if (requestListener) {
					await requestListener(
						createMockRequest({
							headers: () => ({ "x-prefetcher-req-id": TEST_REQUEST_ID }),
						}),
					);
				}

				// 2. Already handled interception
				if (requestListener) {
					await requestListener(
						createMockRequest({
							isInterceptResolutionHandled: () => true,
						}),
					);
				}

				// 3. Interception failure with continue error
				if (requestListener) {
					await requestListener(
						createMockRequest({
							method: () => {
								throw new Error("Trigger catch");
							},
							continue: jest.fn().mockRejectedValue(new Error("Continue fail")),
						}),
					);
				}

				// 4. Interception failure when already handled in catch block
				if (requestListener) {
					const reqHandled = {
						isInterceptResolutionHandled: jest
							.fn()
							.mockReturnValueOnce(false)
							.mockReturnValueOnce(true),
						method: () => {
							throw new Error("Trigger catch again");
						},
						continue: jest.fn(),
					};
					await requestListener(reqHandled);
				}

				// 5. Response with unknown request ID
				if (responseListener) {
					await responseListener(
						createMockResponse({
							request: () => ({
								method: () => "GET",
								headers: () => ({ "x-prefetcher-req-id": "unknown" }),
							}),
						}),
					);
				}
			});

			await service.captureResources(TEST_URL);
			expect(fastifyMock.log.warn).toHaveBeenCalled();
		});
	});
});
