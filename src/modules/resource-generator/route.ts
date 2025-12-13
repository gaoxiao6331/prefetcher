import { FastifyPluginAsync } from 'fastify';
import schema from './schema';

const sniffRoutes: FastifyPluginAsync = async (fastify, opts) => {
  fastify.post('/res_gen', {
    schema,
  }, async (request, reply) => {
    // const { targetUrl } = request.body;
    // return { message: `Request received for ${targetUrl}` };
  });
};

export default sniffRoutes;
