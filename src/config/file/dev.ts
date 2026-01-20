import type { Config } from "../type";

const config: Config = {
	port: 3000,
	cdn: {
		jsDelivr: {
			localPath: "../cdn-test",
			// 这里需要用ssh，否则需要登录
			remoteAddr: "git@github.com:gaoxiao6331/cdn-test.git",
			git: {
				name: "prefetch bot",
				email: "gaoxiao6331@163.com",
			},
		},
	}
};

export default config;
