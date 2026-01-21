
import Fastify from "fastify";
import alertPlugin from "../alert";

describe("Alert Plugin", () => {

    test("should log error if notifierService fails", async () => {
        const app = Fastify();

        const mockNotifier = {
            error: jest.fn().mockRejectedValue(new Error("Alert failed")),
            info: jest.fn(),
            warn: jest.fn()
        } as any;

        app.decorate("notifierService", mockNotifier);

        jest.doMock("../../env", () => ({
            LARK_BOT_TOKENS: ["token1"],
            env: "dev",
            PASSPHRASE: ""
        }));

        const freshAlertPlugin = require("../alert").default;
        await app.register(freshAlertPlugin);

        const logSpy = jest.spyOn(app.log, 'error');

        await app.alert("test message");

        expect(logSpy).toHaveBeenCalledWith(expect.any(Error), "Error sending alert");
    });

    test("should log warning if no tokens configured", async () => {
        const app = Fastify();

        jest.resetModules();
        jest.doMock("../../env", () => ({
            LARK_BOT_TOKENS: [],
            env: "dev",
            PASSPHRASE: ""
        }));

        const freshAlertPlugin = require("../alert").default;
        await app.register(freshAlertPlugin);

        const logSpy = jest.spyOn(app.log, 'warn');

        await app.alert("test message");

        expect(logSpy).toHaveBeenCalledWith("NO LARK BOT TOKENS");
    });
});
