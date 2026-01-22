import { isDebugMode } from "../is";

describe("is helper", () => {
	// biome-ignore lint/suspicious/noExplicitAny: access globalThis
	const originalGlobal = globalThis as any;
	// biome-ignore lint/suspicious/noExplicitAny: store startParams
	let originalStartParams: any;

	beforeAll(() => {
		originalStartParams = originalGlobal.startParams;
	});

	afterAll(() => {
		originalGlobal.startParams = originalStartParams;
	});

	beforeEach(() => {
		originalGlobal.startParams = undefined;
	});

	test("should return false if globalThis.startParams is undefined", () => {
		expect(isDebugMode()).toBe(false);
	});

	test("should return false if globalThis.startParams.debug is undefined", () => {
		originalGlobal.startParams = {};
		expect(isDebugMode()).toBe(false);
	});

	test("should return false if globalThis.startParams.debug is false", () => {
		originalGlobal.startParams = { debug: false };
		expect(isDebugMode()).toBe(false);
	});

	test("should return true if globalThis.startParams.debug is true", () => {
		originalGlobal.startParams = { debug: true };
		expect(isDebugMode()).toBe(true);
	});
});
