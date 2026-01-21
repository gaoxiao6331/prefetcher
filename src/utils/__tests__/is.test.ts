
import { isDebugMode } from "../is";

describe("is helper", () => {
    const originalGlobal = globalThis as any;
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
