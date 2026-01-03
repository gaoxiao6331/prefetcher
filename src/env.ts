// 不需要从手动设置，启动的时候已经设置了
export const env = process.env.NODE_ENV || "dev";

export const LARK_BOT_TOKENS = (process.env.LARK_BOT_TOKENS || "")
	.split(",")
	.filter(Boolean);

export const PASSPHRASE = process.env.PASSPHRASE || "";

export const PUPPETEER_EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH;
