import 'server-only';
import { getPublicConfig } from '../config/env';
import { Logger } from '../observability/Logger';
import { StellarWorker } from './StellarWorker';
import { createStellarGateway } from './createStellarGateway';

function parsePositiveInt(raw: string | undefined, name: string, defaultValue: number): number {
  const value = raw === undefined || raw === '' ? defaultValue : Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${name}: "${raw}" must be a positive integer`);
  }
  return value;
}

/**
 * Singleton manager that owns the StellarWorker runtime process.
 *
 * It is started once from `src/instrumentation.ts` when the Next.js server
 * boots, and stopped on `SIGTERM`/`SIGINT` for graceful shutdown.
 *
 * The worker is disabled by default in `demo` unless `STELLAR_WORKER_ENABLED`
 * is explicitly `true`, and can be disabled in any environment by setting it
 * to `false`.
 */
export interface WorkerHealth {
  started: boolean;
  startedAt: number | null;
  lastHeartbeat: number | null;
}

class StellarWorkerManager {
  private worker: StellarWorker | null = null;
  private controller: AbortController | null = null;
  private log = new Logger('StellarWorkerManager');
  private started = false;
  private startedAt: number | null = null;
  private lastHeartbeat: number | null = null;

  start(): void {
    if (this.started) {
      this.log.info('worker_already_started');
      return;
    }

    const { environment } = getPublicConfig();
    const enabled = process.env.STELLAR_WORKER_ENABLED;

    if (enabled === 'false') {
      this.log.info('worker_disabled_by_env');
      return;
    }

    if (environment === 'demo' && enabled !== 'true') {
      this.log.info('worker_disabled_demo');
      return;
    }

    try {
      const batchSize = parsePositiveInt(
        process.env.STELLAR_WORKER_BATCH_SIZE,
        'STELLAR_WORKER_BATCH_SIZE',
        5
      );
      const pollIntervalMs = parsePositiveInt(
        process.env.STELLAR_WORKER_POLL_INTERVAL_MS,
        'STELLAR_WORKER_POLL_INTERVAL_MS',
        5000
      );
      const claimTtlSeconds = parsePositiveInt(
        process.env.STELLAR_WORKER_CLAIM_TTL_SECONDS,
        'STELLAR_WORKER_CLAIM_TTL_SECONDS',
        60
      );
      const maxAttempts = parsePositiveInt(
        process.env.STELLAR_WORKER_MAX_ATTEMPTS,
        'STELLAR_WORKER_MAX_ATTEMPTS',
        10
      );
      const workerId = process.env.HOSTNAME || `worker-${Date.now()}`;

      const { gateway, store } = createStellarGateway();
      this.worker = new StellarWorker(store, gateway, {
        batchSize,
        workerId,
        claimTtlSeconds,
        pollIntervalMs,
        maxAttempts,
        onHeartbeat: () => this.onHeartbeat(),
      });
      this.controller = new AbortController();
      this.started = true;
      this.startedAt = Date.now();
      this.lastHeartbeat = this.startedAt;

      this.log.info('worker_starting', {
        workerId,
        environment,
        batchSize,
        pollIntervalMs,
        claimTtlSeconds,
      });

      this.worker
        .runLoop(this.controller.signal)
        .catch((error: unknown) => {
          this.log.error('worker_loop_failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        });

      this.attachShutdownHandlers();
    } catch (error) {
      this.log.error('worker_start_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.started = false;
      this.startedAt = null;
      this.lastHeartbeat = null;
      this.worker = null;
      this.controller = null;
    }
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.startedAt = null;
    this.lastHeartbeat = null;
    this.log.info('worker_stopping');
    this.worker?.stop();
    this.controller?.abort();
    this.worker = null;
    this.controller = null;
  }

  getHealth(): WorkerHealth {
    return {
      started: this.started,
      startedAt: this.startedAt,
      lastHeartbeat: this.lastHeartbeat,
    };
  }

  private onHeartbeat(): void {
    this.lastHeartbeat = Date.now();
  }

  private attachShutdownHandlers(): void {
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      process.once(signal, () => {
        this.log.info('worker_shutdown_signal', { signal });
        this.stop();
      });
    }
  }
}

export const stellarWorkerManager = new StellarWorkerManager();
