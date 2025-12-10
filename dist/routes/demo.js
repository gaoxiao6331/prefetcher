"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const demoRoutes = async (fastify, opts) => {
    fastify.get('/demo', async (request, reply) => {
        fastify.log.info('Demo endpoint called');
        return { message: 'Hello from Prefetcher!', timestamp: new Date().toISOString() };
    });
    // Example of an error for alerting test
    fastify.get('/error', async (request, reply) => {
        throw new Error('This is a test error for alerting');
    });
};
exports.default = demoRoutes;
