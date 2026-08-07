/**
 * N0VA1O Metrics Collection — counters, histograms, and gauges for
 * operational visibility. In-memory aggregation with snapshot export.
 */

export interface Counter {
  name: string;
  value: number;
  labels: Record<string, string>;
}

export interface Histogram {
  name: string;
  count: number;
  sum: number;
  buckets: { le: number; count: number }[];
}

export interface Gauge {
  name: string;
  value: number;
}

export interface MetricsSnapshot {
  counters: Counter[];
  histograms: Histogram[];
  gauges: Gauge[];
  timestamp: string;
}

/**
 * In-memory metrics registry. Pure operations over internal state.
 */
export class MetricsRegistry {
  private counters: Map<string, Counter> = new Map();
  private histograms: Map<string, { name: string; values: number[]; buckets: number[] }> = new Map();
  private gauges: Map<string, Gauge> = new Map();

  /** Increment a counter. */
  incrementCounter(name: string, labels: Record<string, string> = {}, value: number = 1): void {
    const key = this.key(name, labels);
    const existing = this.counters.get(key);
    this.counters.set(key, { name, value: (existing?.value ?? 0) + value, labels });
  }

  /** Record a histogram observation. */
  recordHistogram(name: string, value: number, buckets: number[] = [50, 100, 500, 1000, 5000]): void {
    const existing = this.histograms.get(name);
    if (existing) {
      existing.values.push(value);
    } else {
      this.histograms.set(name, { name, values: [value], buckets });
    }
  }

  /** Set a gauge value. */
  setGauge(name: string, value: number): void {
    this.gauges.set(name, { name, value });
  }

  /** Export a snapshot of all metrics. Pure read. */
  snapshot(): MetricsSnapshot {
    const histograms: Histogram[] = [];
    for (const hist of this.histograms.values()) {
      const sorted = [...hist.values].sort((a, b) => a - b);
      const buckets = hist.buckets.map((le) => ({ le, count: sorted.filter((v) => v <= le).length }));
      histograms.push({ name: hist.name, count: sorted.length, sum: sorted.reduce((s, v) => s + v, 0), buckets });
    }
    return { counters: [...this.counters.values()], histograms, gauges: [...this.gauges.values()], timestamp: new Date().toISOString() };
  }

  private key(name: string, labels: Record<string, string>): string {
    return `${name}:${JSON.stringify(labels)}`;
  }
}
