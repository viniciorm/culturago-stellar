import 'server-only';
import {
  Account,
  Contract,
  Operation,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import { domainError } from '../../domain/errors';
import {
  ContractArgValue,
  ContractCallSpec,
  SimulationOutcome,
  SorobanTransport,
  TransactionStatusResult,
} from '../../ports/SorobanTransport';
import { StellarNetworkConfig } from './networkConfig';

/**
 * Real Soroban RPC transport over @stellar/stellar-sdk. Builds the
 * transaction, simulates, assembles (prepareTransaction handles footprint
 * and restore detection) and polls. NEVER signs: signing belongs to
 * SignerPort implementations.
 */
export class SdkSorobanTransport implements SorobanTransport {
  private readonly server: rpc.Server;

  constructor(private readonly config: StellarNetworkConfig) {
    this.server = new rpc.Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith('http://') });
  }

  async simulate(spec: ContractCallSpec): Promise<SimulationOutcome> {
    const tx = await this.buildTransaction(spec);
    let sim: rpc.Api.SimulateTransactionResponse;
    try {
      sim = await this.server.simulateTransaction(tx);
    } catch (error) {
      throw domainError('INVALID_INPUT', `RPC simulation request failed: ${this.sanitize(error)}`);
    }

    const latestLedger = (sim as rpc.Api.BaseSimulateTransactionResponse).latestLedger ?? 0;
    if (rpc.Api.isSimulationError(sim)) {
      return {
        needsRestore: false,
        preparedXdr: '',
        latestLedger,
        contractError: this.mapSimulationError(sim.error),
      };
    }
    if (rpc.Api.isSimulationRestore(sim)) {
      const restoreXdr = await this.buildRestoreXdr(spec, sim);
      return {
        needsRestore: true,
        preparedXdr: restoreXdr,
        latestLedger,
        contractError: null,
      };
    }
    if (!rpc.Api.isSimulationSuccess(sim)) {
      return {
        needsRestore: false,
        preparedXdr: '',
        latestLedger,
        contractError: 'UNKNOWN_SIMULATION_STATE',
      };
    }

    const prepared = await this.server.prepareTransaction(tx);
    return {
      needsRestore: false,
      preparedXdr: prepared.toXDR(),
      latestLedger: sim.latestLedger ?? 0,
      contractError: null,
    };
  }

  async submit(signedXdr: string): Promise<{ txHash: string }> {
    const tx = TransactionBuilder.fromXDR(signedXdr, this.config.networkPassphrase);
    let response: rpc.Api.SendTransactionResponse;
    try {
      response = await this.server.sendTransaction(tx);
    } catch (error) {
      throw domainError('INVALID_INPUT', `RPC submit request failed: ${this.sanitize(error)}`);
    }
    if (response.status === 'ERROR') {
      throw domainError(
        'INVALID_STATE_TRANSITION',
        `transaction rejected by the network: ${this.sanitize(response.errorResult)}`
      );
    }
    // A hash is NOT a confirmation.
    return { txHash: response.hash };
  }

  async pollTransaction(txHash: string): Promise<TransactionStatusResult> {
    const maxAttempts = 30;
    const delayMs = 1000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let response: rpc.Api.GetTransactionResponse;
      try {
        response = await this.server.getTransaction(txHash);
      } catch (error) {
        throw domainError('INVALID_INPUT', `RPC poll request failed: ${this.sanitize(error)}`);
      }

      switch (response.status) {
        case 'SUCCESS':
          return { status: 'SUCCESS', ledger: response.ledger };
        case 'FAILED':
          return {
            status: 'FAILED',
            contractError: this.mapTransactionError(response),
            diagnosticEventsXdr: response.diagnosticEventsXdr?.map((d) =>
              d.toXDR('base64')
            ),
            resultXdr: response.resultXdr?.toXDR('base64'),
          };
      }

      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return { status: 'PENDING' };
  }

  async readback(spec: ContractCallSpec): Promise<unknown> {
    const tx = await this.buildTransaction(spec);
    const sim = await this.server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
      return null;
    }
    return scValToNative(sim.result.retval);
  }

  async enforcingSimulateAndAssemble(signedXdr: string): Promise<SimulationOutcome> {
    const tx = TransactionBuilder.fromXDR(signedXdr, this.config.networkPassphrase);
    let sim: rpc.Api.SimulateTransactionResponse;
    try {
      sim = await this.server.simulateTransaction(
        tx,
        { cpuInstructions: 5_000_000 },
        'enforce' as any
      );
    } catch (error) {
      throw domainError('INVALID_INPUT', `enforcing simulation request failed: ${this.sanitize(error)}`);
    }

    const latestLedger = (sim as rpc.Api.BaseSimulateTransactionResponse).latestLedger ?? 0;

    if (rpc.Api.isSimulationError(sim)) {
      // During debugging, keep the raw RPC error so we can see __check_auth
      // failures, resource limits and auth context mismatches.
      console.error('[enforcingSimulateAndAssemble] simulation error:', sim.error);
      return {
        needsRestore: false,
        preparedXdr: '',
        latestLedger,
        contractError: sim.error,
      };
    }
    if (rpc.Api.isSimulationRestore(sim)) {
      return {
        needsRestore: true,
        preparedXdr: '',
        latestLedger,
        contractError: 'RESTORE_REQUIRED',
      };
    }
    if (!rpc.Api.isSimulationSuccess(sim)) {
      return {
        needsRestore: false,
        preparedXdr: '',
        latestLedger,
        contractError: 'UNKNOWN_SIMULATION_STATE',
      };
    }

    const assembled = rpc.assembleTransaction(tx, sim);
    return {
      needsRestore: false,
      preparedXdr: assembled.build().toXDR(),
      latestLedger,
      contractError: null,
    };
  }

  async verifySignedMatches(unsignedXdr: string, signedXdr: string): Promise<boolean> {
    try {
      const unsigned = TransactionBuilder.fromXDR(unsignedXdr, this.config.networkPassphrase);
      const signed = TransactionBuilder.fromXDR(signedXdr, this.config.networkPassphrase);
      if (!(unsigned instanceof Transaction) || !(signed instanceof Transaction)) return false;
      // The Stellar transaction hash excludes signatures: equal hashes prove
      // the signed envelope carries exactly the prepared transaction.
      return unsigned.hash().equals(signed.hash());
    } catch {
      return false;
    }
  }

  // ---------- internals ----------

  private async buildRestoreXdr(
    spec: ContractCallSpec,
    sim: rpc.Api.SimulateTransactionResponse
  ): Promise<string> {
    const source = spec.feePayerAddress ?? spec.actorAddress;
    const account: Account = await this.server
      .getAccount(source)
      .catch((error: unknown) => {
        throw domainError('NOT_FOUND', `fee payer account not found on-chain: ${this.sanitize(error)}`);
      });

    const raw = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(Operation.restoreFootprint({}))
      .setTimeout(180)
      .build();

    const assembled = rpc.assembleTransaction(raw, sim);
    return assembled.build().toXDR();
  }

  private async buildTransaction(spec: ContractCallSpec): Promise<Transaction> {
    // The fee payer pays fees; auth entries carry the actor's authorization.
    // For smart wallets the actor is a contract (C...) and the fee payer is a
    // funded G account supplied separately.
    const source = spec.feePayerAddress ?? spec.actorAddress;
    const account: Account = await this.server
      .getAccount(source)
      .catch((error: unknown) => {
        throw domainError('NOT_FOUND', `fee payer account not found on-chain: ${this.sanitize(error)}`);
      });
    const contract = new Contract(spec.contractId);
    const args = spec.args.map((a) => this.toScVal(a));
    const operation = contract.call(spec.method, ...args);

    return new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(180)
      .build();
  }

  private toScVal(arg: ContractArgValue): xdr.ScVal {
    switch (arg.kind) {
      case 'address':
        return nativeToScVal(arg.address, { type: 'address' });
      case 'bytes32':
        return xdr.ScVal.scvBytes(Buffer.from(arg.hex, 'hex'));
      case 'optional_bytes32':
        // Soroban Option<T>: None = void, Some(v) = the plain value.
        return arg.hex == null
          ? xdr.ScVal.scvVoid()
          : xdr.ScVal.scvBytes(Buffer.from(arg.hex, 'hex'));
      case 'u32':
        return nativeToScVal(arg.value, { type: 'u32' });
      case 'u64':
        return nativeToScVal(BigInt(arg.value), { type: 'u64' });
    }
  }

  private mapSimulationError(error: string): string {
    // Contract errors carry their numeric code; map known domain codes.
    const known: Record<string, string> = {
      '#1': 'UNAUTHORIZED',
      '#2': 'INVALID_INPUT',
      '#3': 'ALREADY_EXISTS',
      '#4': 'NOT_FOUND',
      '#5': 'INACTIVE',
      '#6': 'VERSION_CONFLICT',
      '#7': 'ISSUER_OPERATOR_NOT_LINKED',
      '#8': 'UNKNOWN_CREDENTIAL_TYPE',
    };
    for (const [marker, code] of Object.entries(known)) {
      if (error.includes(marker)) return code;
    }
    return 'CONTRACT_ERROR';
  }

  private mapTransactionError(response: rpc.Api.GetFailedTransactionResponse): string {
    const diags = response.diagnosticEventsXdr ?? [];

    for (const diagnostic of diags) {
      try {
        const v0 = diagnostic.event().body().v0();
        const data = v0.data();

        // The host emits the contract error as an scvError value.
        if (data.switch().name === 'scvError') {
          const scError = data.error() as unknown as { contractCode?(): unknown };
          if (scError.contractCode) {
            const code = this.toNumber(scError.contractCode());
            return `CONTRACT_ERROR_${code}`;
          }
        }

        // Fallback: scan string-like event topics/data for the host pattern.
        const text = [
          ...v0.topics().map((t: xdr.ScVal) => this.scValToString(t)),
          this.scValToString(data),
        ].join(' ');
        const match = text.match(/Error\(Contract,\s*#(\d+)\)/);
        if (match) {
          return `CONTRACT_ERROR_${match[1]}`;
        }
      } catch {
        // Ignore malformed diagnostic events; keep scanning.
      }
    }

    // Host resource-limit diagnostics from failed smart-wallet __check_auth.
    for (const diagnostic of diags) {
      try {
        const v0 = diagnostic.event().body().v0();
        const text = [
          ...v0.topics().map((t: xdr.ScVal) => this.scValToString(t)),
          this.scValToString(v0.data()),
        ].join(' ');
        if (
          text.includes('Memory(OutOfBoundsGrowth') ||
          text.includes('operation instructions exceeds') ||
          text.includes('OutOfBoundsGrowth')
        ) {
          return 'RESOURCE_LIMIT';
        }
      } catch {
        // ignore
      }
    }

    return 'CONTRACT_FAILED';
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value);
    if (value && typeof value === 'object') {
      if ('toNumber' in value && typeof value.toNumber === 'function') {
        return value.toNumber();
      }
      if ('value' in value && typeof (value as { value: unknown }).value === 'number') {
        return (value as { value: number }).value;
      }
    }
    return Number(value);
  }

  private scValToString(val: xdr.ScVal): string {
    try {
      const native = scValToNative(val);
      if (native == null) return 'null';
      if (Buffer.isBuffer(native)) return native.toString('hex');
      if (typeof native === 'bigint') return native.toString();
      return JSON.stringify(native);
    } catch {
      return '';
    }
  }

  private sanitize(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    // Never leak secrets: strip anything that looks like a Stellar secret.
    return message.replace(/S[A-Z2-7]{55}/g, 'S***').slice(0, 300);
  }
}
