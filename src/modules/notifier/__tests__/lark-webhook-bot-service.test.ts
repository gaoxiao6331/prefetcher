import axios from "axios";
import type { FastifyInstance } from "fastify";

import LarkService from "../lark-webhook-bot-service";

jest.mock("axios");

describe("LarkService", () => {
	let fastifyMock: any;
	let larkService: LarkService;

	const TEST_TOKENS = ["fake-token-1", "fake-token-2"];

	beforeAll(async () => {
		fastifyMock = {
			log: {
				error: jest.fn(),
				warn: jest.fn(),
				info: jest.fn(),
			},
		} as unknown as FastifyInstance;

		larkService = await LarkService.create(fastifyMock);
	});

	beforeEach(() => {
		jest.clearAllMocks();
		// Default axios success
		(axios.post as jest.Mock).mockResolvedValue({
			status: 200,
			data: { code: 0, msg: "success" },
		});
	});

	test("should throw error if tokens list is empty", async () => {
		await expect(larkService.info("test", [])).rejects.toThrow(
			"No tokens provided",
		);
	});

	test("should send info message to lark successfully", async () => {
		await larkService.info("test message", TEST_TOKENS);

		expect(axios.post).toHaveBeenCalledTimes(TEST_TOKENS.length);
		expect(axios.post).toHaveBeenCalledWith(
			expect.stringContaining("hook/fake-token-1"),
			expect.objectContaining({
				msg_type: "interactive",
				card: expect.objectContaining({
					header: expect.objectContaining({ template: "green" }),
				}),
			}),
			expect.anything(),
		);
	});

	test("should send error message to lark successfully", async () => {
		await larkService.error("error message", TEST_TOKENS);

		expect(axios.post).toHaveBeenCalledWith(
			expect.stringContaining("hook/fake-token-1"),
			expect.objectContaining({
				card: expect.objectContaining({
					header: expect.objectContaining({ template: "red" }),
				}),
			}),
			expect.anything(),
		);
	});

	// Note: Testing retries with exact delays is flaky without complex timer mocks.
	// We confirm that if axios fails consistently, it throws eventually and logs errors.
	test("should fail if all retries fail", async () => {
		(axios.post as jest.Mock).mockRejectedValue(new Error("Network Error"));
		const SINGLE_TOKEN = ["token-1"];

		// We can inspect the error handling
		await expect(larkService.info("fail test", SINGLE_TOKEN)).rejects.toThrow(
			"Failed to send message(s) to Lark",
		);

		// It should have tried multiple times (3 times default)
		expect(axios.post).toHaveBeenCalledTimes(3);
	}, 10000); // increase timeout

	test("should throw error if Lark API returns non-zero code", async () => {
		(axios.post as jest.Mock).mockResolvedValue({
			status: 200,
			data: { code: 1, msg: "Lark specific error" },
		});

		await expect(larkService.warn("test", ["token"])).rejects.toThrow(
			"Lark specific error",
		);
	});

	test("should throw default error if Lark API returns error without msg", async () => {
		(axios.post as jest.Mock).mockResolvedValue({
			status: 200,
			data: { code: 111 }, // No msg
		});

		await expect(larkService.warn("test", ["token"])).rejects.toThrow(
			"Lark API error: 111",
		);
	});
});
