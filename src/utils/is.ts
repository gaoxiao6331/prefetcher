export const isDebugMode = () => {
	return !!globalThis?.startParams?.debug;
};
