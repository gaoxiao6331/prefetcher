import { z } from "zod";

export const createResourceSchema = {
  body: z.object({
    targetUrl: z.string().min(1),
    projectName: z.string().min(1),
	targetFileName: z.string().min(1),
    template: z
      .string()
      .refine((val) => val.includes("__content_placeholder__"), 
        'template field must contain a placeholder string "__content_placeholder__"',
      )
      .optional(),
  }),
  response: {
    200: z.object({
      message: z.string(),
    }),
  },
};
