import type { FastifyInstance } from "fastify";
import puppeteer from "puppeteer";
import type { GenerateContext } from "../../type";
import BaseService from "../base";

jest.mock("puppeteer");
jest.mock("@/utils/trace-context", () => ({
	bindAsyncContext: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
	getLogger: jest.fn().mockReturnValue(null),
}));
jest.mock("@/utils/is", () => ({
	isDebugMode: jest.fn().mockReturnValue(false),
}));

import { isDebugMode } from "@/utils/is";

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
		config: {},
	} as unknown as FastifyInstance;
}

// Helper function to create mock browser
function createMockBrowser(connected = true) {
	const handlers = new Map<string, Set<(...args: unknown[]) => unknown>>();
	const mock = {
		close: jest.fn().mockResolvedValue(undefined),
		connected,
		on: jest.fn().mockImplementation((event: string, handler: (...args: unknown[]) => unknown) => {
			const set = handlers.get(event);
			if (set) {
				set.add(handler);
			} else {
				handlers.set(event, new Set([handler]));
			}
			return mock;
		}),
		emit: (event: string, ...args: unknown[]) => {
			const set = handlers.get(event);
			if (set) {
				for (const h of set) {
					h(...args);
				}
			}
		},
		newPage: jest.fn(),
	};
	return mock;
}

// Helper function to create mock page
function createMockPage() {
	const handlers = new Map<string, Set<(...args: unknown[]) => unknown>>();
	const mock = {
		on: jest.fn().mockImplementation((event: string, handler: (...args: unknown[]) => unknown) => {
			const set = handlers.get(event);
			if (set) {
				set.add(handler);
			} else {
				handlers.set(event, new Set([handler]));
			}
			return mock;
		}),
		emit: (event: string, ...args: unknown[]) => {
			const set = handlers.get(event);
			if (set) {
				for (const h of set) {
					h(...args);
				}
			}
		},
		goto: jest.fn(),
		setRequestInterception: jest.fn(),
		isClosed: jest.fn().mockReturnValue(false),
		close: jest.fn(),
	};
	return mock;
}

function createMockRequest(overrides = {}) {
	return {
		method: () => "GET",
		url: () => "http://example.com/script.js",
		headers: () => ({}),
		resourceType: () => "script",
		continue: jest.fn().mockResolvedValue(undefined),
		isInterceptResolutionHandled: () => false,
		...overrides,
	};
}

function createMockResponse(overrides: any = {}) {
	const mockReq = createMockRequest(overrides.request ? overrides.request() : {});
	return {
		status: () => 200,
		url: () => "http://example.com/script.js",
		request: () => mockReq,
		buffer: jest.fn().mockResolvedValue(Buffer.from("test")),
		...overrides,
	};
}

// Test implementation of BaseService
class TestService extends BaseService {
	protected async filter(ctx: GenerateContext) {
		return ctx;
	}

	protected async rank(ctx: GenerateContext) {
		return ctx;
	}

	public async generate() {
		return { resources: [], resultFileName: "test" };
	}

	// Expose protected method for testing
	public async triggerGetPage() {
		return (
			this as unknown as TestService & { getPage: () => Promise<unknown> }
		).getPage();
	}
}

type ServiceWithInternals = {
	browser: ReturnType<typeof createMockBrowser> | null;
	initBrowser: () => Promise<void>;
};

