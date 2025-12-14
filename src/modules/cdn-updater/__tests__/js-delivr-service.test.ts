import JsDelivrService from "../js-delivr-service";
import { FastifyInstance } from "fastify";
import createFastifyInstance from "@/utils/create-fastify-instance";
import { describe } from "node:test";

describe("JsDelivrService", () => {

    let fastify: FastifyInstance;
    let jsDelivrService: JsDelivrService;

    beforeAll(async () => {
        fastify = await createFastifyInstance();
        jsDelivrService = JsDelivrService.create(fastify);
    });

    test("no error", async () => {
        const repo = fastify.config.cdn?.jsDelivr?.repo;
        expect(repo).not.toBeUndefined();
        await jsDelivrService.update(repo!, 'dev-test', 'demo.js', `const a=123;`);
    });
});
