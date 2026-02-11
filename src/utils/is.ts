export const isDebugMode = () => {
	return !!globalThis?.startParams?.debug;
};

/**
 * Check if the current environment is running via ts-node
 */
export const isTsNode = () => {
	const tsNodeInstance = (
		process as NodeJS.Process & { [key: symbol]: unknown }
	)[Symbol.for("ts-node.register.instance")];
	return !!tsNodeInstance;
};
