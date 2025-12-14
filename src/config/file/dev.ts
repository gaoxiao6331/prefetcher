import type { Config } from "../type";

const config: Config = {
	env: "dev",
	port: 3000,
	cdn: {
		jsDelivr: {
			repo: "../cdn-test",
		},
	},
	
};

export default config;
