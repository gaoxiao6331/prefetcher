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
			// 报警出错就没必要继续处理了，否则会进入死循环
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
