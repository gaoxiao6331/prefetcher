import type { CapturedResource } from "../type";
import AllJsService from "./all-js-service";

class AllJsAndCssService extends AllJsService {
	protected override filter(resource: CapturedResource[]) {
		// Keep JavaScript and CSS files
		return resource.filter(
			(item) => item.type === "script" || item.type === "stylesheet",
		);
	}
}

export default AllJsAndCssService;
