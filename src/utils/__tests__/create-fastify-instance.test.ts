
import createFastifyInstance from "../create-fastify-instance";

// Mock plugins
jest.mock("../../plugins/config", () => {
    const fp = require("fastify-plugin");
    return fp(async (fastify: any) => {
        fastify.decorate("config", {
            app: { port: 3000 },
        });
    });
});

jest.mock("../../plugins/logger", () => {
    const fp = require("fastify-plugin");
    return fp(async () => { });
});

jest.mock("../../plugins/monitor", () => {
    const fp = require("fastify-plugin");
    return fp(async () => { });
});

jest.mock("../../plugins/alert", () => {
    const fp = require("fastify-plugin");
    return fp(async (fastify: any) => {
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

        app.get("/test-trace", async (req: any) => {
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

        app.get("/test-trace-2", async (req: any) => {
            return { traceId: req.traceId };
        });

        const res = await app.inject({
            method: "GET",
            url: "/test-trace-2",
            headers: {
                "x-trace-id": "existing-id"
            }
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
            url: "/error"
        });

        expect(res.statusCode).toBe(500);
        await app.close();
    });

    test("should use existing status code on error", async () => {
        const app = await createFastifyInstance();
        app.get("/error-code", async (req, reply) => {
            reply.status(418);
            throw new Error("Teapot");
        });

        const res = await app.inject({
            method: "GET",
            url: "/error-code"
        });

        expect(res.statusCode).toBe(418);
        await app.close();
    });
});
