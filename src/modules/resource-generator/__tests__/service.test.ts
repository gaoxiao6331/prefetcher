
import puppeteer from "puppeteer";
import { FastifyInstance } from "fastify";
import JsOnlyService from "../service/js-only-service";

jest.mock("puppeteer");

describe("JsOnlyService", () => {
    let fastifyMock: any;
    let service: JsOnlyService;

    const mockPage = {
        on: jest.fn(),
        goto: jest.fn(),
        setRequestInterception: jest.fn(),
        isClosed: jest.fn().mockReturnValue(false),
        close: jest.fn(),
    };

    const mockBrowser = {
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn(),
        connected: true,
        on: jest.fn(),
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        mockBrowser.connected = true;
        (puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);

        fastifyMock = {
            log: {
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
            },
        } as unknown as FastifyInstance;

        service = (await JsOnlyService.create(fastifyMock)) as JsOnlyService;
    });

    test("should initialize browser", () => {
        expect(puppeteer.launch).toHaveBeenCalled();
        expect(service).toBeDefined();
    });

    test("captureResources should process page", async () => {
        mockPage.goto.mockResolvedValue(null);
        const resources = await service.captureResources("http://example.com");

        expect(mockBrowser.newPage).toHaveBeenCalled();
        expect(mockPage.goto).toHaveBeenCalledWith("http://example.com", expect.anything());
        expect(mockPage.close).toHaveBeenCalled();
        expect(resources).toEqual([]);
    });

    test("should re-init browser if disconnected", async () => {
        mockBrowser.connected = false;
        await service.captureResources("http://example.com");
        expect(puppeteer.launch).toHaveBeenCalledTimes(2);
    });

    test("close should close browser", async () => {
        await service.close();
        expect(mockBrowser.close).toHaveBeenCalled();
    });
});
