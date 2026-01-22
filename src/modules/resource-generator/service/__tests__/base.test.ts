import type { FastifyInstance } from "fastify";
import puppeteer from "puppeteer";
import BaseService from "../base";

jest.mock("puppeteer");

// Helper function to create mock Fastify instance
function createMockFastify() {
	return {
		log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
		config: {},
		// biome-ignore lint/suspicious/noExplicitAny: mock fastify
	} as any;
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
	// biome-ignore lint/suspicious/noExplicitAny: mock filter
	protected filter(resource: any[]) {
		return resource;
	}

	// biome-ignore lint/suspicious/noExplicitAny: mock rank
	protected rank(res: any[]) {
		return res;
	}

	public async generate() {
		return { resources: [], resultFileName: "test" };
	}

	// Expose protected method for testing
	public async triggerGetPage() {
		// biome-ignore lint/suspicious/noExplicitAny: access private
		return (this as any).getPage();
	}
}

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
			// biome-ignore lint/suspicious/noExplicitAny: access private
			(service as any).browser = mockBrowser;

			// biome-ignore lint/suspicious/noExplicitAny: access private
			await (service as any).initBrowser();

			expect(puppeteer.launch).not.toHaveBeenCalled();
		});

		test("should re-initialize if browser is disconnected", async () => {
			const mockPage = createMockPage();
			const disconnectedBrowser = createMockBrowser(false);
			const newBrowser = createMockBrowser(true);

			newBrowser.newPage.mockResolvedValue(mockPage);
			(puppeteer.launch as jest.Mock).mockResolvedValue(newBrowser);

			const service = new TestService(fastifyMock);
			// biome-ignore lint/suspicious/noExplicitAny: access private
			(service as any).browser = disconnectedBrowser;

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
				// biome-ignore lint/suspicious/noExplicitAny: mock private
				.spyOn(service as any, "initBrowser")
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
			// biome-ignore lint/suspicious/noExplicitAny: access private
			(service as any).browser = mockBrowser;

			await service.close();

			expect(mockBrowser.close).toHaveBeenCalled();
			expect(fastifyMock.log.info).toHaveBeenCalledWith(
				"Puppeteer browser closed",
			);
			// biome-ignore lint/suspicious/noExplicitAny: access private
			expect((service as any).browser).toBeNull();
		});
	});

	describe("Page Management", () => {
		test("should create new page with request interception enabled", async () => {
			const mockPage = createMockPage();
			const mockBrowser = createMockBrowser(true);
			mockBrowser.newPage.mockResolvedValue(mockPage);

			(puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);

			const service = new TestService(fastifyMock);
			// biome-ignore lint/suspicious/noExplicitAny: access private
			(service as any).browser = mockBrowser;

			const pageObj = await service.triggerGetPage();

			expect(mockBrowser.newPage).toHaveBeenCalled();
			expect(mockPage.setRequestInterception).toHaveBeenCalledWith(true);
			expect(pageObj.page).toBe(mockPage);
		});
	});
});
