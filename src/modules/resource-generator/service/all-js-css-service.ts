import type { CapturedResource, GenerateContext } from "../type";
import AllJsService from "./all-js-service";

class AllJsAndCssService extends AllJsService {
	protected override async filter(ctx: GenerateContext): Promise<GenerateContext> {
		// Keep JavaScript and CSS files
		return {
			...ctx,
			capturedResources: ctx.capturedResources.filter(
				(item) => item.type === "script" || item.type === "stylesheet",
			),
		};
	}
}

export default AllJsAndCssService;
