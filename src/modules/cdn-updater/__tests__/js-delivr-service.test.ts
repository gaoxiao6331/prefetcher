import JsDelivrService from "../js-delivr-service";
import { FastifyInstance } from "fastify";
import createFastifyInstance from "@/utils/create-fastify-instance";
import { describe } from "node:test";

describe("JsDelivrService", () => {

    let fastify: FastifyInstance;
    let jsDelivrService: JsDelivrService;

    beforeAll(async () => {
        fastify = await createFastifyInstance();
        jsDelivrService = await JsDelivrService.create(fastify);
    });

    test("no error", async () => {
        const {localPath, remoteAddr} = fastify.config.cdn?.jsDelivr || {};
        expect(localPath).not.toBeUndefined();
        expect(remoteAddr).not.toBeUndefined();
        const now = Date.now();
        await jsDelivrService.update(remoteAddr!, localPath!, 'dev-test', 'demo.js', `const a=${now};`);
    }, 60_000);
});
