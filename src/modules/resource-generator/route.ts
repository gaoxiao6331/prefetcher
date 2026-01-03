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
			const notifierService = fastify.notifierService;

			const {
				targetUrl,
				projectName,
				targetFileName,
				template,
				notifications,
			} = request.body;
			const list = await resourceGeneratorService.captureResources(targetUrl);
			const c = JSON.stringify(list);
			const content = template?.replace("__content_placeholder__", c) ?? c;
			const { url } = await cdnUpdaterService.update(
				projectName,
				targetFileName,
				content,
			);
			if (notifications) {
				// 检查内容是否更新 因为cdn刷新延时，改成延时校验
				setTimeout(async () => {
					try {
						const res = await cdnUpdaterService.verifyContentUpdate(
							url,
							content,
						);
						if (res) {
							await notifierService.info(
								`CDN更新成功！\n${url}`,
								notifications,
							);
						} else {
							await notifierService.error(
								`CDN更新失败！\n${url}`,
								notifications,
							);
						}
					} catch (error) {
						request.log.error(
							error,
							"Failed to send notification in deferred task",
						);
					}
				}, 5000);
			}
			return {
				url,
			};
		},
	);
};

export default sniffRoutes;
