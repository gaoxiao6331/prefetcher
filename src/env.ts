export const DEV_ENV = "dev";

export const env = process.env.NODE_ENV || DEV_ENV;

export const LARK_BOT_TOKENS = (process.env.LARK_BOT_TOKENS || "")
	.split(",")
	.filter(Boolean);

export const PUPPETEER_EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH;
