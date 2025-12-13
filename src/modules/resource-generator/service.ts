import puppeteer, { type Browser } from "puppeteer";
import type { CapturedResource } from "./type";
import type { FastifyInstance } from "fastify";

class ResourceGeneratorService {
	private browser: Browser | null = null;

	private readonly requestHeader = "x-prefetcher-req-id";

	private constructor(private readonly fastify: FastifyInstance) {}

	private async init() {
		const headless = this.fastify.config.env !== "dev";

		this.browser = await puppeteer.launch({
			headless,
			args: [
				"--disable-gpu", // 主要参数：禁用GPU硬件加速
			],
			executablePath:
				"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", // TODO 使用系统已安装的Chrome
		});
	}

	static async create(fastify: FastifyInstance) {
		const service = new ResourceGeneratorService(fastify);
		await service.init();
		return service;
	}

	private filter(resource: CapturedResource[]) {
		// 只保留js文件
		return resource.filter((item) => item.type === "script");
	}

	private rank(res: CapturedResource[]) {
		// 按照资源体积从大到小排序
		return res.sort((a, b) => b.sizeKB - a.sizeKB);
	}

	private async getPage() {
		if (!this.browser) throw new Error("Browser is not initialized");
		const page = await this.browser!.newPage();
		await page.setRequestInterception(true);

		return {
			page,
			async [Symbol.asyncDispose]() {
				page.close();
			},
		};
	}

	async captureResources(url: string) {
		let id = 0;

		const requestStartTimeMap = new Map();
		const capturedResources: CapturedResource[] = [];

		await using pageObj = await this.getPage();
		const page = pageObj.page;

		const eventError = new Promise((_, reject) => {
			page.on("error", (error) => {
				reject(error);
			});

			page.on("request", (request) => {
				try {
					id++;
					request.continue({
						headers: {
							...request.headers(),
							[this.requestHeader]: id.toString(),
						},
					});
					const requestId = Reflect.get(request, this.requestHeader);
					const url = request.url();
					requestStartTimeMap.set(requestId, {
						url: url,
						timestamp: Date.now(),
					});
				} catch (err) {
					reject(err);
				}
			});

			page.on("response", async (response) => {
				try {
					const url = response.url();
					const status = response.status();
					const resourceType = response.request().resourceType();
					const resourceSizeByte = (await response.buffer()).length;
					const resourceSizeKB = resourceSizeByte / 1024;

					const request = response.request();
					const requestId = Reflect.get(request, this.requestHeader);
					const requestInfo = requestStartTimeMap.get(requestId);
					if (!requestInfo) new Error("requestInfo is null");
					const requestTime = requestInfo.timestamp;
					const now = Date.now();

					capturedResources.push({
						url: url,
						status: status,
						type: resourceType,
						sizeKB: resourceSizeKB,
						requestTime: requestTime,
						responseTime: now,
						durationMs: now - requestTime,
					});
				} catch (err) {
					reject(err);
				}
			});
		});
		await Promise.race([eventError, page.goto(url)]);

		const res = this.rank(this.filter(capturedResources));
		return res;
	}
}

export default ResourceGeneratorService;
