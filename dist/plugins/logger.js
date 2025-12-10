"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_plugin_1 = __importDefault(require("fastify-plugin"));
const loggerPlugin = async (fastify, opts) => {
    // fastify already has a built-in logger, but we can customize it or add hooks here if needed.
    // The effective logger configuration happens at the Fastify instance creation level in index.ts.
    fastify.decorate('log', fastify.log);
    fastify.log.info('Logger plugin registered');
};
exports.default = (0, fastify_plugin_1.default)(loggerPlugin);
