import 'server-only';
import { domainError } from '../../domain/errors';
import { Logger } from '../observability/Logger';
import { metrics } from '../observability/Metrics';
import { OperationStore, StoredOperation } from '../../ports/OperationStore';
import { SignerPort } from '../../ports/SignerPort';
import { StellarGateway } from '../../ports/StellarGateway';

/**
 * Outbox worker that consumes `OperationStore.claimBatch` and drives the
 * two-phase chain gateway. It never re-sends blind: `claimBatch` is the only
 * source of work and the store owns the locking.
 *
 * - `awaiting_signature` → signer produces payload → gateway.submitSigned.
 * - `submitted`/`confirming`/`unknown`/`restoring`/`failed_retryable` → reconcile.
 */
export class StellarWorker {
  private running = false;
  private log = new Logger('StellarWorker');

  constructor(
    private readonly store: OperationStore,
    private readonly gateway: StellarGateway,
    private readonly signer: SignerPort | null,
    private readonly options: {
      batchSize: number;
      workerId: string;
      claimTtlSeconds: number;
      /** Backoff between polls when no work available. */
      pollIntervalMs: number;
      maxAttempts: number;
    }
  ) {}

  async runOneBatch(): Promise<number> {
    const batch = await this.store.claimBatch({
      batchSize: this.options.batchSize,
      workerId: this.options.workerId,
      ttlSeconds: this.options.claimTtlSeconds,
    });

    for (const op of batch) {
      await this.process(op).catch(async (error: unknown) => {
        // Any unexpected error releases the claim by updating the record.
        // The state machine still governs retriability.
        const record = await this.store.get(op.state.operationId);
        if (record) {
          record.state.errorCode = error instanceof Error ? error.message : 'WORKER_ERROR';
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
      case 'awaiting_signature':
        metrics.increment('stellar.worker.signature');
        if (!this.signer) {
          throw domainError('UNAUTHORIZED', `worker ${this.options.workerId} has no signer for ${id}`);
        }
        if (!op.intent.prepared) {
          throw domainError('INVALID_STATE_TRANSITION', `operation ${id} is missing prepared payload`);
        }
        const signed = await this.signer.sign(op.intent.prepared);
        await this.gateway.submitSigned(id, signed.signedXdr, signed.signerAddress);
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
