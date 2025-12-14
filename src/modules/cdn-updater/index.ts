import type { FastifyPluginAsync } from "fastify";
import JsDelivrService from "./js-delivr-service";

const jsDelivrServiceModule: FastifyPluginAsync = async (fastify, opts) => {
	const jsDelivrService = await JsDelivrService.create(fastify);
	fastify.decorate("cdnUpdaterService", jsDelivrService);
};

declare module "fastify" {
	interface FastifyInstance {
		cdnUpdaterService: JsDelivrService;
	}
}

export default jsDelivrServiceModule;
