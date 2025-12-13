import puppeteer, { Browser } from "puppeteer";
import { CapturedResource } from "./type";

class ResourceGeneratorService {
	private browser: Browser | null = null;

	private readonly requestHeader = "x-prefetcher-req-id";

	private constructor() {}

	private async init() {
		this.browser = await puppeteer.launch({
			headless: true,
			executablePath:
				"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", // 使用系统已安装的Chrome
		});
	}

	static async create() {
		const service = new ResourceGeneratorService();
		await service.init();
		return service;
	}

	async captureResources(url: string) {
		let id = 0;
		const page = await this.browser!.newPage();
		await page.setRequestInterception(true);

		const requestStartTimeMap = new Map();
		const capturedResources: CapturedResource[] = [];

		page.on("request", (request) => {
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
		});

		page.on("response", async (response) => {
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
		});

		await page.goto(url, {
			waitUntil: "networkidle0",
		});

		return capturedResources;
	}
}

export default ResourceGeneratorService;
