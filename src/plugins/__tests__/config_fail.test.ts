import Fastify from "fastify";
import * as path from "path";

describe("Config Plugin Error Path", () => {
	// biome-ignore lint/suspicious/noExplicitAny: mock console.log
	let originalLog: any;
	let exitSpy: jest.SpyInstance;

	beforeEach(() => {
		jest.resetModules();
		jest.clearAllMocks();
		exitSpy = jest.spyOn(process, "exit").mockImplementation(() => {
			return undefined as never;
		});
		originalLog = console.log;
		console.log = jest.fn();
	});

	afterEach(() => {
		exitSpy.mockRestore();
		console.log = originalLog;
	});

	test("should exit if config file return empty default", async () => {
		// Mock env to return 'dev' which is a file that actually exists
		jest.doMock("../../env", () => ({
			env: "dev",
		}));

		// Override the existing dev.ts with a mock that returns null default
		// Use the absolute path to ensure it matches what the resolver finds
		const devPath = path.resolve(__dirname, "../../config/file/dev.ts");

		jest.doMock(devPath, () => ({
			__esModule: true,
			default: null,
		}));

		const configPlugin = require("../config").default;
		const app = Fastify();

		await app.register(configPlugin);

		expect(exitSpy).toHaveBeenCalledWith(-1);
	});
});
