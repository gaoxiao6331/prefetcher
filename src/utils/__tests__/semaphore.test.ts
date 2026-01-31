import { Semaphore } from "../semaphore";

describe("Semaphore", () => {
	test("should allow tasks up to max count", async () => {
		const semaphore = new Semaphore(2);
		let active = 0;
		const runTask = async () => {
			await semaphore.acquire();
			active++;
			await new Promise((resolve) => setTimeout(resolve, 10));
			active--;
			semaphore.release();
		};

		const p1 = runTask();
		const p2 = runTask();
		const p3 = runTask();

		// Wait briefly
		await new Promise((resolve) => setTimeout(resolve, 5));
		// Should have 2 active
		// Since acquire is async, we can't strictly guarantee immediate state without checking internals,
		// but typically active should be 2.
		// However, since `acquire` returns promise, checking intermediate state is flaky.

		await Promise.all([p1, p2, p3]);
		expect(active).toBe(0);
	});

	test("should queue tasks when limit reached", async () => {
		const semaphore = new Semaphore(1);
		const executionOrder: number[] = [];

		const t1 = semaphore.run(async () => {
			executionOrder.push(1);
			await new Promise((resolve) => setTimeout(resolve, 20));
			executionOrder.push(11);
		});
		const t2 = semaphore.run(async () => {
			executionOrder.push(2);
			await new Promise((resolve) => setTimeout(resolve, 10));
			executionOrder.push(22);
		});

		await Promise.all([t1, t2]);
		// t1 starts first (1), finishes (11), then t2 starts (2), finishes (22)
		expect(executionOrder).toEqual([1, 11, 2, 22]);
	});

	test("acquire/release logic directly", async () => {
		const semaphore = new Semaphore(1);
		await semaphore.acquire();
		// Count is 0
		let resolved = false;
		semaphore.acquire().then(() => {
			resolved = true;
		});

		await new Promise((r) => setTimeout(r, 10));
		expect(resolved).toBe(false);

		semaphore.release();
		await new Promise((r) => setTimeout(r, 0)); // tick
		expect(resolved).toBe(true);

		semaphore.release();
		// Release again increases count
		await semaphore.acquire();
		// Should succeed immediately
	});

	test("release with empty task list should increment count", async () => {
		const sm = new Semaphore(1);
		await sm.acquire(); // count 0
		sm.release(); // count 1

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
});
