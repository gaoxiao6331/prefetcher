import type { Config } from "../type";

const config: Config = {
	port: 3000,
	cdn: {
		jsDelivr: {
			localPath: "../cdn-test",
			// ssh is recommended, otherwise you need to login when server starts
			remoteAddr: "git@github.com:gaoxiao6331/cdn-test.git",
			git: {
				name: "prefetch bot",
				email: "gaoxiao6331@163.com",
			},
		},
	},
};

export default config;
