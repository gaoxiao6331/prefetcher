import resourceGeneratorModule from "@/modules/resource-generator";
import jsDelivrServiceModule from "@/modules/cdn-updater";
import createFastifyInstance from "@/utils/create-fastify-instance";

const start = async () => {
	const fastify = await createFastifyInstance();

	// Register business modules
	await fastify.register(resourceGeneratorModule);
	await fastify.register(jsDelivrServiceModule);

	try {
		const port = fastify.config.port ?? 3000;
		const host = "0.0.0.0";
		await fastify.listen({ port, host });
		console.log(`Server listening on http://localhost:${port}`);
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}

	// 捕获终止信号（如 Ctrl+C 或 Kubernetes 发出的 SIGTERM）
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
	});

	// 捕获未处理的异常
	process.on("uncaughtException", (error) => {
		fastify.log.error(error, "Uncaught Exception occurred");
	});
};

start();
