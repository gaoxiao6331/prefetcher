import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import routes from "./route";
import LcpImpactEvaluationService from "./service/lcp-impact-evaluation-service";
import type { ResourceGeneratorService } from "./type";

const resourceGeneratorModule: FastifyPluginAsync = async (fastify, _opts) => {
	const service = await LcpImpactEvaluationService.create(fastify);
	fastify.decorate("resourceGeneratorService", service);

	fastify.addHook("onClose", async () => {
		await service.close();
	});

	await fastify.register(routes);
};

declare module "fastify" {
	interface FastifyInstance {
		resourceGeneratorService: ResourceGeneratorService;
	}
}

export default fp(resourceGeneratorModule);
