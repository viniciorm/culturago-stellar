import { OperationStore } from '../../ports/OperationStore';
import { SignerPort, PreparedTransactionPayload, SignedTransactionPayload } from '../../ports/SignerPort';
import { StellarGateway } from '../../ports/StellarGateway';
import { InMemoryChainTransport } from './InMemoryChainTransport';
import { InMemoryOperationStore } from './InMemoryOperationStore';
import { SorobanStellarGateway } from './SorobanStellarGateway';
import { StellarNetworkConfig } from './networkConfig';

const DEMO_CONFIG: StellarNetworkConfig = {
  environment: 'demo',
  networkPassphrase: 'CulturaGO Demo ; 2026',
  rpcUrl: 'in-memory://demo',
  entityRegistryContractId: 'CDEMO_ENTITY_REGISTRY',
  credentialRegistryContractId: 'CDEMO_CREDENTIAL_REGISTRY',
  explorerBase: null,
  smartWalletWasmAllowlist: [],
  feePayerAddress: null,
  feePayerSecret: null,
};

/**
 * Demo signer: marks the prepared envelope as signed inside the in-memory
 * chain. Only valid with InMemoryChainTransport; never usable on a real
 * network because the "signature" is a JSON marker, not a Stellar signature.
 */
export class MockSigner implements SignerPort {
  constructor(private readonly actorAddress: string) {}

  async sign(prepared: PreparedTransactionPayload): Promise<SignedTransactionPayload> {
    const envelope = JSON.parse(prepared.unsignedXdr) as Record<string, unknown>;
    envelope.signature = `demo-sig:${this.actorAddress}`;
    envelope.mode = 'signed';
    return {
      operationId: prepared.operationId,
      signedXdr: JSON.stringify(envelope),
      signerAddress: this.actorAddress,
    };
  }
}

export interface MockStellarGatewayBundle {
  gateway: StellarGateway;
  /** Direct handle to the simulated chain for test hooks (timeouts, restore). */
  transport: InMemoryChainTransport;
  store: OperationStore;
}

/**
 * Faithful mock: the SAME SorobanStellarGateway pipeline (state machine,
 * idempotency, signed-payload verification, readback) driven by an in-memory
 * chain. Demo mode never produces explorer links, claims or real
 * confirmations — phases live entirely in the store.
 */
export function createMockStellarGateway(options?: {
  signer?: SignerPort | null;
  store?: OperationStore;
  newId?: () => string;
}): MockStellarGatewayBundle {
  const transport = new InMemoryChainTransport();
  const store = options?.store ?? new InMemoryOperationStore();
  const signer = options?.signer === undefined ? new MockSigner('G_DEMO_ACTOR') : options.signer;
  const gateway = new SorobanStellarGateway(
    DEMO_CONFIG,
    transport,
    store,
    signer,
    options?.newId
  );
  return { gateway, transport, store };
}
