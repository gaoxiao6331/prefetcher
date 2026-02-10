import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Config } from "@/config/type";
import createFastifyInstance from "../create-fastify-instance";

// Mock plugins
jest.mock("../../plugins/config", () => {
	const fp = require("fastify-plugin");
	return fp(async (fastify: FastifyInstance) => {
		fastify.decorate("config", {
			port: 3000,
		} as Config);
	});
});

jest.mock("../../plugins/monitor", () => {
	const fp = require("fastify-plugin");
	return fp(async () => {});
});

jest.mock("../../plugins/alert", () => {
	const fp = require("fastify-plugin");
	return fp(async (fastify: FastifyInstance) => {
		fastify.decorate("alert", jest.fn());
	});
});

describe("createFastifyInstance", () => {
	test("should initialize successfully", async () => {
		const app = await createFastifyInstance();
		expect(app).toBeDefined();

		await app.ready();
		await app.close();
	});

	test("should propagate traceId", async () => {
		const app = await createFastifyInstance();

		app.get("/test-trace", async (req: FastifyRequest) => {
			return { traceId: req.traceId };
		});

		const res = await app.inject({
			method: "GET",
			url: "/test-trace",
		});

		const body = JSON.parse(res.payload);
		expect(body.traceId).toBeDefined();
		expect(res.headers["x-trace-id"]).toBe(body.traceId);

		await app.close();
	});

	test("should use existing traceId", async () => {
		const app = await createFastifyInstance();

		app.get("/test-trace-2", async (req: FastifyRequest) => {
			return { traceId: req.traceId };
		});

		const res = await app.inject({
			method: "GET",
			url: "/test-trace-2",
			headers: {
				"x-trace-id": "existing-id",
			},
		});

		const body = JSON.parse(res.payload);
		expect(body.traceId).toBe("existing-id");

		await app.close();
	});

	test("should handle error", async () => {
		const app = await createFastifyInstance();
		app.get("/error", async () => {
			throw new Error("Boom");
		});

		const res = await app.inject({
			method: "GET",
			url: "/error",
		});

		expect(res.statusCode).toBe(500);
		await app.close();
	});

	test("should use existing status code on error", async () => {
		const app = await createFastifyInstance();
		app.get("/error-code", async (_req, reply) => {
			reply.status(418);
			throw new Error("Teapot");
		});

		const res = await app.inject({
			method: "GET",
			url: "/error-code",
		});

		expect(res.statusCode).toBe(418);
		await app.close();
	});

	test("should set debug log level in debug mode", async () => {
		globalThis.startParams = {
			debug: true,
		};
		const app = await createFastifyInstance();
		expect(app.log.level).toBe("debug");
		await app.close();
		// @ts-expect-error
		delete globalThis.startParams;
	});

	test("should handle error alerting branch", async () => {
		// Ensure NOT in debug mode for alerting branch
		globalThis.startParams = {
			debug: false,
		};
		const app = await createFastifyInstance();

		// Mock alert
		(app as FastifyInstance & { alert: jest.Mock }).alert = jest.fn();

		app.get("/error-alert", async () => {
			throw new Error("Alert Me");
		});

		await app.inject({
			method: "GET",
			url: "/error-alert",
		});

		expect(
			(app as FastifyInstance & { alert: jest.Mock }).alert,
		).toHaveBeenCalled();
		await app.close();
		// @ts-expect-error
		delete globalThis.startParams;
	});
});
