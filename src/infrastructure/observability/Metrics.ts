import 'server-only';

type MetricValue = { count: number; last: number; lastAt: Date | null };

/** In-memory metrics registry. For production, push to Prometheus/OpenTelemetry. */
export class Metrics {
  private counters = new Map<string, MetricValue>();
  private gauges = new Map<string, number>();

  increment(name: string, value = 1): void {
    const current = this.counters.get(name) ?? { count: 0, last: 0, lastAt: null };
    current.count += value;
    current.last = value;
    current.lastAt = new Date();
    this.counters.set(name, current);
  }

  gauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  snapshot(): Record<string, unknown> {
    const counters: Record<string, MetricValue> = {};
    for (const [k, v] of this.counters) counters[k] = v;
    const gauges: Record<string, number> = {};
    for (const [k, v] of this.gauges) gauges[k] = v;
    return { counters, gauges, at: new Date().toISOString() };
  }
}

export const metrics = new Metrics();
