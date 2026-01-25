import * as path from "node:path";
import Fastify from "fastify";

describe("Config Plugin Error Path", () => {
	// biome-ignore lint/suspicious/noExplicitAny: mock console.log
	let originalLog: any;
	let exitSpy: jest.SpyInstance;
	let originalArgv: string[];

	beforeEach(() => {
		jest.resetModules();
		jest.clearAllMocks();
		originalArgv = process.argv;
		process.argv = [...originalArgv];
		process.argv[1] = path.resolve(__dirname, "../../index.ts");
		exitSpy = jest.spyOn(process, "exit").mockImplementation(() => {
			return undefined as never;
		});
		originalLog = console.log;
		console.log = jest.fn();
	});

	afterEach(() => {
		exitSpy.mockRestore();
		console.log = originalLog;
		process.argv = originalArgv;
	});

	test("should exit if config file return empty default", async () => {
		jest.doMock("@/env", () => ({
			env: "dev",
		}));

		jest.doMock("@/utils/is", () => ({
			isTsNode: () => true,
		}));

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

	test("should exit if compiled config file is missing", async () => {
		jest.doMock("@/env", () => ({
			env: "dev",
		}));

		jest.doMock("@/utils/is", () => ({
			isTsNode: () => false,
		}));

		const configPlugin = require("../config").default;
		const app = Fastify();

		await app.register(configPlugin);

		expect(exitSpy).toHaveBeenCalledWith(-1);
	});
});
