import type { CapturedResource } from "../type";
import BaseService from "./base";

class AllJsAndCssService extends BaseService {
	protected override filter(resource: CapturedResource[]) {
		// Keep JavaScript and CSS files
		return resource.filter((item) => item.type === "script" || item.type === "stylesheet");
	}

	protected override rank(res: CapturedResource[]) {
		// Sort resources by size in descending order
		return res.sort((a, b) => b.sizeKB - a.sizeKB);
	}
}

export default AllJsAndCssService;
