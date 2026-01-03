import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import routes from "./route";
import Service from "./service/js-only-service";
import type { ResourceGeneratorService } from "./type";

const resourceGeneratorModule: FastifyPluginAsync = async (fastify, opts) => {
	const resourceGeneratorService = await Service.create(fastify);
	fastify.decorate("resourceGeneratorService", resourceGeneratorService);

	fastify.addHook("onClose", async () => {
		await resourceGeneratorService.close();
	});

	await fastify.register(routes);
};

declare module "fastify" {
	interface FastifyInstance {
		resourceGeneratorService: ResourceGeneratorService;
	}
}

export default fp(resourceGeneratorModule);
