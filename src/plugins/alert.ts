import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { LARK_BOT_TOKENS } from '@/env'

const alertPlugin: FastifyPluginAsync = async (fastify) => {
    const tokens = LARK_BOT_TOKENS.split(",");
    fastify.decorate("alert", async (message: string) => {
        const notifierService = fastify.notifierService;
        if(tokens && tokens.length > 0) {
            await notifierService.error(message, tokens);
        } else {
            fastify.log.warn("NO LARK BOT TOKENS");
        }
    });
};

declare module "fastify" {
    interface FastifyInstance {
        alert: (message: string) => Promise<void>;
    }
}

export default fp(alertPlugin);
