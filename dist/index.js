"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const sensible_1 = __importDefault(require("@fastify/sensible"));
const monitor_1 = __importDefault(require("./plugins/monitor"));
const logger_1 = __importDefault(require("./plugins/logger"));
const demo_1 = __importDefault(require("./routes/demo"));
const start = async () => {
    const fastify = (0, fastify_1.default)({
        logger: {
            transport: {
                target: 'pino-pretty',
                options: {
                    translateTime: 'HH:MM:ss Z',
                    ignore: 'pid,hostname',
                },
            },
        },
    });
    // Register core plugins
    await fastify.register(sensible_1.default);
    // Register custom plugins
    await fastify.register(logger_1.default);
    await fastify.register(monitor_1.default);
    // Register routes
    await fastify.register(demo_1.default, { prefix: '/api' });
    // Global Error Handler Stub for Alerting
    fastify.setErrorHandler((error, request, reply) => {
        fastify.log.error(error, `Request failed: ${error.message}`);
        // Here we would send alerts to Sentry/PagerDuty etc.
        reply.send(error);
    });
    try {
        const port = parseInt(process.env.PORT || '3000', 10);
        const host = '0.0.0.0';
        await fastify.listen({ port, host });
        console.log(`Server listening on http://localhost:${port}`);
    }
    catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};
start();