describe("BaseService", () => {
	let fastifyMock: FastifyInstance;

	beforeEach(() => {
		fastifyMock = createMockFastify();
		jest.clearAllMocks();
	});

	describe("Browser Initialization", () => {
		test("should create service instance correctly", async () => {
			const mockBrowser = createMockBrowser(true);
			(puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);
			
			const service = await TestService.create(fastifyMock);
			expect(service).toBeInstanceOf(TestService);
			expect(puppeteer.launch).toHaveBeenCalled();
		});

		test("should handle browser initialization failure", async () => {
			const service = new TestService(fastifyMock);

			(puppeteer.launch as jest.Mock).mockResolvedValue(null);

			await expect(service.triggerGetPage()).rejects.toThrow(
				"Failed to initialize browser",
			);
		});

		test("should return early if browser already exists and is connected", async () => {
			const service = new TestService(fastifyMock);
			const mockBrowser = createMockBrowser(true);
			(service as unknown as ServiceWithInternals).browser =
				mockBrowser as unknown as ReturnType<typeof createMockBrowser>;

			await (service as unknown as ServiceWithInternals).initBrowser();

			expect(puppeteer.launch).not.toHaveBeenCalled();
		});

		test("should re-initialize if browser is disconnected", async () => {
			const mockPage = createMockPage();
			const disconnectedBrowser = createMockBrowser(false);
			const newBrowser = createMockBrowser(true);

			newBrowser.newPage.mockResolvedValue(mockPage);
			(puppeteer.launch as jest.Mock).mockResolvedValue(newBrowser);

			const service = new TestService(fastifyMock);
			(service as unknown as ServiceWithInternals).browser =
				disconnectedBrowser as unknown as ReturnType<typeof createMockBrowser>;

			await service.triggerGetPage();

			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.stringContaining("Browser not connected"),
			);
			expect(disconnectedBrowser.close).toHaveBeenCalled();
			expect(puppeteer.launch).toHaveBeenCalled();
		});

		test("should throw if initBrowser fails to set browser", async () => {
			const service = new TestService(fastifyMock);

			// Mock initBrowser to do nothing (not set this.browser)
			jest
				.spyOn(service as unknown as ServiceWithInternals, "initBrowser")
				.mockImplementation(async () => {});

			await expect(service.triggerGetPage()).rejects.toThrow(
				"Failed to initialize browser",
			);
		});
	});

	describe("Browser Cleanup", () => {
		test("should be idempotent when no browser exists", async () => {
			const service = new TestService(fastifyMock);

			await service.close();

			expect(fastifyMock.log.info).not.toHaveBeenCalledWith(
				"Puppeteer browser closed",
			);
		});

		test("should close browser if it exists", async () => {
			const mockBrowser = createMockBrowser();
			const service = new TestService(fastifyMock);
			(service as unknown as ServiceWithInternals).browser =
				mockBrowser as unknown as ReturnType<typeof createMockBrowser>;

			await service.close();

			expect(mockBrowser.close).toHaveBeenCalled();
			expect(fastifyMock.log.info).toHaveBeenCalledWith(
				"Puppeteer browser closed",
			);
			expect((service as unknown as ServiceWithInternals).browser).toBeNull();
		});

		test("should log error if browser close fails", async () => {
			const mockBrowser = createMockBrowser();
			mockBrowser.close.mockRejectedValueOnce(new Error("Close error"));
			const service = new TestService(fastifyMock);
			(service as unknown as ServiceWithInternals).browser =
				mockBrowser as unknown as ReturnType<typeof createMockBrowser>;

			await service.close();

			expect(fastifyMock.log.error).toHaveBeenCalledWith(
				expect.any(Error),
				"Failed to close browser",
			);
			expect((service as unknown as ServiceWithInternals).browser).toBeNull();
		});
	});

	describe("Resource Capture", () => {
		let service: TestService;
		let mockPage: any;
		let mockBrowser: any;

		beforeEach(async () => {
			jest.useFakeTimers();
			service = new TestService(fastifyMock);
			mockPage = createMockPage();
			mockBrowser = createMockBrowser(true);
			mockBrowser.newPage.mockResolvedValue(mockPage);
			(service as any).browser = mockBrowser;
			(puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);
		});

		afterEach(() => {
			jest.useRealTimers();
		});

		test("should capture resources correctly", async () => {
			mockPage.goto.mockImplementation(async () => {
				// Emit request
				const mockReq = createMockRequest({
					headers: () => ({}),
				});
				mockPage.emit("request", mockReq);

				// BaseService assigns "1" to the first request
				const mockRes = createMockResponse({
					request: () => ({
						method: () => "GET",
						headers: () => ({ "x-prefetcher-req-id": "1" }),
						resourceType: () => "script",
					}),
					buffer: () => Promise.resolve(Buffer.from("a".repeat(1024))), // 1KB
				});
				mockPage.emit("response", mockRes);
			});

			const capturePromise = service.captureResources("http://example.com");
			
			// Allow all internal promises to settle up to the setTimeout
			for (let i = 0; i < 10; i++) await Promise.resolve();
			
			// Advance timers to skip RESOURCE_READY_WAIT_MS
			jest.advanceTimersByTime(5000);
			
			const resources = await capturePromise;
			expect(resources).toHaveLength(1);
			expect(resources[0]).toBe("http://example.com/script.js");
		});

		test("should skip response if requestId is missing", async () => {
			const service = new TestService(fastifyMock);
			const mockBrowser = createMockBrowser(true);
			const mockPage = createMockPage();
			mockBrowser.newPage.mockResolvedValue(mockPage);
			(service as any).browser = mockBrowser;

			mockPage.goto.mockImplementation(async () => {
				const mockRes = createMockResponse({
					request: () => ({
						method: () => "GET",
						headers: () => ({}), // Missing x-prefetcher-req-id
						resourceType: () => "script",
					}),
				});
				mockPage.emit("response", mockRes);
			});

			const capturePromise = service.captureResources("http://example.com");
			for (let i = 0; i < 10; i++) await Promise.resolve();
			jest.advanceTimersByTime(5000);
			const resources = await capturePromise;
			expect(resources).toHaveLength(0);
		});

		test("should skip response if request info is missing in map", async () => {
			const service = new TestService(fastifyMock);
			const mockBrowser = createMockBrowser(true);
			const mockPage = createMockPage();
			mockBrowser.newPage.mockResolvedValue(mockPage);
			(service as any).browser = mockBrowser;

			mockPage.goto.mockImplementation(async () => {
				const mockRes = createMockResponse({
					request: () => ({
						method: () => "GET",
						headers: () => ({ "x-prefetcher-req-id": "999" }), // ID not in map
						resourceType: () => "script",
					}),
				});
				mockPage.emit("response", mockRes);
			});

			const capturePromise = service.captureResources("http://example.com");
			for (let i = 0; i < 10; i++) await Promise.resolve();
			jest.advanceTimersByTime(5000);
			const resources = await capturePromise;
			expect(resources).toHaveLength(0);
		});

		test("should handle navigation error", async () => {
			mockPage.goto.mockRejectedValue(new Error("Navigation failed"));
			const capturePromise = service.captureResources("http://example.com");
			
			const resources = await capturePromise;
			expect(resources).toHaveLength(0);
			expect(fastifyMock.log.error).toHaveBeenCalledWith(
				expect.any(Error),
				expect.stringContaining("Failed to capture resources")
			);
		});

		test("should handle non-GET requests in interception", async () => {
			mockPage.goto.mockImplementation(async () => {
				const mockReq = createMockRequest({
					method: () => "POST",
				});
				mockPage.emit("request", mockReq);
				expect(mockReq.continue).toHaveBeenCalled();
			});
			const capturePromise = service.captureResources("http://example.com");
			for (let i = 0; i < 10; i++) await Promise.resolve();
			jest.advanceTimersByTime(5000);
			await capturePromise;
		});

		test("should handle request interception error", async () => {
			mockPage.goto.mockImplementation(async () => {
				const mockReq = createMockRequest({
					method: () => { throw new Error("Method error"); },
				});
				mockPage.emit("request", mockReq);
			});
			const capturePromise = service.captureResources("http://example.com");
			for (let i = 0; i < 10; i++) await Promise.resolve();
			jest.advanceTimersByTime(5000);
			await capturePromise;
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.stringContaining("Request interception failed")
			);
		});

		test("should handle response processing error", async () => {
			mockPage.goto.mockImplementation(async () => {
				const mockReq = createMockRequest();
				mockPage.emit("request", mockReq);

				const mockRes = createMockResponse({
					request: () => ({
						method: () => "GET",
						headers: () => ({ "x-prefetcher-req-id": "1" }),
						resourceType: () => "script",
					}),
					status: () => { throw new Error("Status error"); },
				});
				mockPage.emit("response", mockRes);
			});
			const capturePromise = service.captureResources("http://example.com");
			for (let i = 0; i < 10; i++) await Promise.resolve();
			jest.advanceTimersByTime(5000);
			await capturePromise;
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.stringContaining("Response processing failed")
			);
		});

		test("should handle response buffer error", async () => {
			mockPage.goto.mockImplementation(async () => {
				const mockReq = createMockRequest();
				mockPage.emit("request", mockReq);

				const mockRes = createMockResponse({
					request: () => ({
						method: () => "GET",
						headers: () => ({ "x-prefetcher-req-id": "1" }),
						resourceType: () => "script",
					}),
					buffer: () => Promise.reject(new Error("Buffer error")),
				});
				mockPage.emit("response", mockRes);
			});
			const capturePromise = service.captureResources("http://example.com");
			for (let i = 0; i < 10; i++) await Promise.resolve();
			jest.advanceTimersByTime(5000);
			const resources = await capturePromise;
			expect(resources).toHaveLength(1);
		});

		test("should log error if page close fails", async () => {
			const service = new TestService(fastifyMock);
			const mockBrowser = createMockBrowser(true);
			const mockPage = createMockPage();
			mockBrowser.newPage.mockResolvedValue(mockPage);
			(puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);

			mockPage.close.mockRejectedValue(new Error("Close error"));

			await (async () => {
				await using pageObj = await service.triggerGetPage();
				// pageObj will be disposed here
			})();

			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.any(Error),
				"Failed to close page"
			);
		});

		test("should handle request continue error when intercept is not handled", async () => {
			const service = new TestService(fastifyMock);
			const mockBrowser = createMockBrowser(true);
			const mockPage = createMockPage();
			mockBrowser.newPage.mockResolvedValue(mockPage);
			(service as any).browser = mockBrowser;

			mockPage.goto.mockImplementation(async () => {
				const mockReq = createMockRequest({
					isInterceptResolutionHandled: jest.fn()
						.mockReturnValueOnce(false) // First call in try block
						.mockReturnValueOnce(false), // Second call in catch block
					continue: jest.fn()
						.mockRejectedValueOnce(new Error("Continue error"))
						.mockResolvedValueOnce(undefined),
				});
				mockPage.emit("request", mockReq);
				
				// Allow the catch block's continue().catch() to settle
				await Promise.resolve();
				await Promise.resolve();

				// Second continue call (in catch block)
				expect(mockReq.continue).toHaveBeenCalledTimes(2);
			});

			const capturePromise = service.captureResources("http://example.com");
			for (let i = 0; i < 10; i++) await Promise.resolve();
			jest.advanceTimersByTime(5000);
			await capturePromise;
		});

		test("should skip continue in catch block if intercept is already handled", async () => {
			const service = new TestService(fastifyMock);
			const mockBrowser = createMockBrowser(true);
			const mockPage = createMockPage();
			mockBrowser.newPage.mockResolvedValue(mockPage);
			(service as any).browser = mockBrowser;

			mockPage.goto.mockImplementation(async () => {
				const mockReq = createMockRequest({
					isInterceptResolutionHandled: jest.fn()
						.mockReturnValueOnce(false) // First call in try block
						.mockReturnValueOnce(true),  // Second call in catch block
					continue: jest.fn().mockImplementation(() => {
						throw new Error("Initial continue error");
					}),
				});
				mockPage.emit("request", mockReq);
				// Only one continue call (in try block)
				expect(mockReq.continue).toHaveBeenCalledTimes(1);
			});

			const capturePromise = service.captureResources("http://example.com");
			for (let i = 0; i < 10; i++) await Promise.resolve();
			jest.advanceTimersByTime(5000);
			await capturePromise;
		});

		test("should handle already handled request in captureResources", async () => {
			const service = new TestService(fastifyMock);
			const mockBrowser = createMockBrowser(true);
			const mockPage = createMockPage();
			mockBrowser.newPage.mockResolvedValue(mockPage);
			(service as any).browser = mockBrowser;

			mockPage.goto.mockImplementation(async () => {
				const mockReq = createMockRequest({
					isInterceptResolutionHandled: () => true,
				});
				mockPage.emit("request", mockReq);
				expect(mockReq.continue).not.toHaveBeenCalled();
			});

			const capturePromise = service.captureResources("http://example.com");
			for (let i = 0; i < 10; i++) await Promise.resolve();
			jest.advanceTimersByTime(5000);
			await capturePromise;
		});

		test("should skip non-2xx responses", async () => {
			const service = new TestService(fastifyMock);
			const mockBrowser = createMockBrowser(true);
			const mockPage = createMockPage();
			mockBrowser.newPage.mockResolvedValue(mockPage);
			(service as any).browser = mockBrowser;

			mockPage.goto.mockImplementation(async () => {
				const mockReq = createMockRequest();
				mockPage.emit("request", mockReq);

				const mockRes = createMockResponse({
					status: () => 404,
					request: () => ({
						method: () => "GET",
						headers: () => ({ "x-prefetcher-req-id": "1" }),
						resourceType: () => "script",
					}),
				});
				mockPage.emit("response", mockRes);
			});
			const capturePromise = service.captureResources("http://example.com");
			for (let i = 0; i < 10; i++) await Promise.resolve();
			jest.advanceTimersByTime(5000);
			const resources = await capturePromise;
			expect(resources).toHaveLength(0);
		});

		test("should skip non-GET responses", async () => {
			const service = new TestService(fastifyMock);
			const mockBrowser = createMockBrowser(true);
			const mockPage = createMockPage();
			mockBrowser.newPage.mockResolvedValue(mockPage);
			(service as any).browser = mockBrowser;

			mockPage.goto.mockImplementation(async () => {
				const mockReq = createMockRequest();
				mockPage.emit("request", mockReq);

				const mockRes = createMockResponse({
					request: () => ({
						method: () => "POST",
						headers: () => ({ "x-prefetcher-req-id": "1" }),
						resourceType: () => "script",
					}),
				});
				mockPage.emit("response", mockRes);
			});
			const capturePromise = service.captureResources("http://example.com");
			for (let i = 0; i < 10; i++) await Promise.resolve();
			jest.advanceTimersByTime(5000);
			const resources = await capturePromise;
			expect(resources).toHaveLength(0);
		});

		test("should log error if browser close fails", async () => {
			const service = new TestService(fastifyMock);
			const mockBrowser = createMockBrowser(true);
			(service as any).browser = mockBrowser;
			mockBrowser.close.mockRejectedValue(new Error("Browser close error"));

			await service.close();
			expect(fastifyMock.log.error).toHaveBeenCalledWith(
				expect.any(Error),
				"Failed to close browser"
			);
		});
	});

	test("should create service instance using static create method", async () => {
		const mockBrowser = createMockBrowser(true);
		(puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);
		const serviceInstance = await TestService.create(fastifyMock);
		expect(serviceInstance).toBeInstanceOf(TestService);
		expect(mockBrowser.newPage).not.toHaveBeenCalled(); // Browser is just initialized, no page created yet
		expect(puppeteer.launch).toHaveBeenCalled();
	});

	describe("Console Logging", () => {
		let service: TestService;
		let mockPage: any;

		beforeEach(async () => {
			service = new TestService(fastifyMock);
			mockPage = createMockPage();
			const mockBrowser = createMockBrowser(true);
			mockBrowser.newPage.mockResolvedValue(mockPage);
			(service as any).browser = mockBrowser;
		});

		test("should log browser errors", async () => {
			await (service as any).getPage();
			const consoleHandler = mockPage.on.mock.calls.find((call: any) => call[0] === "console")[1];
			
			consoleHandler({ type: () => "error", text: () => "Test Error" });
			expect(fastifyMock.log.error).toHaveBeenCalledWith("[Browser] Test Error");
		});

		test("should log browser warnings", async () => {
			await (service as any).getPage();
			const consoleHandler = mockPage.on.mock.calls.find((call: any) => call[0] === "console")[1];
			
			consoleHandler({ type: () => "warn", text: () => "Test Warn" });
			expect(fastifyMock.log.warn).toHaveBeenCalledWith("[Browser] Test Warn");
		});

		test("should log browser debug messages in debug mode", async () => {
			(isDebugMode as jest.Mock).mockReturnValue(true);
			await (service as any).getPage();
			const consoleHandler = mockPage.on.mock.calls.find((call: any) => call[0] === "console")[1];
			
			consoleHandler({ type: () => "log", text: () => "Test Log" });
			expect(fastifyMock.log.debug).toHaveBeenCalledWith("[Browser] Test Log");
			(isDebugMode as jest.Mock).mockReturnValue(false);
		});

		test("should not log browser debug messages if not in debug mode", async () => {
			(isDebugMode as jest.Mock).mockReturnValue(false);
			await (service as any).getPage();
			const consoleHandler = mockPage.on.mock.calls.find((call: any) => call[0] === "console")[1];
			
			consoleHandler({ type: () => "log", text: () => "Test Log" });
			expect(fastifyMock.log.debug).not.toHaveBeenCalled();
		});

		test("should skip closing page if it is already closed during disposal", async () => {
			await (service as any).getPage();
			mockPage.isClosed.mockReturnValue(true);
			
			await (async () => {
				await using pageObj = await (service as any).getPage();
				// pageObj will be disposed here
			})();

			expect(mockPage.close).not.toHaveBeenCalled();
		});
	});

	describe("Browser Events", () => {
		test("should handle browser disconnection", async () => {
			const service = new TestService(fastifyMock);
			const mockBrowser = createMockBrowser(true);
			(puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);
			
			await (service as any).initBrowser();
			expect((service as any).browser).toBe(mockBrowser);
			
			mockBrowser.emit("disconnected");
			expect((service as any).browser).toBeNull();
			expect(fastifyMock.log.warn).toHaveBeenCalledWith("Puppeteer browser disconnected");
		});
	});
});
