import type { FastifyInstance } from "fastify";
import puppeteer from "puppeteer";
import type { GenerateContext } from "../../type";
import AllJsService from "../all-js-service";

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
const TEST_SCRIPT_URL = "http://example.com/script.js";
const TEST_REQUEST_ID = "test-request-id";
const BUFFER_SIZE = 1024;

// Helper function to create mock Fastify instance
function createMockFastify(): FastifyInstance {
	return {
		log: {
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
			debug: jest.fn(),
		},
	} as unknown as FastifyInstance;
}

// Helper function to create mock request
function createMockRequest(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		method: () => "GET",
		url: () => TEST_SCRIPT_URL,
		headers: () => ({}),
		continue: jest.fn().mockResolvedValue(undefined),
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
		setRequestInterception: jest.fn().mockResolvedValue(undefined),
		isClosed: jest.fn().mockReturnValue(false),
		close: jest.fn().mockResolvedValue(undefined),
		bringToFront: jest.fn().mockResolvedValue(undefined),
		setCacheEnabled: jest.fn().mockResolvedValue(undefined),
		waitForFunction: jest.fn().mockResolvedValue(undefined),
		evaluate: jest.fn().mockResolvedValue(undefined),
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
		close: jest.fn().mockResolvedValue(undefined),
		connected: true,
		on: jest.fn(),
	};
}

type MockBrowser = ReturnType<typeof createMockBrowser>;

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
		jest.useFakeTimers();

		mockPage = createMockPage();
		mockBrowser = createMockBrowser(mockPage);

		(puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);

		fastifyMock = createMockFastify();
		service = (await AllJsService.create(fastifyMock)) as AllJsService;
	});

	afterEach(async () => {
		jest.useRealTimers();
	});

	test("should initialize successfully", async () => {
		expect(service).toBeInstanceOf(AllJsService);
		expect(puppeteer.launch).toHaveBeenCalled();
	});

	describe("Resource Filtering and Ranking", () => {
		test("filter should keep only script resources", async () => {
			const ctx = {
				url: TEST_URL,
				capturedResources: [
					{ url: "1.js", type: "script", sizeKB: 10 },
					{ url: "1.css", type: "stylesheet", sizeKB: 20 },
					{ url: "1.png", type: "image", sizeKB: 30 },
				],
			} as unknown as GenerateContext;

			const result = await (service as unknown as ServiceWithInternals).filter(ctx);
			expect(result.capturedResources).toHaveLength(1);
			expect(result.capturedResources[0].type).toBe("script");
		});

		test("rank should sort resources by size in descending order", async () => {
			const ctx = {
				url: TEST_URL,
				capturedResources: [
					{ url: "small.js", sizeKB: 10 },
					{ url: "large.js", sizeKB: 100 },
					{ url: "medium.js", sizeKB: 50 },
				],
			} as unknown as GenerateContext;

			const result = await (service as unknown as ServiceWithInternals).rank(ctx);
			expect(result.capturedResources[0].url).toBe("large.js");
			expect(result.capturedResources[1].url).toBe("medium.js");
			expect(result.capturedResources[2].url).toBe("small.js");
		});
	});

	describe("Resource Capture", () => {
		test("should capture resources from page events", async () => {
			mockPage.goto.mockImplementation(async () => {
				const mockReq = createMockRequest();
				mockPage.emit("request", mockReq);

				// BaseService will assign "1" as the first request ID
				const mockRes = createMockResponse({
					request: () => ({
						method: () => "GET",
						headers: () => ({ "x-prefetcher-req-id": "1" }),
						resourceType: () => "script",
					}),
				});
				mockPage.emit("response", mockRes);
			});

			const capturePromise = service.captureResources(TEST_URL);
			
			// Allow microtasks to run and reach the setTimeout
			for (let i = 0; i < 10; i++) await Promise.resolve();
			
			// Advance timers to bypass RESOURCE_READY_WAIT_MS
			jest.advanceTimersByTime(5000);
			
			const resources = await capturePromise;
			expect(resources).toContain(TEST_SCRIPT_URL);
		}, 10000);

		test("should handle navigation errors gracefully", async () => {
			mockPage.goto.mockRejectedValue(new Error("Navigation failed"));
			const capturePromise = service.captureResources(TEST_URL);
			
			// Allow microtasks to run
			for (let i = 0; i < 10; i++) await Promise.resolve();
			
			// Even if navigation fails, it might still wait or cleanup
			jest.advanceTimersByTime(5000);
			
			const resources = await capturePromise;
			expect(resources).toEqual([]);
			expect(fastifyMock.log.error).toHaveBeenCalledWith(
				expect.any(Error),
				expect.stringContaining("Failed to capture resources"),
			);
		});
	});

	describe("Browser Management", () => {
		test("should handle browser disconnection", async () => {
			let disconnectHandler: () => void = () => {};
			mockBrowser.on.mockImplementation((event, handler) => {
				if (event === "disconnected") disconnectHandler = handler;
			});

			// Re-create service to trigger browser.on
			service = (await AllJsService.create(fastifyMock)) as AllJsService;
			
			disconnectHandler();
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.stringContaining("disconnected"),
			);
		});
	});
});
