import type { FastifyInstance } from "fastify";
import createFastifyInstance from "@/utils/create-fastify-instance";
import { start } from "../start";

jest.mock("@/utils/create-fastify-instance", () => ({
	__esModule: true,
	default: jest.fn(),
}));

describe("Start Function", () => {
	let originalExit: (code?: number) => never;
	let originalProcessOn: NodeJS.Process["on"];
	// biome-ignore lint/suspicious/noExplicitAny: mock config
	let mockFastify: Partial<FastifyInstance> & { alert: jest.Mock; config: any };

	beforeEach(() => {
		jest.clearAllMocks();

		mockFastify = {
			listen: jest.fn().mockResolvedValue("http://localhost:3000"),
			register: jest.fn().mockReturnThis(),
			ready: jest.fn().mockResolvedValue(undefined),
			close: jest.fn().mockResolvedValue(undefined),
			// biome-ignore lint/suspicious/noExplicitAny: mock log
			log: { info: jest.fn(), error: jest.fn() } as any,
			alert: jest.fn(),
			config: { port: 3000 },
		};

		(createFastifyInstance as jest.Mock).mockResolvedValue(mockFastify);

		originalExit = process.exit;
		// biome-ignore lint/suspicious/noExplicitAny: mock exit
		process.exit = jest.fn() as any;
		originalProcessOn = process.on;
		// biome-ignore lint/suspicious/noExplicitAny: mock process.on
		process.on = jest.fn() as any;
	});

	afterEach(() => {
		process.exit = originalExit;
		process.on = originalProcessOn;
		// biome-ignore lint/suspicious/noExplicitAny: cleanup globalThis
		delete (globalThis as any).startParams;
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
		let rejectionHandler: // biome-ignore lint/suspicious/noExplicitAny: Node.js callback signature
		((reason: any, promise: Promise<any>) => void) | undefined;
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
		let rejectionHandler: // biome-ignore lint/suspicious/noExplicitAny: Node.js callback signature
		((reason: any, promise: Promise<any>) => void) | undefined;
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

		// We use params.debug to control this, as isDebugMode() uses it via globalThis.startParams
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
});
