import * as startModule from "../start";

// Mock the start function
jest.mock("../start", () => ({
	start: jest.fn().mockResolvedValue(undefined),
}));

describe("CLI Entrypoint", () => {
	let originalArgv: string[];
	let originalExit: typeof process.exit;

	beforeEach(() => {
		jest.clearAllMocks();
		originalArgv = process.argv;
		originalExit = process.exit;
		process.exit = jest.fn() as unknown as typeof process.exit;
	});

	afterEach(() => {
		process.argv = originalArgv;
		process.exit = originalExit;
	});

	test("should call start when running command", async () => {
		process.argv = ["node", "index.js", "start", "--debug"];

		jest.isolateModules(() => {
			require("../index");
		});

		expect(startModule.start).toHaveBeenCalledWith(
			expect.objectContaining({
				debug: true,
			}),
		);
	});

	test("should use default debug value", async () => {
		process.argv = ["node", "index.js", "start"];

		jest.isolateModules(() => {
			require("../index");
		});

		expect(startModule.start).toHaveBeenCalledWith(
			expect.objectContaining({
				debug: false,
			}),
		);
	});
});
