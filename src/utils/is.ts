export const isDebugMode = () => {
	return !!globalThis?.startParams?.debug;
};

/**
 * Check if the current environment is running via ts-node
 */
export const isTsNode = () => !!(process as any)[Symbol.for("ts-node.register.instance")];