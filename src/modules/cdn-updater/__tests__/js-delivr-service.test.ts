import axios from "axios";
import { exec } from "child_process";
import type { FastifyInstance } from "fastify";
import fs from "fs";
import JsDelivrService from "../js-delivr-service";

// Mock external dependencies
jest.mock("fs");
jest.mock("child_process");
jest.mock("axios");

describe("JsDelivrService", () => {
	let fastifyMock: any;
	let jsDelivrService: JsDelivrService;

	// Helper to mock exec callback for success
	const mockExecSuccess = (stdout = "") => {
		(exec as unknown as jest.Mock).mockImplementation((cmd: any, cb: any) => {
			cb(null, { stdout, stderr: "" });
		});
	};

	// Helper to mock exec callback for error
	const mockExecError = (error: Error) => {
		(exec as unknown as jest.Mock).mockImplementation((cmd: any, cb: any) => {
			cb(error, { stdout: "", stderr: "" });
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
		// Verify constructor logic (private properties logic via side effects or just trust it works if no error)
	});

	test("should throw error only if config is missing (handled by constructor)", async () => {
		fastifyMock.config.cdn = undefined;
		try {
			await JsDelivrService.create(fastifyMock);
		} catch (e: any) {
			expect(e.message).toBe("Invalid jsDelivr config");
		}
	});

	describe("update", () => {
		test("should clone repo if local path does not exist", async () => {
			(fs.existsSync as jest.Mock).mockReturnValue(false); // First check fails

			await jsDelivrService.update("main", "test.js", "content");

			expect(exec).toHaveBeenCalledWith(
				expect.stringContaining("git clone"),
				expect.any(Function),
			);
		});

		test("should switch to existing branch locally", async () => {
			// exec is already mocked to succeed, so `git rev-parse --verify "branch"` will succeed (exit code 0)
			await jsDelivrService.update("feature-branch", "test.js", "content");

			// Should confirm branch exists and checkout
			expect(exec).toHaveBeenCalledWith(
				expect.stringContaining('git rev-parse --verify "feature-branch"'),
				expect.any(Function),
			);
			expect(exec).toHaveBeenCalledWith(
				expect.stringContaining('git checkout "feature-branch"'),
				expect.any(Function),
			);
		});

		// To properly test branch logic we need to simulate exec failures (exit code non-zero usually means error in cb)
		test("should checkout remote branch if local branch missing", async () => {
			// 1. git rev-parse (local) -> fail
			// 2. git rev-parse (remote) -> success
			// 3. git checkout -b -> success

			let callCount = 0;
			(exec as unknown as jest.Mock).mockImplementation(
				(cmd: string, cb: any) => {
					callCount++;
					if (cmd.includes('rev-parse --verify "feature-branch"')) {
						// First call: local check fails
						cb(new Error("Branch not found"), { stdout: "", stderr: "" });
					} else {
						// Others succeed (remote check, checkout)
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
						// Both checks fail
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

		test("should write file and commit push", async () => {
			await jsDelivrService.update("main", "test.js", "content");

			expect(fs.writeFileSync).toHaveBeenCalled();
			expect(exec).toHaveBeenCalledWith(
				expect.stringContaining("git commit -m"),
				expect.any(Function),
			);
			expect(exec).toHaveBeenCalledWith(
				expect.stringContaining("git push origin HEAD"),
				expect.any(Function),
			);
			expect(exec).toHaveBeenCalledWith(
				expect.stringContaining("git push origin"), // tag push
				expect.any(Function),
			);
		});

		test("should skip commit if no changes", async () => {
			// Mock git status --porcelain to return empty string
			(exec as unknown as jest.Mock).mockImplementation(
				(cmd: string, cb: any) => {
					if (cmd.includes("status --porcelain")) {
						cb(null, { stdout: "   ", stderr: "" });
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
	});

	describe("purgeJsDelivrCache", () => {
		test("should log success when purge returns finished", async () => {
			(axios.get as jest.Mock).mockResolvedValue({
				data: { status: "finished" },
			});

			await jsDelivrService["purgeJsDelivrCache"](
				"ns",
				"proj",
				"file.js",
				"branch",
			);

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
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.anything(),
				expect.stringContaining("Content verification failed"),
			);
		});

		test("should return false on network error", async () => {
			(axios.get as jest.Mock).mockRejectedValue(new Error("Network Error"));

			const result = await jsDelivrService.verifyContentUpdate(
				"url",
				"content",
			);
			expect(result).toBe(false);
			expect(fastifyMock.log.warn).toHaveBeenCalledWith(
				expect.stringContaining("Failed to verify"),
			);
		});
	});
});
