export interface Config {
	env: string;
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
