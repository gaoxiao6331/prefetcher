import { describe } from "node:test";
import type { FastifyInstance } from "fastify";
import createFastifyInstance from "@/utils/create-fastify-instance";
import LarkService from "../lark-service";

describe("LarkService", () => {
	let fastify: FastifyInstance;
	let larkService: LarkService;
	
	beforeAll(async () => {
		fastify = await createFastifyInstance();
		larkService = await LarkService.create(fastify, process.env.LARK_BOT_TOKENS?.split(",") ?? []);
	});
	it("should send info message to lark", async () => {
		await larkService.info("test");
	});
	it("should send error message to lark", async () => {
		await larkService.error("这是一段错误信息");
	});
});
