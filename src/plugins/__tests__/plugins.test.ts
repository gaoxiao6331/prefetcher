import Fastify from "fastify";
import alertPlugin from "../alert";
import configPlugin from "../config";
import monitorPlugin from "../monitor";

jest.mock("@/env", () => ({
	env: "dev",
	LARK_BOT_TOKENS: ["token1"],
	isDebugMode: () => false,
}));

describe("Plugins", () => {
	test("config plugin should load config", async () => {
		const app = Fastify();
		await app.register(configPlugin);
		await app.ready();

		expect(app.hasDecorator("config")).toBe(true);
		expect((app as any).config.port).toBeDefined();
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
		};
		app.decorate("notifierService", mockNotifier as any);

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
		app.decorate("notifierService", { error: jest.fn() } as any);
		await app.register(alertPlg);
		await app.ready();

		app.log.warn = jest.fn();

		await app.alert("msg");
		expect(app.log.warn).toHaveBeenCalledWith("NO LARK BOT TOKENS");
	});
});
