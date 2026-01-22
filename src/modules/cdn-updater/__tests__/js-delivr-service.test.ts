import { exec } from "node:child_process";
import fs from "node:fs";
import axios from "axios";
import type { FastifyInstance } from "fastify";
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
		(exec as unknown as jest.Mock).mockImplementation(
			(
				_cmd: string,
				cb: (
					err: Error | null,
					res: { stdout: string; stderr: string },
				) => void,
			) => {
				cb(null, { stdout, stderr: "" });
			},
		);
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
		// biome-ignore lint/suspicious/noExplicitAny: mock fastify
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
			// biome-ignore lint/suspicious/noExplicitAny: mock fastify
		} as any;
		const service = await JsDelivrService.create(minimalConfig);
		// Access private for coverage
		// biome-ignore lint/suspicious/noExplicitAny: access private
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
				(
					cmd: string,
					cb: (
						err: Error | null,
						res: { stdout: string; stderr: string },
					) => void,
				) => {
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
				(
					cmd: string,
					cb: (
						err: Error | null,
						res: { stdout: string; stderr: string },
					) => void,
				) => {
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
				(
					cmd: string,
					cb: (
						err: Error | null,
						res: { stdout: string; stderr: string },
					) => void,
				) => {
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
				(
					cmd: string,
					cb: (
						err: Error | null,
						res: { stdout: string; stderr: string },
					) => void,
				) => {
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
			// biome-ignore lint/suspicious/noExplicitAny: access config
			(fastifyMock.config as any).cdn.jsDelivr.remoteAddr = "invalid-url";
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
			// biome-ignore lint/suspicious/noExplicitAny: access private
			await (jsDelivrService as any).purgeJsDelivrCache("ns", "pj", "f", "b");
			expect(fastifyMock.log.info).toHaveBeenCalledWith(
				expect.stringContaining("completed"),
			);
		});

		test("should throw error when purge fails", async () => {
			(axios.get as jest.Mock).mockResolvedValue({
				data: { status: "pending" },
			});

			await expect(
				// biome-ignore lint/suspicious/noExplicitAny: access private
				(jsDelivrService as any).purgeJsDelivrCache(
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
				// biome-ignore lint/suspicious/noExplicitAny: access private
				(jsDelivrService as any).purgeJsDelivrCache(
					"ns",
					"proj",
					"file.js",
					"branch",
				),
			).rejects.toThrow("jsDelivr cache purge failed");
		});

		test("should handle non-Error catch in purgeJsDelivrCache", async () => {
			(axios.get as jest.Mock).mockRejectedValue("String Error");

			await expect(
				// biome-ignore lint/suspicious/noExplicitAny: access private
				(jsDelivrService as any).purgeJsDelivrCache(
					"ns",
					"proj",
					"file.js",
					"branch",
				),
			).rejects.toThrow(
				"jsDelivr cache purge failed: https://purge.jsdelivr.net/gh/ns/proj@branch/file.js, error: String Error",
			);
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
