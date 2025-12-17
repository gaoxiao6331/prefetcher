import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import LarkService from "./lark-service";

const notifierServiceModule: FastifyPluginAsync = async (fastify, opts) => {
	// read lark bot tokens from env
	const larkService = await LarkService.create(fastify);
	fastify.decorate("notifierService", larkService);
};

declare module "fastify" {
	interface FastifyInstance {
		notifierService: LarkService;
	}
}

export default fp(notifierServiceModule);
