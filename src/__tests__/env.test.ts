
describe("Env Utility", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test("should use environment variables when set", () => {
        process.env = {
            ...originalEnv,
            NODE_ENV: "production",
            LARK_BOT_TOKENS: "token-a,token-b",
            PUPPETEER_EXECUTABLE_PATH: "/usr/bin/google-chrome"
        };

        const { env, LARK_BOT_TOKENS, PUPPETEER_EXECUTABLE_PATH } = require("../env");

        expect(env).toBe("production");
        expect(LARK_BOT_TOKENS).toEqual(["token-a", "token-b"]);
        expect(PUPPETEER_EXECUTABLE_PATH).toBe("/usr/bin/google-chrome");
    });

    test("should use default values when environment variables are missing", () => {
        process.env = { ...originalEnv };
        delete process.env.NODE_ENV;
        delete process.env.LARK_BOT_TOKENS;
        delete process.env.PUPPETEER_EXECUTABLE_PATH;

        const { env, LARK_BOT_TOKENS, PUPPETEER_EXECUTABLE_PATH } = require("../env");

        expect(env).toBe("dev");
        expect(LARK_BOT_TOKENS).toEqual([]);
        expect(PUPPETEER_EXECUTABLE_PATH).toBeUndefined();
    });
});
