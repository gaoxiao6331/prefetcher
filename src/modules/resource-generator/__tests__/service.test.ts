
import puppeteer from "puppeteer";
import { FastifyInstance } from "fastify";
import JsOnlyService from "../service/js-only-service";

jest.mock("puppeteer");
jest.mock("@/utils/trace-context", () => ({
    bindAsyncContext: (fn: any) => fn,
    getLogger: jest.fn().mockReturnValue(null),
}));

describe("JsOnlyService", () => {
    let fastifyMock: any;
    let service: any;

    let mockPage: any;
    let mockBrowser: any;

    beforeEach(async () => {
        jest.clearAllMocks();

        mockPage = {
            on: jest.fn(),
            goto: jest.fn(),
            setRequestInterception: jest.fn(),
            isClosed: jest.fn().mockReturnValue(false),
            close: jest.fn(),
        };

        mockBrowser = {
            newPage: jest.fn().mockResolvedValue(mockPage),
            close: jest.fn(),
            connected: true,
            on: jest.fn(),
        };

        (puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);

        fastifyMock = {
            log: {
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
            },
        } as unknown as FastifyInstance;

        service = await JsOnlyService.create(fastifyMock);
    });

    test("should initialize browser", () => {
        expect(puppeteer.launch).toHaveBeenCalled();
        expect(service).toBeDefined();
    });

    test("captureResources should handle request and response events", async () => {
        const url = "http://example.com";
        const scriptUrl = "http://example.com/script.js";

        let requestListener: Function | undefined;
        let responseListener: Function | undefined;

        mockPage.on.mockImplementation((event: string, listener: Function) => {
            if (event === "request") requestListener = listener;
            if (event === "response") responseListener = listener;
        });

        mockPage.goto.mockImplementation(async () => {
            const mockRequest = {
                method: () => "GET",
                url: () => scriptUrl,
                headers: () => ({}),
                continue: jest.fn(),
                isInterceptResolutionHandled: () => false,
                resourceType: () => "script",
            };
            if (requestListener) await requestListener(mockRequest);

            const mockResponse = {
                request: () => ({
                    method: () => "GET",
                    headers: () => ({ "x-prefetcher-req-id": "1" }),
                    resourceType: () => "script",
                }),
                status: () => 200,
                url: () => scriptUrl,
                buffer: jest.fn().mockResolvedValue(Buffer.alloc(1024)),
            };
            if (responseListener) await responseListener(mockResponse);
        });

        const resources = await service.captureResources(url);
        expect(resources).toContain(scriptUrl);
    });

    test("non-GET request interception", async () => {
        let requestListener: Function | undefined;
        mockPage.on.mockImplementation((event: string, listener: Function) => {
            if (event === "request") requestListener = listener;
        });

        const mockPostRequest = {
            method: () => "POST",
            continue: jest.fn(),
            isInterceptResolutionHandled: () => false,
        };

        mockPage.goto.mockImplementation(async () => {
            if (requestListener) await requestListener(mockPostRequest);
        });

        await service.captureResources("url");
        expect(mockPostRequest.continue).toHaveBeenCalled();
    });

    test("request interception failure", async () => {
        let requestListener: Function | undefined;
        mockPage.on.mockImplementation((event: string, listener: Function) => {
            if (event === "request") requestListener = listener;
        });

        const mockRequest = {
            method: () => { throw new Error("Method fail"); },
            continue: jest.fn().mockRejectedValue(new Error("Cont fail")),
            isInterceptResolutionHandled: () => false,
        };

        mockPage.goto.mockImplementation(async () => {
            if (requestListener) await requestListener(mockRequest);
        });

        await service.captureResources("url");
        expect(fastifyMock.log.warn).toHaveBeenCalledWith(expect.stringContaining("Request interception failed"));
    });

    test("response processing failure", async () => {
        let responseListener: Function | undefined;
        mockPage.on.mockImplementation((event: string, listener: Function) => {
            if (event === "response") responseListener = listener;
        });

        mockPage.goto.mockImplementation(async () => {
            const mockResponse = {
                request: () => { throw new Error("Response fail"); },
            };
            if (responseListener) await responseListener(mockResponse);
        });

        await service.captureResources("url");
        expect(fastifyMock.log.warn).toHaveBeenCalledWith(expect.stringContaining("Response processing failed"));
    });

    test("should handle browser init returning null", async () => {
        service.browser.connected = false;
        (puppeteer.launch as jest.Mock).mockResolvedValueOnce(null);
        await expect(service.captureResources("url")).rejects.toThrow("Failed to initialize browser");
    });

    test("should handle browse disconnected event", async () => {
        let dcListener: Function | undefined;
        (puppeteer.launch as jest.Mock).mockImplementationOnce(async () => {
            const anotherMockBrowser = { ...mockBrowser, on: jest.fn() };
            anotherMockBrowser.on.mockImplementation((event: string, listener: any) => {
                if (event === "disconnected") dcListener = listener;
            });
            return anotherMockBrowser;
        });

        service = await JsOnlyService.create(fastifyMock);
        if (dcListener) dcListener();
        expect(fastifyMock.log.warn).toHaveBeenCalledWith(expect.stringContaining("disconnected"));
    });

    test("should cover filter and rank in JsOnlyService with multiple items", async () => {
        const resources = [
            { url: "small.js", type: "script", sizeKB: 5, durationMs: 100 },
            { url: "large.js", type: "script", sizeKB: 50, durationMs: 100 },
            { url: "image.png", type: "image", sizeKB: 5, durationMs: 50 },
        ];
        // @ts-ignore
        const filtered = service.filter(resources);
        expect(filtered.length).toBe(2);

        // @ts-ignore
        const ranked = service.rank(filtered);
        expect(ranked[0].url).toBe("large.js");
        expect(ranked[1].url).toBe("small.js");
    });

    test("should handle browser close and re-init in captureResources", async () => {
        service.browser.connected = false;
        const newMockBrowser = { ...mockBrowser, connected: true, close: jest.fn() };
        (puppeteer.launch as jest.Mock).mockResolvedValueOnce(newMockBrowser);

        await service.captureResources("url");
        expect(puppeteer.launch).toHaveBeenCalledTimes(2);
    });

    test("edge cases in captureResources branches", async () => {
        let requestListener: Function | undefined;
        let responseListener: Function | undefined;

        mockPage.on.mockImplementation((event: string, listener: Function) => {
            if (event === "request") requestListener = listener;
            if (event === "response") responseListener = listener;
        });

        mockPage.goto.mockImplementation(async () => {
            // Populate map for ID "1"
            if (requestListener) {
                await requestListener({
                    url: () => "http://test.com/script.js",
                    method: () => "GET",
                    headers: () => ({ "x-prefetcher-req-id": "1" }),
                    isInterceptResolutionHandled: () => false,
                    continue: jest.fn(),
                });
            }

            // 1. isInterceptResolutionHandled is true (line 136)
            if (requestListener) {
                await requestListener({
                    isInterceptResolutionHandled: () => true,
                });
            }

            // 2. Interception failure and hits continue in catch (line 160)
            if (requestListener) {
                await requestListener({
                    isInterceptResolutionHandled: () => false, // Set to false to hit the catch block
                    method: () => { throw new Error("Trigger catch"); },
                    continue: jest.fn().mockRejectedValue(new Error("Cont fail")),
                });
            }

            // 2b. Interception failure and ALREADY handled in catch (line 159 branch)
            if (requestListener) {
                const reqHandled = {
                    isInterceptResolutionHandled: jest.fn()
                        .mockReturnValueOnce(false) // line 136 bypass
                        .mockReturnValueOnce(true),  // line 159 branch hit
                    method: () => { throw new Error("Trigger catch again"); },
                    continue: jest.fn(),
                };
                await requestListener(reqHandled);
            }

            // 3. Response non-GET
            if (responseListener) {
                await responseListener({
                    request: () => ({ method: () => "POST" })
                });
            }

            // 4. Response missing requestId
            if (responseListener) {
                await responseListener({
                    request: () => ({ method: () => "GET", headers: () => ({}) })
                });
            }

            // 5. Response unknown requestId
            if (responseListener) {
                await responseListener({
                    request: () => ({ method: () => "GET", headers: () => ({ "x-prefetcher-req-id": "unknown" }) })
                });
            }

            // 6. Response status boundaries
            const statuses = [100, 199, 200, 299, 300, 500];
            for (const s of statuses) {
                if (responseListener) {
                    await responseListener({
                        request: () => ({ method: () => "GET", headers: () => ({ "x-prefetcher-req-id": "1" }), resourceType: () => "script" }),
                        status: () => s,
                        url: () => `http://test.com/${s}.js`,
                        buffer: jest.fn().mockResolvedValue(Buffer.alloc(0))
                    });
                }
            }

            // 8. Response buffer failure
            if (responseListener) {
                await responseListener({
                    request: () => ({ method: () => "GET", headers: () => ({ "x-prefetcher-req-id": "1" }), resourceType: () => "script" }),
                    status: () => 200,
                    url: () => "http://test.com/buffer-fail.js",
                    buffer: jest.fn().mockRejectedValue(new Error("Buffer failed"))
                });
            }
        });

        await service.captureResources("url");
        expect(fastifyMock.log.warn).toHaveBeenCalled();
    });

    test("page auto-disposal branch when already closed", async () => {
        mockPage.isClosed.mockReturnValue(true);
        await service.captureResources("url");
        expect(mockPage.close).not.toHaveBeenCalled();
    });
});
