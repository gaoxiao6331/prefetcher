"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_plugin_1 = __importDefault(require("fastify-plugin"));
const fastify_metrics_1 = __importDefault(require("fastify-metrics"));
const monitorPlugin = async (fastify, opts) => {
    await fastify.register(fastify_metrics_1.default, {
        endpoint: '/metrics',
        defaultMetrics: { enabled: true },
    });
    fastify.get('/health', async () => {
        return { status: 'ok', uptime: process.uptime() };
    });
    fastify.log.info('Monitor plugin registered (Metrics at /metrics, Health at /health)');
};
exports.default = (0, fastify_plugin_1.default)(monitorPlugin);
