import path from "node:path";
import Fastify from "fastify";
import type { NotifierService } from "../../modules/notifier/type";
import alertPlugin from "../alert";
import configPlugin from "../config";
import monitorPlugin from "../monitor";

let exitSpy: jest.SpyInstance;
let originalArgv: string[];

jest.mock("@/env", () => ({
	env: "dev",
	LARK_BOT_TOKENS: ["token1"],
	isDebugMode: () => false,
}));

jest.mock("@/utils/is", () => ({
	isTsNode: () => true,
}));

describe("Plugins", () => {
	beforeEach(() => {
		originalArgv = process.argv;
		process.argv = [...originalArgv];
		process.argv[1] = path.resolve(__dirname, "../../index.ts");
		exitSpy = jest
			.spyOn(process, "exit")
			.mockImplementation(() => undefined as never);
	});

	afterEach(() => {
		exitSpy.mockRestore();
		process.argv = originalArgv;
	});

	test("config plugin should load config", async () => {
		const app = Fastify();
		await app.register(configPlugin);
		await app.ready();

		expect(app.hasDecorator("config")).toBe(true);
		expect(app.config.port).toBeDefined();
	});

	test("monitor plugin should register", async () => {
		const app = Fastify();
		await app.register(monitorPlugin);
		await app.ready();
	});

	test("alert plugin should send alert", async () => {
		const app = Fastify();
		const mockNotifier = {
			error: jest.fn(),
			info: jest.fn(),
			warn: jest.fn(),
		} as unknown as NotifierService;
		app.decorate("notifierService", mockNotifier);

		await app.register(alertPlugin);
		await app.ready();

		expect(app.hasDecorator("alert")).toBe(true);

		await app.alert("test message");
		expect(mockNotifier.error).toHaveBeenCalledWith("test message", ["token1"]);
	});

	test("alert plugin should handle missing tokens", async () => {
		jest.resetModules();
		jest.doMock("@/env", () => ({
			env: "dev",
			LARK_BOT_TOKENS: [],
		}));
		const alertPlg = require("../alert").default;

		const app = Fastify();
		app.decorate("notifierService", {
			error: jest.fn(),
			info: jest.fn(),
			warn: jest.fn(),
		} as unknown as NotifierService);
		await app.register(alertPlg);
		await app.ready();

		app.log.warn = jest.fn();

		await app.alert("msg");
		expect(app.log.warn).toHaveBeenCalledWith("NO LARK BOT TOKENS");
	});
});
