import type { FastifyPluginAsync } from "fastify";
import JsDelivrService from "./js-delivr-service";

const jsDelivrServiceModule: FastifyPluginAsync = async (fastify, opts) => {
		const jsDelivrService = JsDelivrService.create(fastify);
        fastify.decorate("jsDelivrService", jsDelivrService);
};

declare module "fastify" {
	interface FastifyInstance {
		jsDelivrService: JsDelivrService;
	}
}

export default jsDelivrServiceModule;
