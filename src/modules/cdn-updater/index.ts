import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import JsDelivrService from "./js-delivr-service";

const cdnUpdaterServiceModule: FastifyPluginAsync = async (fastify, opts) => {
	const jsDelivrService = await JsDelivrService.create(fastify);
	fastify.decorate("cdnUpdaterService", jsDelivrService);
};

declare module "fastify" {
	interface FastifyInstance {
		cdnUpdaterService: JsDelivrService;
	}
}

export default fp(cdnUpdaterServiceModule);
