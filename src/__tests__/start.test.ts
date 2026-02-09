import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { Config } from "@/config/type";
import createFastifyInstance from "@/utils/create-fastify-instance";
import { start } from "../start";
import * as isModule from "@/utils/is";
import * as childProcess from "child_process";

jest.mock("@/utils/create-fastify-instance", () => ({
	__esModule: true,
	default: jest.fn(),
}));

jest.mock("@/utils/is", () => ({
	__esModule: true,
	isDebugMode: jest.fn().mockImplementation(() => {
		return !!(globalThis as any).startParams?.debug;
	}),
	isTsNode: jest.fn(),
}));

jest.mock("child_process", () => ({
	__esModule: true,
	exec: jest.fn(),
}));

describe("Start Function", () => {
	let originalExit: (code?: number) => never;
	let originalProcessOn: NodeJS.Process["on"];
	let mockFastify: Omit<Partial<FastifyInstance>, "config"> & {
		alert: jest.Mock;
		config: Partial<Config>;
	};

	beforeEach(() => {
		jest.clearAllMocks();

		(childProcess.exec as unknown as jest.Mock).mockImplementation((_cmd, callback) => {
			if (callback) callback(null, "", "");
		});

		mockFastify = {
			listen: jest.fn().mockResolvedValue("http://localhost:3000"),
			register: jest.fn().mockReturnThis(),
			ready: jest.fn().mockResolvedValue(undefined),
			close: jest.fn().mockResolvedValue(undefined),
			log: {
				info: jest.fn(),
				error: jest.fn(),
				debug: jest.fn(),
				warn: jest.fn(),
				fatal: jest.fn(),
				trace: jest.fn(),
				silent: jest.fn(),
				child: jest.fn(),
			} as unknown as FastifyBaseLogger,
			alert: jest.fn(),
			config: { port: 3000 },
		} as unknown as Omit<Partial<FastifyInstance>, "config"> & {
			alert: jest.Mock;
			config: Partial<Config>;
		};

		(createFastifyInstance as jest.Mock).mockResolvedValue(mockFastify);

		originalExit = process.exit;
		process.exit = jest.fn() as unknown as (code?: number) => never;
		originalProcessOn = process.on;
		process.on = jest.fn() as unknown as NodeJS.Process["on"];
	});

	afterEach(() => {
		process.exit = originalExit;
		process.on = originalProcessOn;
		delete (globalThis as unknown as { startParams?: unknown }).startParams;
	});

	test("should start server successfully", async () => {
		await start({ debug: false });
		expect(mockFastify.listen).toHaveBeenCalledWith(
			expect.objectContaining({ port: 3000 }),
		);
	});

	test("should use default port 3000 if config.port is missing", async () => {
		mockFastify.config = {}; // Port is undefined
		await start({ debug: false });
		expect(mockFastify.listen).toHaveBeenCalledWith(
			expect.objectContaining({ port: 3000 }),
		);
	});

	test("should handle listen failure", async () => {
		(mockFastify.listen as jest.Mock).mockRejectedValue(
			new Error("Listen fail"),
		);

		await start({ debug: false });
		expect(process.exit).toHaveBeenCalledWith(1);
	});

	test("should handle SIGTERM", async () => {
		let sigtermHandler: (() => void) | undefined;
		(process.on as jest.Mock).mockImplementation((event, handler) => {
			if (event === "SIGTERM") sigtermHandler = handler;
		});

		await start({ debug: false });

		if (sigtermHandler) {
			await sigtermHandler();
			expect(mockFastify.close).toHaveBeenCalled();
			expect(process.exit).toHaveBeenCalledWith(0);
		}
	});

	test("should handle SIGTERM failure", async () => {
		let sigtermHandler: (() => void) | undefined;
		(process.on as jest.Mock).mockImplementation((event, handler) => {
			if (event === "SIGTERM") sigtermHandler = handler;
		});

		await start({ debug: false });

		if (sigtermHandler) {
			(mockFastify.close as jest.Mock).mockRejectedValueOnce(
				new Error("Close fail"),
			);
			await sigtermHandler();
			expect(process.exit).toHaveBeenCalledWith(1);
		}
	});

	test("should handle unhandledRejection (non-debug)", async () => {
		let rejectionHandler:
			| ((reason: unknown, promise: Promise<unknown>) => void)
			| undefined;
		(process.on as jest.Mock).mockImplementation((event, handler) => {
			if (event === "unhandledRejection") rejectionHandler = handler;
		});

		await start({ debug: false });

		if (rejectionHandler) {
			rejectionHandler("boom", Promise.resolve());
			expect(mockFastify.alert).toHaveBeenCalledWith(
				expect.stringContaining("Unhandled Rejection"),
			);
		}
	});

	test("should handle unhandledRejection (debug)", async () => {
		let rejectionHandler:
			| ((reason: unknown, promise: Promise<unknown>) => void)
			| undefined;
		(process.on as jest.Mock).mockImplementation((event, handler) => {
			if (event === "unhandledRejection") rejectionHandler = handler;
		});

		await start({ debug: true });

		if (rejectionHandler) {
			rejectionHandler("boom", Promise.resolve());
			expect(mockFastify.alert).not.toHaveBeenCalled();
		}
	});

	test("should handle uncaughtException (non-debug)", async () => {
		let exceptionHandler: ((error: Error) => void) | undefined;
		(process.on as jest.Mock).mockImplementation((event, handler) => {
			if (event === "uncaughtException") exceptionHandler = handler;
		});

		await start({ debug: false });

		if (exceptionHandler) {
			exceptionHandler(new Error("fatal"));
			expect(mockFastify.alert).toHaveBeenCalledWith(
				expect.stringContaining("Uncaught Exception"),
			);
		}
	});

	test("should handle uncaughtException (debug)", async () => {
		let exceptionHandler: ((error: Error) => void) | undefined;
		(process.on as jest.Mock).mockImplementation((event, handler) => {
			if (event === "uncaughtException") exceptionHandler = handler;
		});

		await start({ debug: true });

		if (exceptionHandler) {
			exceptionHandler(new Error("fatal"));
			expect(mockFastify.alert).not.toHaveBeenCalled();
		}
	});

	test("should kill process on port 3000 in debug mode and handle failure", async () => {
		(childProcess.exec as unknown as jest.Mock).mockImplementation((_cmd, callback) => {
			if (callback) callback(new Error("kill fail"), "", "");
		});
		
		const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

		await start({ debug: true });

		expect(childProcess.exec).toHaveBeenCalledWith(
			expect.stringContaining("kill -9"),
			expect.any(Function)
		);
		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringContaining("Failed to kill process on port 3000:"),
			expect.any(Error)
		);
		
		consoleSpy.mockRestore();
	});

	test("should kill process on port 3000 in debug mode successfully", async () => {
		(childProcess.exec as unknown as jest.Mock).mockImplementation((_cmd, callback) => {
			if (callback) callback(null, "", "");
		});
		
		await start({ debug: true });

		expect(childProcess.exec).toHaveBeenCalledWith(
			expect.stringContaining("kill -9"),
			expect.any(Function)
		);
	});
});
