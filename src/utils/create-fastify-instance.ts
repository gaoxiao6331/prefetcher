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
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { traceStorage } from './trace-context';
import { isDebugMode } from "./is";
import pino from 'pino';

const TRACE_ID_HEADER = "x-trace-id";

/**
 * 格式化时间为 yyyyMMddHHmmss
 */
const formatDateTime = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
};

/**
 * 生成唯一的 traceId
 */
const generateTraceId = (): string => {
  const dateTime = formatDateTime(new Date());
  const random = crypto.randomBytes(4).toString("hex");
  return `${dateTime}${random}`;
};

// 扩展 FastifyRequest 类型
declare module "fastify" {
  interface FastifyRequest {
    traceId: string;
  }
}

export default async function createFastifyInstance() {


  const logTargets: pino.TransportTargetOptions[] = [
    {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
        colorize: true,
      }
    }
  ];

  logTargets.push({
    target: 'pino-roll',
    options: {
      // 日志文件保存路径
      file: path.join('logs', 'app.log'),
      // 轮转频率: 'daily', 'hourly', 毫秒值
      frequency: 'daily',
      // 或者按大小轮转 (例如 10MB)
      // size: '1m',
      mkdir: true,
      // 最多保留多少个日志文件
      limit: {
        count: 100
      }
    }
  });

  // 3. 初始化 Fastify
  const fastify = Fastify({
    logger: {
      level: isDebugMode() ? 'debug' : 'info',
      transport: {
        targets: logTargets
      },
    },
    genReqId: (req) => {
      // 优先使用请求头中的 traceId（支持分布式追踪）
      const incomingTraceId = req.headers[TRACE_ID_HEADER] as string | undefined;
      return incomingTraceId || generateTraceId();
    },
    requestIdLogLabel: 'traceId',
    requestIdHeader: TRACE_ID_HEADER,
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

  // traceId 相关 hooks
  fastify.addHook("onRequest", async (request, reply) => {
    // 将 request.id 映射到 request.traceId，方便业务代码使用
    request.traceId = request.id;

    // 将 traceId 和 logger 存储到 AsyncLocalStorage 中
    // 这样业务代码可以通过 getLogger() 获取带 traceId 的 logger
    traceStorage.enterWith({
      traceId: request.traceId,
      logger: request.log,
    });
  });

  fastify.addHook("onSend", async (request, reply) => {
    // 在响应头中返回 trace id
    reply.header(TRACE_ID_HEADER, request.traceId);
  });

  fastify.log.info("TraceId configured");

  // Global Error Handler Stub for Alerting
  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error, `[GLOBAL]: Request failed: ${error.message}`);
    let code = error?.statusCode || 500;
    // 手动设置了相应的status code
    if (reply.statusCode !== 200) {
      code = reply.statusCode
    }
    // Here we would send alerts to Sentry/PagerDuty etc.
    reply.send(error);
    // 非调试模式且是500错误
    if (!isDebugMode() && code >= 500) {
      fastify.alert(JSON.stringify({
        name: error.name,
        message: error.message,
        stack: error.stack,
      }));
    }
  });

  return fastify;
}
