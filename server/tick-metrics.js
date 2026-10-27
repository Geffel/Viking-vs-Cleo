function percentile(sorted, fraction) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

/** Bounded tick-duration recorder used by both the live loop and benchmarks. */
export class TickMetrics {
  constructor({ sampleLimit = 120_000 } = {}) {
    this.sampleLimit = Math.max(1, Math.floor(sampleLimit));
    this.samples = [];
    this.total = 0;
    this.max = 0;
  }

  record(durationMs) {
    const value = Math.max(0, Number(durationMs) || 0);
    this.total++;
    this.max = Math.max(this.max, value);
    if (this.samples.length < this.sampleLimit) this.samples.push(value);
    else this.samples[(this.total - 1) % this.sampleLimit] = value;
  }

  snapshot() {
    const sorted = [...this.samples].sort((a, b) => a - b);
    const sum = sorted.reduce((total, value) => total + value, 0);
    return {
      ticks: this.total,
      sampledTicks: sorted.length,
      meanMs: sorted.length ? sum / sorted.length : 0,
      p95Ms: percentile(sorted, 0.95),
      p99Ms: percentile(sorted, 0.99),
      maxMs: this.max,
    };
  }
}
