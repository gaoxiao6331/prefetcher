import { AsyncLocalStorage, AsyncResource } from "async_hooks";
import type { FastifyBaseLogger } from "fastify";

// 定义上下文类型
interface TraceContext {
	traceId: string;
	logger: FastifyBaseLogger;
}

// 创建 AsyncLocalStorage 实例
export const traceStorage = new AsyncLocalStorage<TraceContext>();

/**
 * 获取当前请求的 traceId
 * 如果不在请求上下文中，返回 undefined
 */
export const getTraceId = (): string | undefined => {
	return traceStorage.getStore()?.traceId;
};

/**
 * 获取当前请求的 logger（带有 traceId 上下文）
 * 如果不在请求上下文中，返回 undefined
 */
export const getLogger = (): FastifyBaseLogger | undefined => {
	return traceStorage.getStore()?.logger;
};

/**
 * 绑定当前 AsyncLocalStorage 上下文到回调函数
 *
 * 用于解决事件监听器（EventEmitter.on）等场景下 AsyncLocalStorage 上下文丢失的问题。
 *
 * 问题背景：
 * - AsyncLocalStorage 的上下文通过 async resource 链传递
 * - 事件监听器的回调在事件触发时执行，此时已脱离原始的 async 调用栈
 * - 因此 getLogger() 等依赖 AsyncLocalStorage 的函数会返回 undefined
 *
 * 使用示例：
 * ```typescript
 * // ❌ 错误：上下文会丢失
 * page.on("response", async (response) => {
 *   this.log.info("...");  // getLogger() 返回 undefined
 * });
 *
 * // ✅ 正确：使用 bindAsyncContext 绑定上下文
 * page.on("response", bindAsyncContext(async (response) => {
 *   this.log.info("...");  // getLogger() 正常工作
 * }));
 * ```
 *
 * @param fn 需要绑定上下文的回调函数
 * @returns 绑定了当前 AsyncLocalStorage 上下文的新函数
 */
// biome-ignore lint/suspicious/noExplicitAny: Generic function wrapper needs any for flexibility
export function bindAsyncContext<T extends (...args: any[]) => any>(fn: T): T {
	return AsyncResource.bind(fn);
}
