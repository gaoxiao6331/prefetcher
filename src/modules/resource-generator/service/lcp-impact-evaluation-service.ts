import type { GenerateContext } from "../type";
import AllJsCssService from "./all-js-css-service";

class LcpImpactService extends AllJsCssService {
	protected override async rank(
		ctx: GenerateContext,
	): Promise<GenerateContext> {
		// TODO: Implement LCP specific ranking logic here
		// For now, return as is to satisfy the abstract method requirement
		return ctx;
	}
}

export default LcpImpactService;