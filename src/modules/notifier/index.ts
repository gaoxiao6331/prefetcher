import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import LarkWebhookBotService from "./lark-webhook-bot-service";
import { NotifierService } from "./type";

const notifierServiceModule: FastifyPluginAsync = async (fastify, opts) => {
	// read lark bot tokens from env
	const larkService = await LarkWebhookBotService.create(fastify);
	fastify.decorate("notifierService", larkService);
};

declare module "fastify" {
	interface FastifyInstance {
		notifierService: NotifierService;
	}
}

export default fp(notifierServiceModule);
