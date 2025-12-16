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

			const { targetUrl, projectName, targetFileName, template } = request.body;
			const list = await resourceGeneratorService.captureResources(targetUrl);
			const c = JSON.stringify(list)
			const content = template?.replace("__content_placeholder__", c) ?? c;
			const { url } = await cdnUpdaterService.update(
				projectName,
				targetFileName,
				content,
			);
			return {
				url,
			};
		},
	);
};

export default sniffRoutes;
