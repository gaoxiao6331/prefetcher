import { AsyncLocalStorage } from "async_hooks";
import {
	bindAsyncContext,
	getLogger,
	getTraceId,
	traceStorage,
} from "../trace-context";

describe("trace-context", () => {
	test("should return undefined if no context", () => {
		expect(getTraceId()).toBeUndefined();
		expect(getLogger()).toBeUndefined();
	});

	test("should retrieve context within run", () => {
		const mockContext = {
			traceId: "123",
			logger: { info: jest.fn() } as any,
		};

		traceStorage.run(mockContext, () => {
			expect(getTraceId()).toBe("123");
			expect(getLogger()).toBe(mockContext.logger);
		});
	});

	test("bindAsyncContext should preserve context", async () => {
		const mockContext = {
			traceId: "abc",
			logger: {} as any,
		};

		await traceStorage.run(mockContext, async () => {
			const fn = bindAsyncContext(() => {
				return getTraceId();
			});
			// Execute inside run
			expect(fn()).toBe("abc");

			// Even if executed outside (though async_hooks usually binds at creation)
		});

		// Verify that if we bind inside run, and call outside... context might persist if binding worked?
		// Actually AsyncResource.bind binds the *current* execution resource to the function.
		let unboundFn, boundFn;
		traceStorage.run(mockContext, () => {
			unboundFn = () => getTraceId();
			boundFn = bindAsyncContext(() => getTraceId());
		});

		// Outside run
		expect(unboundFn!()).toBeUndefined();
		expect(boundFn!()).toBe("abc");
	});
});
