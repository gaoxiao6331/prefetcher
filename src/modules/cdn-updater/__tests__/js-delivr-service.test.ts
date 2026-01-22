import axios from "axios";
import { exec } from "child_process";
import type { FastifyInstance } from "fastify";
import fs from "fs";
import JsDelivrService from "../js-delivr-service";

// Mock external dependencies
jest.mock("fs", () => ({
	existsSync: jest.fn(),
	writeFileSync: jest.fn(),
	promises: {
		readFile: jest.fn(),
	},
}));
jest.mock("child_process");
jest.mock("axios");

describe("JsDelivrService", () => {
	let fastifyMock: FastifyInstance;
	let jsDelivrService: JsDelivrService;

	// Helper to mock exec callback for success
	const mockExecSuccess = (stdout = "") => {
		(exec as unknown as jest.Mock).mockImplementation((cmd: any, cb: any) => {
			cb(null, { stdout, stderr: "" });
		});
	};

	beforeEach(async () => {
		jest.clearAllMocks();

		fastifyMock = {
			log: {
				info: jest.fn(),
				warn: jest.fn(),
				error: jest.fn(),
			},
			config: {
				cdn: {
					jsDelivr: {
						localPath: "/tmp/mock-repo",
						remoteAddr: "https://github.com/test-user/test-repo",
						git: {
							name: "TestUser",
							email: "test@example.com",
						},
					},
				},
			},
		} as unknown as FastifyInstance;

		// Default mocks
		(fs.existsSync as jest.Mock).mockReturnValue(true);
		(fs.writeFileSync as jest.Mock).mockReturnValue(undefined);
		(axios.get as jest.Mock).mockResolvedValue({
			data: { status: "finished" },
		});
		mockExecSuccess();

		jsDelivrService = await JsDelivrService.create(fastifyMock);
	});

	test("should initialize correctly", () => {
		expect(jsDelivrService).toBeDefined();
	});

	test("should throw error only if config is missing", async () => {
		const badFastify = { config: {} } as any;
		await expect(JsDelivrService.create(badFastify)).rejects.toThrow(
			"Invalid jsDelivr config",
		);
	});

	test("should handle missing optional git config", async () => {
		const minimalConfig = {
			config: {
				cdn: {
					jsDelivr: {
						localPath: "/tmp",
						remoteAddr: "git@github.com:test/repo.git",
					},
				},
			},
			log: { info: jest.fn() },
		} as any;
		const service = await JsDelivrService.create(minimalConfig);
		// Access private for coverage
		await (service as any).configureGit("/tmp");
		expect(service).toBeDefined();
	});

	describe("update", () => {
		test("should clone repo if local path does not exist", async () => {
			(fs.existsSync as jest.Mock).mockReturnValue(false);

			await jsDelivrService.update("main", "test.js", "content");

			expect(exec).toHaveBeenCalledWith(
				expect.stringContaining("git clone"),
				expect.any(Function),
			);
		});

		test("should switch to existing branch locally", async () => {
			await jsDelivrService.update("feature-branch", "test.js", "content");

			expect(exec).toHaveBeenCalledWith(
				expect.stringContaining('git rev-parse --verify "feature-branch"'),
				expect.any(Function),
			);
		});

		test("should checkout remote branch if local branch missing", async () => {
			(exec as unknown as jest.Mock).mockImplementation(
				(cmd: string, cb: any) => {
					if (cmd.includes('rev-parse --verify "feature-branch"')) {
						cb(new Error("Branch not found"), { stdout: "", stderr: "" });
					} else {
						cb(null, { stdout: "", stderr: "" });
					}
				},
			);

			await jsDelivrService.update("feature-branch", "test.js", "content");

			expect(exec).toHaveBeenCalledWith(
				expect.stringContaining(
					'git rev-parse --verify "origin/feature-branch"',
				),
				expect.any(Function),
			);
		});

		test("should create new branch if neither local nor remote exists", async () => {
			(exec as unknown as jest.Mock).mockImplementation(
				(cmd: string, cb: any) => {
					if (cmd.includes("rev-parse")) {
						cb(new Error("Not found"), { stdout: "", stderr: "" });
					} else {
						cb(null, { stdout: "", stderr: "" });
					}
				},
			);

			await jsDelivrService.update("new-branch", "test.js", "content");

			expect(exec).toHaveBeenCalledWith(
				expect.stringContaining('git checkout -b "new-branch"'),
				expect.any(Function),
			);
		});

		test("should create file if not exists", async () => {
			(fs.existsSync as jest.Mock)
				.mockReturnValueOnce(true) // localPath check
				.mockReturnValueOnce(false); // file check
			await jsDelivrService.update("main", "new-file.js", "content");
			expect(fs.writeFileSync).toHaveBeenCalledWith(
				expect.stringContaining("new-file.js"),
				"",
			);
		});

		test("should warn if git pull fails", async () => {
			(exec as unknown as jest.Mock).mockImplementation(
				(cmd: string, cb: any) => {
					if (cmd.includes("git pull")) {
						cb(new Error("Pull failed"), { stdout: "", stderr: "" });
					} else {
						cb(null, { stdout: "M test.js", stderr: "" });
					}
				},
			);

			await jsDelivrService.update("main", "test.js", "content");
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.stringContaining("Failed to pull"),
			);
		});

		test("should skip commit if no changes", async () => {
			(exec as unknown as jest.Mock).mockImplementation(
				(cmd: string, cb: any) => {
					if (cmd.includes("status --porcelain")) {
						cb(null, { stdout: "", stderr: "" });
					} else {
						cb(null, { stdout: "", stderr: "" });
					}
				},
			);

			await jsDelivrService.update("main", "test.js", "content");

			expect(exec).not.toHaveBeenCalledWith(
				expect.stringContaining("git commit"),
				expect.any(Function),
			);
		});

		test("should throw error if remote address is invalid", async () => {
			fastifyMock.config.cdn.jsDelivr.remoteAddr = "invalid-url";
			const service = await JsDelivrService.create(fastifyMock);
			await expect(service.update("main", "f", "c")).rejects.toThrow(
				"Invalid github remote address",
			);
		});
	});

	describe("purgeJsDelivrCache", () => {
		test("should handle string response data", async () => {
			(axios.get as jest.Mock).mockResolvedValue({
				data: "finished in string",
			});
			await jsDelivrService["purgeJsDelivrCache"]("ns", "pj", "f", "b");
			expect(fastifyMock.log.info).toHaveBeenCalledWith(
				expect.stringContaining("completed"),
			);
		});

		test("should throw error when purge fails", async () => {
			(axios.get as jest.Mock).mockResolvedValue({
				data: { status: "pending" },
			});

			await expect(
				jsDelivrService["purgeJsDelivrCache"](
					"ns",
					"proj",
					"file.js",
					"branch",
				),
			).rejects.toThrow("jsDelivr cache purge failed");
		});

		test("should throw error on axios network error", async () => {
			(axios.get as jest.Mock).mockRejectedValue(new Error("Network Error"));

			await expect(
				jsDelivrService["purgeJsDelivrCache"](
					"ns",
					"proj",
					"file.js",
					"branch",
				),
			).rejects.toThrow("jsDelivr cache purge failed");
		});
	});

	describe("verifyContentUpdate", () => {
		test("should return true when content matches", async () => {
			(axios.get as jest.Mock).mockResolvedValue({ data: "expected content" });

			const result = await jsDelivrService.verifyContentUpdate(
				"url",
				"expected content",
			);
			expect(result).toBe(true);
		});

		test("should return false when content mismatches", async () => {
			(axios.get as jest.Mock).mockResolvedValue({ data: "different content" });

			const result = await jsDelivrService.verifyContentUpdate(
				"url",
				"expected content",
			);
			expect(result).toBe(false);
			expect(fastifyMock.log.warn).toHaveBeenCalled();
		});

		test("should return false on network error", async () => {
			(axios.get as jest.Mock).mockRejectedValue(new Error("Network Error"));

			const result = await jsDelivrService.verifyContentUpdate(
				"url",
				"content",
			);
			expect(result).toBe(false);
			expect(fastifyMock.log.warn).toHaveBeenCalled();
		});
	});
});
