import { AsyncLocalStorage, AsyncResource } from "node:async_hooks";
import type { FastifyBaseLogger } from "fastify";

// Define context type
interface TraceContext {
	traceId: string;
	logger: FastifyBaseLogger;
}

// Create AsyncLocalStorage instance
export const traceStorage = new AsyncLocalStorage<TraceContext>();

/**
 * Gets the traceId of the current request.
 * Returns undefined if not within a request context.
 */
export const getTraceId = (): string | undefined => {
	return traceStorage.getStore()?.traceId;
};

/**
 * Gets the logger for the current request (with traceId context).
 * Returns undefined if not within a request context.
 */
export const getLogger = (): FastifyBaseLogger | undefined => {
	return traceStorage.getStore()?.logger;
};

/**
 * Binds the current AsyncLocalStorage context to a callback function.
 *
 * Used to solve the issue of AsyncLocalStorage context loss in scenarios such as event listeners (EventEmitter.on).
 *
 * Background:
 * - AsyncLocalStorage context is passed through the async resource chain.
 * - Event listener callbacks are executed when the event is triggered, which is already outside the original async call stack.
 * - Therefore, functions that depend on AsyncLocalStorage, such as getLogger(), will return undefined.
 *
 * Example usage:
 * ```typescript
 * // ❌ Incorrect: Context will be lost
 * page.on("response", async (response) => {
 *   this.log.info("...");  // getLogger() returns undefined
 * });
 *
 * // ✅ Correct: Use bindAsyncContext to bind the context
 * page.on("response", bindAsyncContext(async (response) => {
 *   this.log.info("...");  // getLogger() works normally
 * }));
 * ```
 *
 * @param fn The callback function that needs to bind the context
 * @returns A new function bound with the current AsyncLocalStorage context
 */
// biome-ignore lint/suspicious/noExplicitAny: Generic function wrapper needs any for flexibility
export function bindAsyncContext<T extends (...args: any[]) => any>(fn: T): T {
	return AsyncResource.bind(fn);
}
