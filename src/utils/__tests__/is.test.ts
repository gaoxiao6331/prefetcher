import { isDebugMode, isTsNode } from "../is";

describe("is helper", () => {
	const win = globalThis as unknown as { startParams?: { debug?: boolean } };
	let originalStartParams: { debug?: boolean } | undefined;
	const tsNodeSymbol = Symbol.for("ts-node.register.instance");
	type ProcessWithTsNode = NodeJS.Process & { [key: symbol]: unknown };
	const processWithTsNode = process as ProcessWithTsNode;
	let originalTsNodeInstance: unknown;

	beforeAll(() => {
		originalStartParams = win.startParams;
		originalTsNodeInstance = processWithTsNode[tsNodeSymbol];
	});

	afterAll(() => {
		win.startParams = originalStartParams;
		processWithTsNode[tsNodeSymbol] = originalTsNodeInstance;
	});

	beforeEach(() => {
		win.startParams = undefined;
		delete processWithTsNode[tsNodeSymbol];
	});

	test("should return false if globalThis.startParams is undefined", () => {
		expect(isDebugMode()).toBe(false);
	});

	test("should return false if globalThis.startParams.debug is undefined", () => {
		win.startParams = {};
		expect(isDebugMode()).toBe(false);
	});

	test("should return false if globalThis.startParams.debug is false", () => {
		win.startParams = { debug: false };
		expect(isDebugMode()).toBe(false);
	});

	test("should return true if globalThis.startParams.debug is true", () => {
		win.startParams = { debug: true };
		expect(isDebugMode()).toBe(true);
	});

	test("should return false when ts-node instance is not set", () => {
		expect(isTsNode()).toBe(false);
	});

	test("should return true when ts-node instance is set", () => {
		processWithTsNode[tsNodeSymbol] = {};
		expect(isTsNode()).toBe(true);
	});
});
