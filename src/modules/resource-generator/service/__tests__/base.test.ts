
import Fastify from "fastify";
import BaseService from "../base";
import puppeteer from "puppeteer";

jest.mock("puppeteer");

describe("BaseService", () => {
    let fastifyMock: any;

    beforeEach(() => {
        fastifyMock = {
            log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
            config: {}
        } as any;
        jest.clearAllMocks();
    });

    class TestService extends BaseService {
        protected filter(resource: any[]) { return resource; }
        protected rank(res: any[]) { return res; }
        public async generate() { return { resources: [], resultFileName: "test" }; }
        public async triggerGetPage() { return (this as any).getPage(); }
    }

    test("should handle browser initialization failure", async () => {
        const service = new TestService(fastifyMock);

        // Mock puppeteer.launch to return null
        (puppeteer.launch as jest.Mock).mockResolvedValue(null);

        await expect(service.triggerGetPage()).rejects.toThrow("Failed to initialize browser");
    });

    test("close() should be idempotent when no browser exists", async () => {
        const service = new TestService(fastifyMock);
        await service.close();
        expect(fastifyMock.log.info).not.toHaveBeenCalledWith("Puppeteer browser closed");
    });

    test("close() should close browser if it exists", async () => {
        const mockBrowser = {
            close: jest.fn().mockResolvedValue(undefined)
        };
        const service = new TestService(fastifyMock);
        (service as any).browser = mockBrowser;

        await service.close();

        expect(mockBrowser.close).toHaveBeenCalled();
        expect(fastifyMock.log.info).toHaveBeenCalledWith("Puppeteer browser closed");
        expect((service as any).browser).toBeNull();
    });

    test("initBrowser should return early if browser already exists and is connected", async () => {
        const service = new TestService(fastifyMock);
        (service as any).browser = { connected: true };
        await (service as any).initBrowser();
        expect(puppeteer.launch).not.toHaveBeenCalled();
    });

    test("getPage should re-init if browser is disconnected", async () => {
        const mockPage = {
            on: jest.fn(),
            goto: jest.fn(),
            setRequestInterception: jest.fn(),
            isClosed: jest.fn().mockReturnValue(false),
            close: jest.fn(),
        };
        const mockBrowser = {
            newPage: jest.fn().mockResolvedValue(mockPage),
            connected: false, // Disconnected
            on: jest.fn(),
            close: jest.fn().mockResolvedValue(undefined),
        };
        const newMockBrowser = {
            newPage: jest.fn().mockResolvedValue(mockPage),
            connected: true,
            on: jest.fn(),
            close: jest.fn().mockResolvedValue(undefined),
        };

        (puppeteer.launch as jest.Mock).mockResolvedValue(newMockBrowser);
        const service = new TestService(fastifyMock);
        (service as any).browser = mockBrowser;

        await service.triggerGetPage();

        expect(fastifyMock.log.warn).toHaveBeenCalledWith(expect.stringContaining("Browser not connected"));
        expect(mockBrowser.close).toHaveBeenCalled();
        expect(puppeteer.launch).toHaveBeenCalled();
    });

    test("getPage should throw if initBrowser fails to set browser", async () => {
        const service = new TestService(fastifyMock);
        // Mock initBrowser to do nothing (not set this.browser)
        jest.spyOn(service as any, 'initBrowser').mockImplementation(async () => { });

        await expect(service.triggerGetPage()).rejects.toThrow("Failed to initialize browser");
    });
});
