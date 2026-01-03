/**
 * 信号量 (Semaphore) 用于控制并发任务的数量。
 * 常用于限制对稀缺资源（如数据库连接、无头浏览器实例）的访问，防止服务过载。
 */
export class Semaphore {
	private tasks: (() => void)[] = [];
	private count: number;

	/**
	 * @param max 最大并发许可数
	 */
	constructor(private readonly max: number) {
		this.count = max;
	}

	/**
	 * 获取一个许可。如果没有可用许可，则进入等待队列。
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
	 * 释放一个许可，唤醒等待队列中的下一个任务（如果有）。
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
	 * 执行一个异步函数，自动管理许可的获取与释放。
	 * @param fn 要执行的异步函数
	 * @returns 函数的返回结果
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
