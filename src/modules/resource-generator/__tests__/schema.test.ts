import { createResourceSchema } from "../schema";

describe("Resource Generator Schema", () => {
	test("template field must contain placeholder string", () => {
		const schema = createResourceSchema.body;

		// Positive case
		const valid = schema.parse({
			targetUrl: "http://test.com",
			projectName: "test",
			targetFileName: "test.js",
			template: "data: __content_placeholder__",
		});
		expect(valid.template).toContain("__content_placeholder__");

		// Negative case
		const invalid = {
			targetUrl: "http://test.com",
			projectName: "test",
			targetFileName: "test.js",
			template: "no placeholder",
		};
		const result = schema.safeParse(invalid);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.errors[0].message).toContain(
				"__content_placeholder__",
			);
		}
	});

	test("other fields validation", () => {
		const schema = createResourceSchema.body;

		const invalid = {
			targetUrl: "invalid-url",
			projectName: "",
			targetFileName: "",
			template: "__content_placeholder__",
		};
		const result = schema.safeParse(invalid);
		expect(result.success).toBe(false);
	});
});
