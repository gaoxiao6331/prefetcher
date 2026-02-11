import type { FastifyBaseLogger } from "fastify";
import { Semaphore } from "../semaphore";
import { traceStorage } from "../trace-context";

describe("Semaphore", () => {
	test("should initialize with correct limit", () => {
		const sm = new Semaphore(5);
		expect(sm.count).toBe(5);
	});

	test("acquire should decrease count", async () => {
		const sm = new Semaphore(1);
		await sm.acquire();
		expect(sm.count).toBe(0);
	});

	test("release should increase count", async () => {
		const sm = new Semaphore(1);
		await sm.acquire();
		sm.release();
		expect(sm.count).toBe(1);
	});

	test("should queue tasks when count is 0", async () => {
		const sm = new Semaphore(1);
		await sm.acquire();

		let acquired = false;
		sm.acquire().then(() => {
			acquired = true;
		});

		expect(acquired).toBe(false);
		sm.release();

		// Wait for promise resolution
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(acquired).toBe(true);
	});

	test("run should execute task and release", async () => {
		const sm = new Semaphore(1);
		let executed = false;
		const result = await sm.run(async () => {
			executed = true;
			return "done";
		});

		expect(executed).toBe(true);
		expect(result).toBe("done");
		expect(sm.count).toBe(1);
	});

	test("run should release even if task fails", async () => {
		const sm = new Semaphore(1);
		await expect(
			sm.run(async () => {
				throw new Error("fail");
			}),
		).rejects.toThrow("fail");

		expect(sm.count).toBe(1);
	});

	test("should acquire immediately if count > 0", async () => {
		const sm = new Semaphore(1);
		let acquired = false;
		await sm.acquire().then(() => {
			acquired = true;
		});
		expect(acquired).toBe(true);
	});

	test("release should handle cases where tasks.shift() returns undefined", () => {
		const sm = new Semaphore(1);
		// Force an undefined into tasks list to hit the else/falsy branch of 'if (next)'
		// although in normal usage it's always a function.
		(sm.tasks as unknown[]).push(undefined);

		// This should not throw and should simply consume the undefined
		sm.release();

		// After release, count should still be the same as if it was consumed
		// because we inside 'if (tasks.length > 0)' branch.
		expect(sm.count).toBe(1);
	});

	test("should preserve async context in run()", async () => {
		const semaphore = new Semaphore(1);
		const context = {
			traceId: "test-id",
			logger: {} as unknown as FastifyBaseLogger,
		};

		await traceStorage.run(context, async () => {
			const result = await semaphore.run(async () => {
				return traceStorage.getStore()?.traceId;
			});
			expect(result).toBe("test-id");
		});

		// Test with queuing
		await traceStorage.run(context, async () => {
			// Occupy the semaphore
			await semaphore.acquire();

			const t2 = semaphore.run(async () => {
				return traceStorage.getStore()?.traceId;
			});

			// Release after some time
			setTimeout(() => semaphore.release(), 10);

			const result = await t2;
			expect(result).toBe("test-id");
		});
	});

	test("should be safe to pass an already bound function to run()", async () => {
		const semaphore = new Semaphore(1);
		const context = {
			traceId: "double-bind-id",
			logger: {} as unknown as FastifyBaseLogger,
		};

		await traceStorage.run(context, async () => {
			const task = async () => {
				return traceStorage.getStore()?.traceId;
			};
			// Even if manually bound, it should work
			const result = await semaphore.run(task);
			expect(result).toBe("double-bind-id");
		});
	});
});
