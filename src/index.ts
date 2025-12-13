import Fastify, { fastify } from "fastify";
import sensible from "@fastify/sensible";
import monitorPlugin from "./plugins/monitor";
import loggerPlugin from "./plugins/logger";
import configPlugin from "./plugins/config";
import resourceGeneratorModule from "./modules/resource-generator";
import {
	serializerCompiler,
	validatorCompiler,
} from "fastify-type-provider-zod";

const start = async () => {
	const fastify = Fastify({
		logger: {
			transport: {
				target: "pino-pretty",
				options: {
					translateTime: "HH:MM:ss Z",
					ignore: "pid,hostname",
				},
			},
		},
	});

	// Register core plugins
	await fastify.register(sensible);

	// Set up Zod validation
	fastify.setValidatorCompiler(validatorCompiler);
	fastify.setSerializerCompiler(serializerCompiler);

	// Register custom plugins
	await fastify.register(loggerPlugin);
	await fastify.register(monitorPlugin);
	await fastify.register(configPlugin);

	// Register business modules
	await fastify.register(resourceGeneratorModule);

	// Global Error Handler Stub for Alerting
	fastify.setErrorHandler((error, request, reply) => {
		fastify.log.error(error, `Request failed: ${error.message}`);
		// Here we would send alerts to Sentry/PagerDuty etc.
		reply.send(error);
	});

	try {
		const port = fastify.config.port ?? 3000;
		const host = "0.0.0.0";
		await fastify.listen({ port, host });
		console.log(`Server listening on http://localhost:${port}`);
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
};

start();
