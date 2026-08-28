import 'server-only';
import { domainError } from '../../domain/errors';
import { Logger } from '../observability/Logger';
import { metrics } from '../observability/Metrics';
import { OperationStore, StoredOperation } from '../../ports/OperationStore';
import { StellarGateway } from '../../ports/StellarGateway';

/**
 * Outbox worker that consumes `OperationStore.claimBatch` and drives the
 * two-phase chain gateway. It never re-sends blind: `claimBatch` is the only
 * source of work and the store owns the locking.
 *
 * The worker does NOT sign. Client-side signers produce the payload and the
 * relay endpoint persists it in the `signed` phase. The worker only:
 * - resubmits `signed` payloads after a crash,
 * - reconciles `submitted`/`confirming`/`unknown`/`restoring`/`failed_retryable`.
 */
export class StellarWorker {
  private running = false;
  private log = new Logger('StellarWorker');

  constructor(
    private readonly store: OperationStore,
    private readonly gateway: StellarGateway,
    private readonly options: {
      batchSize: number;
      workerId: string;
      claimTtlSeconds: number;
      /** Backoff between polls when no work available. */
      pollIntervalMs: number;
      maxAttempts: number;
      /** Optional heartbeat callback invoked after each batch. */
      onHeartbeat?: () => void;
    }
  ) {}

  async runOneBatch(): Promise<number> {
    const batch = await this.store.claimBatch({
      batchSize: this.options.batchSize,
      workerId: this.options.workerId,
      ttlSeconds: this.options.claimTtlSeconds,
      maxAttempts: this.options.maxAttempts,
    });

    for (const op of batch) {
      await this.process(op).catch(async (error: unknown) => {
        const record = await this.store.get(op.state.operationId);
        if (!record) return;
        const errorCode = (error instanceof Error ? error.message : 'WORKER_ERROR').slice(0, 128);
        // submitSigned already schedules a resubmit while keeping the signed
        // payload; do not overwrite it.
        if (record.state.phase === 'signed' && record.nextRetryAt && record.nextRetryAt > new Date()) {
          record.state.errorCode = errorCode;
          await this.store.save(record).catch(() => undefined);
          return;
        }
        const terminal = record.state.phase === 'confirmed' || record.state.phase === 'failed_terminal';
        if (!terminal) {
          record.attemptCount = (record.attemptCount ?? 0) + 1;
          if (record.attemptCount > this.options.maxAttempts) {
            record.state.errorCode = 'MAX_ATTEMPTS_EXCEEDED';
            record.state.phase = 'failed_terminal';
          } else {
            record.state.errorCode = errorCode;
            record.state.phase = 'failed_retryable';
            record.nextRetryAt = new Date(Date.now() + this.backoffMs(record.attemptCount ?? 1));
          }
          await this.store.save(record).catch(() => undefined);
        }
      });
    }

    return batch.length;
  }

  async runLoop(signal: AbortSignal): Promise<void> {
    this.running = true;
    while (!signal.aborted && this.running) {
      const processed = await this.runOneBatch();
      this.options.onHeartbeat?.();
      if (processed === 0) {
        await this.sleep(this.options.pollIntervalMs, signal);
      }
    }
  }

  stop(): void {
    this.running = false;
  }

  private async process(op: StoredOperation): Promise<void> {
    const id = op.state.operationId;
    this.log.info('worker_processing', {
      operationId: id,
      phase: op.state.phase,
      workerId: this.options.workerId,
    });
    switch (op.state.phase) {
      case 'signed':
        metrics.increment('stellar.worker.resubmit');
        if (!op.intent.signed) {
          throw domainError('INVALID_STATE_TRANSITION', `operation ${id} is signed but has no payload`);
        }
        await this.gateway.submitSigned(id, op.intent.signed.signedXdr, op.intent.signed.signerAddress);
        return;
      case 'submitted':
      case 'confirming':
      case 'unknown':
      case 'restoring':
      case 'failed_retryable':
        metrics.increment('stellar.worker.reconcile');
        await this.gateway.reconcile(id);
        return;
      default:
        return;
    }
  }

  private backoffMs(attempt: number): number {
    const base = 2_000;
    const max = 60_000;
    return Math.min(base * 2 ** attempt, max);
  }

  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) return resolve();
      const timer = setTimeout(resolve, ms);
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}
