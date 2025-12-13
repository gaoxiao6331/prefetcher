// src/plugins/config.ts

import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import config from "../config";

declare module "fastify" {
	interface FastifyInstance {
		config: typeof config;
	}
}

export default fp(async function configPlugin(fastify: FastifyInstance) {
	fastify.decorate("config", config);
});
