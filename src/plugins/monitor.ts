import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import fastifyMetrics from 'fastify-metrics';

const monitorPlugin: FastifyPluginAsync = async (fastify, opts) => {
  await fastify.register(fastifyMetrics, {
    endpoint: '/metrics',
    defaultMetrics: { enabled: true },
  });

  fastify.get('/health', async () => {
    return { status: 'ok', uptime: process.uptime() };
  });

  fastify.log.info('Monitor plugin registered (Metrics at /metrics, Health at /health)');
};

export default fp(monitorPlugin);
