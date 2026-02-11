import type { GenerateContext } from "../type";
import BaseService from "./base";

class AllJsService extends BaseService {
	protected override async filter(
		ctx: GenerateContext,
	): Promise<GenerateContext> {
		// Keep only JavaScript files
		return {
			...ctx,
			capturedResources: ctx.capturedResources.filter(
				(item) => item.type === "script",
			),
		};
	}

	protected override async rank(
		ctx: GenerateContext,
	): Promise<GenerateContext> {
		// Sort resources by size in descending order
		return {
			...ctx,
			capturedResources: ctx.capturedResources.sort(
				(a, b) => b.sizeKB - a.sizeKB,
			),
		};
	}
}

export default AllJsService;
