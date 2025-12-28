import { AsyncLocalStorage } from "async_hooks";
import type { FastifyBaseLogger } from "fastify";

// 定义上下文类型
interface ReqContext {
    reqId: string;
    logger: FastifyBaseLogger;
}

// 创建 AsyncLocalStorage 实例
export const reqStorage = new AsyncLocalStorage<ReqContext>();

/**
 * 获取当前请求的 traceId
 * 如果不在请求上下文中，返回 undefined
 */
export const getTraceId = (): string | undefined => {
    return reqStorage.getStore()?.reqId;
};

/**
 * 获取当前请求的 logger（带有 traceId 上下文）
 * 如果不在请求上下文中，返回 undefined
 */
export const getLogger = (): FastifyBaseLogger | undefined => {
    return reqStorage.getStore()?.logger;
};
