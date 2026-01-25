/**
 * Semaphore is used to control the number of concurrent tasks.
 * Commonly used to limit access to scarce resources (e.g., database connections, headless browser instances) and prevent service overload.
 */
export class Semaphore {
	private tasks: (() => void)[] = [];
	private count: number;

	/**
	 * @param max Maximum number of concurrent permits
	 */
	constructor(readonly max: number) {
		this.count = max;
	}

	/**
	 * Acquires a permit. If no permit is available, it enters the waiting queue.
	 */
	async acquire(): Promise<void> {
		if (this.count > 0) {
			this.count--;
			return;
		}

		return new Promise<void>((resolve) => {
			this.tasks.push(resolve);
		});
	}

	/**
	 * Releases a permit, waking up the next task in the waiting queue (if any).
	 */
	release(): void {
		if (this.tasks.length > 0) {
			const next = this.tasks.shift();
			if (next) next();
		} else {
			this.count++;
		}
	}

	/**
	 * Executes an asynchronous function, automatically managing the acquisition and release of permits.
	 * @param fn The asynchronous function to execute
	 * @returns The result returned by the function
	 */
	async run<T>(fn: () => Promise<T>): Promise<T> {
		await this.acquire();
		try {
			return await fn();
		} finally {
			this.release();
		}
	}
}
