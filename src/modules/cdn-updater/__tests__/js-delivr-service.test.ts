import { describe } from "node:test";
import type { FastifyInstance } from "fastify";
import createFastifyInstance from "@/utils/create-fastify-instance";
import JsDelivrService from "../js-delivr-service";

describe("JsDelivrService", () => {

    let fastify: FastifyInstance;
    let jsDelivrService: JsDelivrService;

    beforeAll(async () => {
        fastify = await createFastifyInstance();
        jsDelivrService = await JsDelivrService.create(fastify);
    });

    test("no error", async () => {
        const now = Date.now();
        await jsDelivrService.update(dev-test', 'demo.js', `const a=${now};`);
    }, 60_000);
});
