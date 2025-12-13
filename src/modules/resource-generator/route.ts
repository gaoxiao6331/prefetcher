import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createResourceSchema } from "./schema";

const sniffRoutes: FastifyPluginAsync = async (fastify, opts) => {
	const app = fastify.withTypeProvider<ZodTypeProvider>();
	const resourceGeneratorService = fastify.resourceGeneratorService;
	app.post(
		"/res_gen",
		{
			schema: createResourceSchema,
		},
		async (request, reply) => {
			const { targetUrl } = request.body;
			const list = await resourceGeneratorService.captureResources(targetUrl);
			return {
				message: JSON.stringify(list),
			};
		},
	);
};

export default sniffRoutes;
