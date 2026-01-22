import type { CapturedResource } from "../type";
import BaseService from "./base";

class JsOnlyService extends BaseService {
	protected override filter(resource: CapturedResource[]) {
		// Keep only JavaScript files
		return resource.filter((item) => item.type === "script");
	}

	protected override rank(res: CapturedResource[]) {
		// Sort resources by size in descending order
		return res.sort((a, b) => b.sizeKB - a.sizeKB);
	}
}

export default JsOnlyService;
