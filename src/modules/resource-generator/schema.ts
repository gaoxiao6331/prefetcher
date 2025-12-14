import { z } from "zod";

export const createResourceSchema = {
	body: z.object({
		targetUrl: z.string().min(1),
		projectName: z.string().min(1),
		targetFileName: z.string().min(1),
	}),
	response: {
		200: z.object({
			message: z.string(),
		}),
	},
};
