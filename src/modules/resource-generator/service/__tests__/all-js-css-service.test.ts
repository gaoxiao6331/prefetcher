import type { FastifyInstance } from "fastify";
import puppeteer from "puppeteer";
import type { CapturedResource } from "../../type";
import AllJsAndCssService from "../all-js-css-service";

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

describe("AllJsAndCssService", () => {
	let fastifyMock: FastifyInstance;
	let service: AllJsAndCssService;

	beforeEach(async () => {
		jest.clearAllMocks();

		const mockPage = {
			on: jest.fn(),
			goto: jest.fn(),
			setRequestInterception: jest.fn(),
			isClosed: jest.fn().mockReturnValue(false),
			close: jest.fn(),
		};
		const mockBrowser = {
			newPage: jest.fn().mockResolvedValue(mockPage),
			close: jest.fn(),
			connected: true,
			on: jest.fn(),
		};

		(puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);

		fastifyMock = createMockFastify();
		service = (await AllJsAndCssService.create(
			fastifyMock,
		)) as AllJsAndCssService;
	});

	describe("filter", () => {
		test("should keep only javascript and stylesheet files", () => {
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
				{
					url: "test.css",
					type: "stylesheet",
					status: 200,
					sizeKB: 20,
					requestTime: 0,
					responseTime: 0,
					durationMs: 0,
				},
				{
					url: "test.png",
					type: "image",
					status: 200,
					sizeKB: 30,
					requestTime: 0,
					responseTime: 0,
					durationMs: 0,
				},
				{
					url: "test.html",
					type: "document",
					status: 200,
					sizeKB: 40,
					requestTime: 0,
					responseTime: 0,
					durationMs: 0,
				},
			];

			// biome-ignore lint/suspicious/noExplicitAny: access protected method for test
			const filtered = (service as any).filter(resources);

			expect(filtered).toHaveLength(2);
			expect(filtered.map((r: CapturedResource) => r.url)).toContain("test.js");
			expect(filtered.map((r: CapturedResource) => r.url)).toContain(
				"test.css",
			);
		});

		test("should handle empty resources", () => {
			// biome-ignore lint/suspicious/noExplicitAny: access protected method for test
			const filtered = (service as any).filter([]);
			expect(filtered).toHaveLength(0);
		});
	});

	describe("rank", () => {
		test("should sort resources by size in descending order", () => {
			const resources: CapturedResource[] = [
				{
					url: "small.js",
					type: "script",
					status: 200,
					sizeKB: 10,
					requestTime: 0,
					responseTime: 0,
					durationMs: 0,
				},
				{
					url: "medium.js",
					type: "script",
					status: 200,
					sizeKB: 20,
					requestTime: 0,
					responseTime: 0,
					durationMs: 0,
				},
				{
					url: "large.js",
					type: "script",
					status: 200,
					sizeKB: 30,
					requestTime: 0,
					responseTime: 0,
					durationMs: 0,
				},
			];

			// biome-ignore lint/suspicious/noExplicitAny: access protected method for test
			const ranked = (service as any).rank(resources);

			expect(ranked).toHaveLength(3);
			expect(ranked[0].url).toBe("large.js");
			expect(ranked[1].url).toBe("medium.js");
			expect(ranked[2].url).toBe("small.js");
		});
	});
});
