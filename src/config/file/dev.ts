import type { Config } from "../type";

const config: Config = {
	env: "dev",
	port: 3000,
	cdn: {
		jsDelivr: {
			localPath: "../cdn-test",
			remoteAddr: "https://github.com/gaoxiao6331/cdn-test",
		},
	},
};

export default config;
