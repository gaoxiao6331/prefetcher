import type { FastifyInstance } from "fastify";
import puppeteer from "puppeteer";
import type { GenerateContext } from "../../type";
import BaseService from "../base";

jest.mock("puppeteer");

// Helper function to create mock Fastify instance
function createMockFastify(): FastifyInstance {
	return {
		log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
		config: {},
	} as unknown as FastifyInstance;
}

// Helper function to create mock browser
function createMockBrowser(connected = true) {
	return {
		close: jest.fn().mockResolvedValue(undefined),
		connected,
		on: jest.fn(),
		newPage: jest.fn(),
	};
}

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

	describe("Page Management", () => {
		test("should create new page with request interception enabled", async () => {
			const mockPage = createMockPage();
			const mockBrowser = createMockBrowser(true);
			mockBrowser.newPage.mockResolvedValue(mockPage);

			(puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);

			const service = new TestService(fastifyMock);
			(service as unknown as ServiceWithInternals).browser =
				mockBrowser as unknown as ReturnType<typeof createMockBrowser>;

			const pageObj = await service.triggerGetPage();

			expect(mockBrowser.newPage).toHaveBeenCalled();
			expect(mockPage.setRequestInterception).toHaveBeenCalledWith(true);
			expect(pageObj.page).toBe(mockPage);
		});

		test("should log warning if page close fails during disposal", async () => {
			const mockPage = createMockPage();
			mockPage.close.mockRejectedValueOnce(new Error("Page close error"));
			const mockBrowser = createMockBrowser(true);
			mockBrowser.newPage.mockResolvedValue(mockPage);

			const service = new TestService(fastifyMock);
			(service as unknown as ServiceWithInternals).browser =
				mockBrowser as unknown as ReturnType<typeof createMockBrowser>;

			const pageObj = await service.triggerGetPage();

			// Trigger disposal
			await pageObj[Symbol.asyncDispose]();

			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.any(Error),
				"Failed to close page",
			);
		});
	});
});
