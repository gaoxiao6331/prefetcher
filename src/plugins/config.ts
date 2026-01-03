// src/plugins/config.ts

import chalk from "chalk";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import type { Config } from "@/config/type";
import { env } from "@/env";

declare module "fastify" {
	interface FastifyInstance {
		config: Config;
	}
}

export default fp(async function configPlugin(fastify: FastifyInstance) {
	const configModule = await import(`@/config/file/${env}.ts`);
	const config = configModule?.default;
	if (!config) {
		console.log(
			chalk.red(`Specified configuration file '${env}.ts' not found.`),
		);
		process.exit(-1);
	}
	fastify.decorate("config", config);
});
