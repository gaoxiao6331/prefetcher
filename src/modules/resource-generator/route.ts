import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createResourceSchema } from "./schema";

const sniffRoutes: FastifyPluginAsync = async (fastify, opts) => {
	const app = fastify.withTypeProvider<ZodTypeProvider>();

	app.post(
		"/res_gen",
		{
			schema: createResourceSchema,
		},
		async (request, reply) => {
			const resourceGeneratorService = fastify.resourceGeneratorService;
			const cdnUpdaterService = fastify.cdnUpdaterService;

			const { targetUrl, projectName, targetFileName } = request.body;
			const list = await resourceGeneratorService.captureResources(targetUrl);
			await cdnUpdaterService.update(
				projectName,
				targetFileName,
				JSON.stringify(list),
			);
			return {
				message: "Success",
			};
		},
	);
};

export default sniffRoutes;
