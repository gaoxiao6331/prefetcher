export interface Config {
	env: "dev" | "test" | "prod";
	port: number;
	cdn?: {
		jsDelivr?: {
			localPath: string;
			remoteAddr: string;
		};
	};
	crypto?: {
		publicKey: string;
	};
}
