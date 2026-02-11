import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { LARK_BOT_TOKENS } from "@/env";

const alertPlugin: FastifyPluginAsync = async (fastify) => {
	const tokens = LARK_BOT_TOKENS;
	fastify.decorate("alert", async (message: string) => {
		try {
			const notifierService = fastify.notifierService;
			if (tokens && tokens.length > 0) {
				await notifierService.error(message, tokens);
			} else {
				fastify.log.warn("NO LARK BOT TOKENS");
			}
		} catch (error) {
			// If an error occurs during alerting, there's no need to continue processing; otherwise, it would lead to an infinite loop
			fastify.log.error(error, "Error sending alert");
		}
	});
};

declare module "fastify" {
	interface FastifyInstance {
		alert: (message: string) => Promise<void>;
	}
}

export default fp(alertPlugin);
