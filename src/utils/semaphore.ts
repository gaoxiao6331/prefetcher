import { bindAsyncContext } from "./trace-context";

/**
 * Semaphore is used to control the number of concurrent tasks.
 * Commonly used to limit access to scarce resources (e.g., database connections, headless browser instances) and prevent service overload.
 */
export class Semaphore {
	private _tasks: (() => void)[] = [];
	private _count: number;

	/**
	 * @param max Maximum number of concurrent permits
	 */
	constructor(readonly max: number) {
		this._count = max;
	}

	get tasks(): (() => void)[] {
		return this._tasks;
	}

	get count(): number {
		return this._count;
	}

	/**
	 * Acquires a permit. If no permit is available, it enters the waiting queue.
	 */
	async acquire(): Promise<void> {
		if (this._count > 0) {
			this._count--;
			return;
		}

		return new Promise<void>((resolve) => {
			this._tasks.push(resolve);
		});
	}

	/**
	 * Releases a permit, waking up the next task in the waiting queue (if any).
	 */
	release(): void {
		if (this._tasks.length > 0) {
			const next = this._tasks.shift();
			if (next) next();
		} else {
			this._count++;
		}
	}

	/**
	 * Executes an asynchronous function, automatically managing the acquisition and release of permits.
	 * Automatically binds the current async context to ensure context (like traceId) is preserved even if the task is queued.
	 * @param fn The asynchronous function to execute
	 * @returns The result returned by the function
	 */
	async run<T>(fn: () => Promise<T>): Promise<T> {
		const boundFn = bindAsyncContext(fn);
		await this.acquire();
		try {
			return await boundFn();
		} finally {
			this.release();
		}
	}
}
