import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import LarkService from "./lark-service";
import { LARK_BOT_TOKENS } from '@/env';

const notifierServiceModule: FastifyPluginAsync = async (fastify, opts) => {
	// read lark bot tokens from env
	const larkBotTokens = LARK_BOT_TOKENS?.split(",") ?? [];
	const larkService = await LarkService.create(fastify, larkBotTokens);
	fastify.decorate("notifierService", larkService);
};

declare module "fastify" {
	interface FastifyInstance {
		notifierService: LarkService;
	}
}

export default fp(notifierServiceModule);
