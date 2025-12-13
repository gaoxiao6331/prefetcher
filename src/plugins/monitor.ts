import type { FastifyPluginAsync } from "fastify";
import fastifyMetrics from "fastify-metrics";
import fp from "fastify-plugin";

const monitorPlugin: FastifyPluginAsync = async (fastify, opts) => {
	await fastify.register(fastifyMetrics, {
		endpoint: "/metrics",
		defaultMetrics: { enabled: true },
	});

	fastify.get("/health", async () => {
		return { status: "ok", uptime: process.uptime() };
	});

	fastify.log.info(
		"Monitor plugin registered (Metrics at /metrics, Health at /health)",
	);
};

export default fp(monitorPlugin);
