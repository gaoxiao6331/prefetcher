import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import type { Config } from "@/config/type";
import cdnUpdaterModule from "../modules/cdn-updater";
import notifierModule from "../modules/notifier";
import resourceGeneratorModule from "../modules/resource-generator";
import alertPlugin from "../plugins/alert";
import monitorPlugin from "../plugins/monitor";

// Mock external dependencies
jest.mock("puppeteer", () => ({
	launch: jest.fn().mockResolvedValue({
		on: jest.fn(),
		close: jest.fn(),
		connected: true,
		newPage: jest.fn(),
	}),
}));
jest.mock("axios");
jest.mock("child_process");

// Mock config plugin to avoid dynamic import issues in tests
jest.mock("../plugins/config", () => {
	const fp = require("fastify-plugin");
	return fp(async (fastify: FastifyInstance) => {
		fastify.decorate("config", {
			port: 3000,
			cdn: {
				jsDelivr: {
					localPath: "/tmp",
					remoteAddr: "https://github.com/a/b",
					git: { name: "n", email: "e" },
				},
			},
		} as Config);
	});
});

import configPlugin from "../plugins/config";

const mockConfig = {
	port: 3000,
	cdn: {
		jsDelivr: {
			localPath: "/tmp",
			remoteAddr: "https://github.com/a/b",
			git: { name: "n", email: "e" },
		},
	},
} as Config;

describe("Entrypoints and Plugins", () => {
	test("Resource Generator Module should register", async () => {
		const fastify = Fastify();
		fastify.decorate("config", mockConfig);
		await fastify.register(resourceGeneratorModule);
		expect(fastify.resourceGeneratorService).toBeDefined();
		await fastify.close();
	});

	test("CDN Updater Module should register", async () => {
		const fastify = Fastify();
		fastify.decorate("config", mockConfig);
		await fastify.register(cdnUpdaterModule);
		expect(fastify.cdnUpdaterService).toBeDefined();
		await fastify.close();
	});

	test("Notifier Module should register", async () => {
		const fastify = Fastify();
		await fastify.register(notifierModule);
		expect(fastify.notifierService).toBeDefined();
		await fastify.close();
	});

	test("Config Plugin should register", async () => {
		const fastify = Fastify();
		await fastify.register(configPlugin);
		expect(fastify.config).toBeDefined();
		await fastify.close();
	});

	test("Monitor Plugin should register", async () => {
		const fastify = Fastify();
		fastify.decorate("config", mockConfig);
		await fastify.register(monitorPlugin);

		const res = await fastify.inject({
			method: "GET",
			url: "/health",
		});
		expect(res.statusCode).toBe(200);

		await fastify.close();
	});

	test("Alert Plugin should register", async () => {
		const fastify = Fastify();
		await fastify.register(alertPlugin);
		expect(fastify.alert).toBeDefined();
		await fastify.close();
	});
});
