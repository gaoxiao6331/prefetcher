import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { createResourceSchema } from './schema';

const sniffRoutes: FastifyPluginAsync = async (fastify, opts) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post('/res_gen', {
    schema: createResourceSchema,
  }, async (request, reply) => {
    const { targetUrl } = request.body;
    return { message: `hello, ${targetUrl}` };
  });
};

export default sniffRoutes;

