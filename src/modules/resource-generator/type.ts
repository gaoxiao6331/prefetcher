export interface CapturedResource {
    url: string,
    status: number,
    type: string,
    sizeKB: number,
    requestTime: number,
    responseTime: number,
    durationMs: number,
}