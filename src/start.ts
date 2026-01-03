import cdnUpdaterModule from "@/modules/cdn-updater";
import notifierModule from "@/modules/notifier";
import resourceGeneratorModule from "@/modules/resource-generator";
import createFastifyInstance from "@/utils/create-fastify-instance";
import { isDebugMode } from "./utils/is";

export interface StartParams {
	debug?: boolean;
}

export const start = async (params: StartParams) => {
	globalThis.startParams = params;

	const fastify = await createFastifyInstance();

	// Register business modules
	await fastify.register(notifierModule);
	await fastify.register(resourceGeneratorModule);
	await fastify.register(cdnUpdaterModule);

	try {
		const port = fastify.config.port ?? 3000;
		const host = "0.0.0.0";
		await fastify.listen({ port, host });
		console.log(`Server listening on http://localhost:${port}`);
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}

	// 捕获终止信号（如 Ctrl+C）
	process.on("SIGTERM", async () => {
		fastify.log.info("shutting down gracefully...");
		try {
			await fastify.close(); // Fastify 会等待现有请求处理完毕后再关闭
			fastify.log.info("Server shut down gracefully");
			process.exit(0);
		} catch (error: any) {
			fastify.log.error("Error during shutdown:", error);
			process.exit(1);
		}
	});

	process.on("unhandledRejection", (reason, promise) => {
		fastify.log.error(reason, "Unhandled Rejection occurred");
		if (!startParams.debug) {
			fastify.alert(`Unhandled Rejection occurred: ${reason}`);
		}
	});

	// 捕获未处理的异常
	process.on("uncaughtException", (error) => {
		fastify.log.error(error, "Uncaught Exception occurred");
		if (!isDebugMode()) {
			fastify.alert(`Uncaught Exception occurred: ${error}`);
		}
	});
};
