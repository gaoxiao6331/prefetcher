import type { FastifyPluginAsync } from 'fastify';
import routes from './route';
import service from './service';

const resourceGeneratorModule: FastifyPluginAsync = async (fastify, opts) => {
  fastify.decorate('resourceGeneratorService', service);

  await fastify.register(routes);
};

export default resourceGeneratorModule;
