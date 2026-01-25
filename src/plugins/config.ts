// src/plugins/config.ts

import path from "node:path";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import type { Config } from "@/config/type";
import { env } from "@/env";
import { isTsNode } from "@/utils/is";

declare module "fastify" {
	interface FastifyInstance {
		config: Config;
	}
}

export default fp(async function configPlugin(fastify: FastifyInstance) {
	try {
		const entryPath = process.argv[1];

		const entryDir = path.dirname(entryPath);

		const baseConfigPath = `${entryDir}/config/file/${env}`;
		const configPath = isTsNode()
			? `${baseConfigPath}.ts`
			: `${baseConfigPath}.js`;

		const configModule = await import(configPath);
		const config = configModule?.default;

		if (!config) {
			throw new Error(
				`[Config Error]: Default export missing in '${env}' configuration.`,
			);
		}

		fastify.decorate("config", config);
	} catch (err) {
		fastify.log.error(err, "Failed to load config");
		process.exit(-1);
	}
});
