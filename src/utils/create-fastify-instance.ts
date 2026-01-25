import crypto from "node:crypto";
import path from "node:path";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import {
	serializerCompiler,
	validatorCompiler,
} from "fastify-type-provider-zod";
import type pino from "pino";
import alertPlugin from "../plugins/alert";
import configPlugin from "../plugins/config";
import monitorPlugin from "../plugins/monitor";
import { isDebugMode } from "./is";
import { traceStorage } from "./trace-context";

const TRACE_ID_HEADER = "x-trace-id";

/**
 * Formats time to yyyyMMddHHmmss
 */
const formatDateTime = (date: Date): string => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	const seconds = String(date.getSeconds()).padStart(2, "0");
	return `${year}${month}${day}${hours}${minutes}${seconds}`;
};

/**
 * Generates a unique traceId
 */
const generateTraceId = (): string => {
	const dateTime = formatDateTime(new Date());
	const random = crypto.randomBytes(4).toString("hex");
	return `${dateTime}${random}`;
};

// Extend FastifyRequest type
declare module "fastify" {
	interface FastifyRequest {
		traceId: string;
	}
}

export default async function createFastifyInstance() {
	const logTargets: pino.TransportTargetOptions[] = [
		{
			target: "pino-pretty",
			options: {
				translateTime: "HH:MM:ss Z",
				ignore: "pid,hostname",
				colorize: true,
			},
		},
	];

	logTargets.push({
		target: "pino-roll",
		options: {
			// Path to save log files
			file: path.join("logs", "app.log"),
			// Rotation frequency: 'daily', 'hourly', or millisecond value
			frequency: "daily",
			// Or rotate by size (e.g., 10MB)
			// size: '1m',
			mkdir: true,
			// Maximum number of log files to retain
			limit: {
				count: 100,
			},
		},
	});

	// 3. Initialize Fastify
	const fastify = Fastify({
		logger: {
			level: isDebugMode() ? "debug" : "info",
			transport: {
				targets: logTargets,
			},
		},
		genReqId: (req) => {
			// Prioritize traceId from headers (supports distributed tracing)
			const incomingTraceId = req.headers[TRACE_ID_HEADER] as
				| string
				| undefined;
			return incomingTraceId || generateTraceId();
		},
		requestIdLogLabel: "traceId",
		requestIdHeader: TRACE_ID_HEADER,
	});

	// Register core plugins
	await fastify.register(sensible);

	// Set up Zod validation
	fastify.setValidatorCompiler(validatorCompiler);
	fastify.setSerializerCompiler(serializerCompiler);

	// Register custom plugins
	await fastify.register(monitorPlugin);
	await fastify.register(alertPlugin);
	await fastify.register(configPlugin);

	// traceId related hooks
	fastify.addHook("onRequest", async (request, _reply) => {
		// Map request.id to request.traceId for convenience in business code
		request.traceId = request.id;

		// Store traceId and logger in AsyncLocalStorage
		// This allows business code to get a logger with traceId via getLogger()
		traceStorage.enterWith({
			traceId: request.traceId,
			logger: request.log,
		});
	});

	fastify.addHook("onSend", async (request, reply) => {
		// Return trace id in response headers
		reply.header(TRACE_ID_HEADER, request.traceId);
	});

	fastify.log.info("TraceId configured");

	// Global Error Handler Stub for Alerting
	fastify.setErrorHandler((error, _request, reply) => {
		fastify.log.error(error, `[GLOBAL]: Request failed: ${error.message}`);
		let code = error?.statusCode || 500;
		// Manually set status code
		if (reply.statusCode !== 200) {
			code = reply.statusCode;
		}
		// Here we would send alerts to Sentry/PagerDuty etc.
		reply.send(error);
		// Non-debug mode and status code >= 500
		if (!isDebugMode() && code >= 500) {
			fastify.alert(
				JSON.stringify({
					name: error.name,
					message: error.message,
					stack: error.stack,
				}),
			);
		}
	});

	return fastify;
}
