import Fastify from "fastify";
import route from "../route";

// Mock schema to avoid full setup
jest.mock("../schema", () => ({
	createResourceSchema: {
		body: {
			type: "object",
			properties: {
				targetUrl: { type: "string" },
				projectName: { type: "string" },
				targetFileName: { type: "string" },
				notifications: { type: "array" },
				template: { type: "string" },
			},
		},
	},
}));

describe("Resource Generator Routes", () => {
	let app: any;
	const mockResourceGeneratorService = {
		captureResources: jest.fn(),
	};
	const mockCdnUpdaterService = {
		update: jest.fn(),
		verifyContentUpdate: jest.fn(),
	};
	const mockNotifierService = {
		info: jest.fn(),
		error: jest.fn(),
	};

	beforeAll(async () => {
		app = Fastify();

		// Register mocks as decorators (mimic plugins)
		app.decorate("resourceGeneratorService", mockResourceGeneratorService);
		app.decorate("cdnUpdaterService", mockCdnUpdaterService);
		app.decorate("notifierService", mockNotifierService);

		await app.register(route);
		await app.ready();
	});

	afterAll(async () => {
		await app.close();
	});

	afterEach(() => {
		jest.clearAllMocks();
		jest.useRealTimers();
	});

	test("POST /res_gen should success", async () => {
		mockResourceGeneratorService.captureResources.mockResolvedValue([
			"http://a.js",
		]);
		mockCdnUpdaterService.update.mockResolvedValue({ url: "http://cdn/a.js" });

		const res = await app.inject({
			method: "POST",
			url: "/res_gen",
			payload: {
				targetUrl: "http://example.com",
				projectName: "test-proj",
				targetFileName: "prefetch.js",
			},
		});

		expect(res.statusCode).toBe(200);
		expect(mockResourceGeneratorService.captureResources).toHaveBeenCalledWith(
			"http://example.com",
		);
		expect(mockCdnUpdaterService.update).toHaveBeenCalled();
		const body = JSON.parse(res.payload);
		expect(body.url).toBe("http://cdn/a.js");
	});

	test("should use template", async () => {
		mockResourceGeneratorService.captureResources.mockResolvedValue(["a.js"]);
		mockCdnUpdaterService.update.mockResolvedValue({ url: "url" });

		await app.inject({
			method: "POST",
			url: "/res_gen",
			payload: {
				targetUrl: "u",
				projectName: "p",
				targetFileName: "f",
				template: "var x = __content_placeholder__;",
			},
		});

		// Check update called with replaced content
		expect(mockCdnUpdaterService.update).toHaveBeenCalledWith(
			"p",
			"f",
			'var x = ["a.js"];',
		);
	});

	test("should trigger deferred notifications", async () => {
		jest.useFakeTimers({
			doNotFake: ["nextTick", "setImmediate"],
		});

		mockResourceGeneratorService.captureResources.mockResolvedValue([]);
		mockCdnUpdaterService.update.mockResolvedValue({ url: "u" });
		mockCdnUpdaterService.verifyContentUpdate.mockResolvedValue(true);

		await app.inject({
			method: "POST",
			url: "/res_gen",
			payload: {
				targetUrl: "u",
				projectName: "p",
				targetFileName: "f",
				notifications: ["token"],
			},
		});

		// Fast forward time
		await jest.runAllTimersAsync();

		expect(mockCdnUpdaterService.verifyContentUpdate).toHaveBeenCalled();
		expect(mockNotifierService.info).toHaveBeenCalled();

		jest.useRealTimers();
	});

	test("should notify error if verify fails", async () => {
		jest.useFakeTimers({
			doNotFake: ["nextTick", "setImmediate"],
		});

		mockResourceGeneratorService.captureResources.mockResolvedValue([]);
		mockCdnUpdaterService.update.mockResolvedValue({ url: "u" });
		mockCdnUpdaterService.verifyContentUpdate.mockResolvedValue(false);

		await app.inject({
			method: "POST",
			url: "/res_gen",
			payload: {
				targetUrl: "u",
				projectName: "p",
				targetFileName: "f",
				notifications: ["token"],
			},
		});

		await jest.runAllTimersAsync();

		expect(mockNotifierService.error).toHaveBeenCalled();

		jest.useRealTimers();
	});

	test("should handle error in deferred notification if notifier fails", async () => {
		jest.useFakeTimers({
			doNotFake: ["nextTick", "setImmediate"],
		});

		mockResourceGeneratorService.captureResources.mockResolvedValue([]);
		mockCdnUpdaterService.update.mockResolvedValue({ url: "u" });
		mockCdnUpdaterService.verifyContentUpdate.mockResolvedValue(true);
		mockNotifierService.info.mockRejectedValue(new Error("Notify fail"));

		await app.inject({
			method: "POST",
			url: "/res_gen",
			payload: {
				targetUrl: "u",
				projectName: "p",
				targetFileName: "f",
				notifications: ["token"],
			},
		});

		await jest.runAllTimersAsync();

		// Should not crash, but log error internally
		expect(mockNotifierService.info).toHaveBeenCalled();

		jest.useRealTimers();
	});
});
