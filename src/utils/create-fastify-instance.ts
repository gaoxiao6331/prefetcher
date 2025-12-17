import sensible from "@fastify/sensible";
import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import configPlugin from "../plugins/config";
import loggerPlugin from "../plugins/logger";
import monitorPlugin from "../plugins/monitor";
import alertPlugin from "../plugins/alert";

export default async function createFastifyInstance() {
  const fastify = Fastify({
    logger: {
      transport: {
       targets: [
        {
          target: 'pino/file',
          options: { destination: './logs/app.log' }
        },
        {
          target: 'pino-pretty',
          options: {
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
            colorize: true,
          }
        }
      ]
      },
    },
  });

  // Register core plugins
  await fastify.register(sensible);

  // Set up Zod validation
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  // Register custom plugins
  await fastify.register(loggerPlugin);
  await fastify.register(monitorPlugin);
  await fastify.register(alertPlugin);
  await fastify.register(configPlugin);

  // Global Error Handler Stub for Alerting
  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error, `[GLOBAL]: Request failed: ${error.message}`);
    let code = error?.statusCode || 500;
    // 手动设置了相应的status code
    if(reply.statusCode !== 200) {
      code = reply.statusCode
    }
    // Here we would send alerts to Sentry/PagerDuty etc.
    reply.send(error);
    // 非开发环境且是500错误
    if(fastify.config.env !== 'dev' && code >= 500) {
      fastify.alert(JSON.stringify({
        name: error.name,
        message: error.message,
        stack: error.stack,
      }));
    }
  });

  return fastify;
}
