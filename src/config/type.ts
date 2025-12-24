export interface Config {
	env: "dev" | "test" | "prod";
	port: number;
	cdn?: {
		jsDelivr?: {
			localPath: string;
			remoteAddr: string;
			git?: {
				name?: string;
				email?: string;
			}
		};
	};
	crypto?: {
		publicKey: string;
	};
}
