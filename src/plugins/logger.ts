import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

const loggerPlugin: FastifyPluginAsync = async (fastify, opts) => {
	// fastify already has a built-in logger, but we can customize it or add hooks here if needed.
	// The effective logger configuration happens at the Fastify instance creation level in index.ts.
	fastify.log.info("Logger plugin registered");
};

export default fp(loggerPlugin);
