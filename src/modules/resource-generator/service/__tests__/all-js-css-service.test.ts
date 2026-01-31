import type { FastifyInstance } from "fastify";
import puppeteer from "puppeteer";
import type { CapturedResource, GenerateContext } from "../../type";
import AllJsAndCssService from "../all-js-css-service";

type ServiceWithInternals = AllJsAndCssService & {
	filter: (ctx: GenerateContext) => Promise<GenerateContext>;
	rank: (ctx: GenerateContext) => Promise<GenerateContext>;
};

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
		test("should keep only javascript and stylesheet files", async () => {
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

			const ctx: GenerateContext = {
				url: "http://test.com",
				capturedResources: resources,
			};
			const filteredCtx = await (
				service as unknown as ServiceWithInternals
			).filter(ctx);

			expect(filteredCtx.capturedResources).toHaveLength(2);
			expect(
				filteredCtx.capturedResources.map((r: CapturedResource) => r.url),
			).toContain("test.js");
			expect(
				filteredCtx.capturedResources.map((r: CapturedResource) => r.url),
			).toContain("test.css");
		});

		test("should handle empty resources", async () => {
			const ctx: GenerateContext = {
				url: "http://test.com",
				capturedResources: [],
			};
			const filteredCtx = await (
				service as unknown as ServiceWithInternals
			).filter(ctx);
			expect(filteredCtx.capturedResources).toHaveLength(0);
		});
	});

	describe("rank", () => {
		test("should sort resources by size in descending order", async () => {
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

			const ctx: GenerateContext = {
				url: "http://test.com",
				capturedResources: resources,
			};
			const rankedCtx = await (service as unknown as ServiceWithInternals).rank(
				ctx,
			);

			expect(rankedCtx.capturedResources).toHaveLength(3);
			expect(rankedCtx.capturedResources[0].url).toBe("large.js");
			expect(rankedCtx.capturedResources[1].url).toBe("medium.js");
			expect(rankedCtx.capturedResources[2].url).toBe("small.js");
		});
	});
});
