import { exec } from "node:child_process";
import cdnUpdaterModule from "@/modules/cdn-updater";
import notifierModule from "@/modules/notifier";
import resourceGeneratorModule from "@/modules/resource-generator";
import createFastifyInstance from "@/utils/create-fastify-instance";
import { isDebugMode } from "@/utils/is";

export interface StartParams {
	debug?: boolean;
}

export const start = async (params: StartParams) => {
	globalThis.startParams = params;

	if (isDebugMode()) {
		// kill process on port 3000
		try {
			await new Promise((resolve, reject) => {
				exec("kill -9 $(lsof -t -i:3000)", (err) => {
					if (err) reject(err);
					else resolve(undefined);
				});
			});
		} catch (err) {
			console.error("Failed to kill process on port 3000:", err);
		}
	}

	const fastify = await createFastifyInstance();

	// Register business modules
	await fastify.register(notifierModule);
	await fastify.register(resourceGeneratorModule);
	await fastify.register(cdnUpdaterModule);

	try {
		const port = fastify.config.port ?? 3000;
		const host = "0.0.0.0";
		await fastify.listen({ port, host });
		fastify.log.info(`Server listening on http://localhost:${port}`);
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}

	// Capture termination signals (e.g., Ctrl+C)
	process.on("SIGTERM", async () => {
		fastify.log.info("shutting down gracefully...");
		try {
			await fastify.close(); // Fastify will wait for existing requests to finish before closing
			fastify.log.info("Server shut down gracefully");
			process.exit(0);
		} catch (error) {
			fastify.log.error(error, "Error during shutdown:");
			process.exit(1);
		}
	});

	process.on("unhandledRejection", (reason, _promise) => {
		fastify.log.error(reason, "Unhandled Rejection occurred");
		if (!isDebugMode()) {
			fastify.alert(`Unhandled Rejection occurred: ${reason}`);
		}
	});

	// Capture uncaught exceptions
	process.on("uncaughtException", (error) => {
		fastify.log.error(error, "Uncaught Exception occurred");
		if (!isDebugMode()) {
			fastify.alert(`Uncaught Exception occurred: ${error}`);
		}
	});
};
