import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import routes from "./route";
import InterceptionBlankScreenService from "./service/interception-blank-screen-service";
import type { ResourceGeneratorService } from "./type";

const resourceGeneratorModule: FastifyPluginAsync = async (fastify, _opts) => {
	const interceptionBlankScreenService =
		await InterceptionBlankScreenService.create(fastify);
	fastify.decorate("resourceGeneratorService", interceptionBlankScreenService);

	fastify.addHook("onClose", async () => {
		await interceptionBlankScreenService.close();
	});

	await fastify.register(routes);
};

declare module "fastify" {
	interface FastifyInstance {
		resourceGeneratorService: ResourceGeneratorService;
	}
}

export default fp(resourceGeneratorModule);
