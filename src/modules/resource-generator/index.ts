import type { FastifyPluginAsync } from 'fastify';
import routes from './route';
import ResourceGeneratorService from './service';

const resourceGeneratorModule: FastifyPluginAsync = async (fastify, opts) => {
  const resourceGeneratorService = await ResourceGeneratorService.create()
  fastify.decorate('resourceGeneratorService', resourceGeneratorService);
  await fastify.register(routes);
};

declare module 'fastify' {
  interface FastifyInstance {
    resourceGeneratorService: ResourceGeneratorService;
  }
}

export default resourceGeneratorModule;
