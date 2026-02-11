declare global {
	var config: import("./src/config/type").Config;
	var startParams: import("./src/start").StartParams;

	interface LargestContentfulPaint extends PerformanceEntry {
		renderTime: number;
		loadTime: number;
		size: number;
		id: string;
		url: string;
		element?: Element;
	}

	interface PerformanceObserverEntryList {
		getEntries(): PerformanceEntryList;
		getEntriesByName(name: string, type?: string): PerformanceEntryList;
		getEntriesByType(type: string): PerformanceEntryList;
	}

	type PerformanceEntryList = PerformanceEntry[];
}

export {};
