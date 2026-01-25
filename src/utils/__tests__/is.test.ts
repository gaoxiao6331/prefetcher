import { isDebugMode, isTsNode } from "../is";

describe("is helper", () => {
	const originalGlobal = globalThis as any;
	let originalStartParams: any;
	const tsNodeSymbol = Symbol.for("ts-node.register.instance");
	type ProcessWithTsNode = NodeJS.Process & { [key: symbol]: unknown };
	const processWithTsNode = process as ProcessWithTsNode;
	let originalTsNodeInstance: unknown;

	beforeAll(() => {
		originalStartParams = originalGlobal.startParams;
		originalTsNodeInstance = processWithTsNode[tsNodeSymbol];
	});

	afterAll(() => {
		originalGlobal.startParams = originalStartParams;
		processWithTsNode[tsNodeSymbol] = originalTsNodeInstance;
	});

	beforeEach(() => {
		originalGlobal.startParams = undefined;
		delete processWithTsNode[tsNodeSymbol];
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

	test("should return false when ts-node instance is not set", () => {
		expect(isTsNode()).toBe(false);
	});

	test("should return true when ts-node instance is set", () => {
		processWithTsNode[tsNodeSymbol] = {};
		expect(isTsNode()).toBe(true);
	});
});
