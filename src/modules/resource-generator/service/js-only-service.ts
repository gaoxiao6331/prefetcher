import BaseService from "./base";
import type { CapturedResource } from "../type";

class JsOnlyService extends BaseService {
    protected override filter(resource: CapturedResource[]) {
        // 只保留js文件
        return resource.filter((item) => item.type === "script");
    }
    
    protected override rank(res: CapturedResource[]) {
        // 按照资源体积从大到小排序
        return res.sort((a, b) => b.sizeKB - a.sizeKB);
    }
}

export default JsOnlyService;