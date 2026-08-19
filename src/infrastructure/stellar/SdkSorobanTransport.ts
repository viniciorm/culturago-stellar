import 'server-only';
import {
  Account,
  Contract,
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
      return {
        needsRestore: true,
        preparedXdr: '',
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
        return { status: 'FAILED', contractError: this.mapTransactionError(response) };
      case 'NOT_FOUND':
        return { status: 'NOT_FOUND' };
      default:
        return { status: 'PENDING' };
    }
  }

  async readback(spec: ContractCallSpec): Promise<unknown> {
    const tx = await this.buildTransaction(spec);
    const sim = await this.server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
      return null;
    }
    return scValToNative(sim.result.retval);
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

  private async buildTransaction(spec: ContractCallSpec): Promise<Transaction> {
    // The fixture/testnet source account pays fees; user signatures come from
    // Soroban auth entries, not from the tx source. Until Phase 8 smart
    // wallets exist, the source account is the actor's own address.
    const account: Account = await this.server
      .getAccount(spec.actorAddress)
      .catch((error: unknown) => {
        throw domainError('NOT_FOUND', `actor account not found on-chain: ${this.sanitize(error)}`);
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
        return arg.hex === null
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
    const meta = response.resultMetaXdr;
    void meta;
    return 'CONTRACT_FAILED';
  }

  private sanitize(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    // Never leak secrets: strip anything that looks like a Stellar secret.
    return message.replace(/S[A-Z2-7]{55}/g, 'S***').slice(0, 300);
  }
}
