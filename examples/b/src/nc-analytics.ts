// Non-critical analytics module: heavy-ish computation and logging, loaded on demand
export function initAnalytics(data: number[]): void {
  try {
    // Simulate a CPU-bound task (safe scale)
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * (i + 1);
    }
    const avg = data.length ? sum / data.length : 0;

    // Simple trend detection
    const diffs = data.slice(1).map((v, i) => v - data[i]);
    const positive = diffs.filter((d) => d > 0).length;
    const negative = diffs.filter((d) => d < 0).length;

    // Log only, no UI mutation
    console.debug('[nc-analytics] initialized', { avg, positive, negative, len: data.length });
  } catch (err) {
    console.debug('[nc-analytics] failed to initialize', err);
  }
}