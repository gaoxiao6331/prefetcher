export interface Config {
	env: "dev" | "test" | "prod";
	port: number;
    cdn?: {
        jsDelivr?: {
            repo: string;
        };
    }
}
