import 'server-only';
import {
  compareDigests32ByteForByte,
  deriveV2OnChainIdentifiers,
  type V2ContractFamilyCode,
} from '@/domain/credentials/v2';
import { isPersistenceConfigured } from '@/infrastructure/config/env';
import { query } from '@/infrastructure/database/pool';
import { LocalSigner } from '@/infrastructure/stellar/LocalSigner';
import {
  getStellarNetworkConfig,
  getTestnetOperatorSignerConfig,
  inspectTestnetV2SigningReadiness,
} from '@/infrastructure/stellar/networkConfig';
import { PostgreSQLOperationStore } from '@/infrastructure/stellar/PostgreSQLOperationStore';
import { InMemoryOperationStore } from '@/infrastructure/stellar/InMemoryOperationStore';
import { SdkSorobanTransport } from '@/infrastructure/stellar/SdkSorobanTransport';
import { SorobanStellarGateway } from '@/infrastructure/stellar/SorobanStellarGateway';
import type { OperationStore } from '@/ports/OperationStore';
import type { OperationPhase, StellarGateway } from '@/ports/StellarGateway';
import type { CredentialV2Record } from './CredentialV2Service';
import {
  SimulatedCredentialV2Gateway,
  type SimulatedV2GatewayResult,
} from './SimulatedCredentialV2Gateway';

export interface RealV2GatewayResult {
  simulated: false;
  gatewayMode: 'soroban_v2';
  network: 'testnet' | 'mainnet' | 'demo';
  onChainConfirmed: boolean;
  publicStatusLabel:
    | 'Confirmada en Stellar'
    | 'Registro local — sin confirmación Stellar';
  contractMethod: 'issue_credential_v2';
  contractId: string;
  operationId: string;
  idempotencyKey: string;
  phase: OperationPhase;
  txHash: string | null;
  ledger: number | null;
  errorCode: string | null;
  hashSchema: 2;
  familyCode: V2ContractFamilyCode;
  credentialIdHex: string;
  issuerIdHex: string;
  subjectIdHex: string;
  eventIdHex: string;
  scopeIdHex: string;
  businessKeyHex: string;
  payloadDigest: string;
  readbackDigest: string | null;
  digestMatches: boolean;
  operatorAddress: string;
  reconciledFromExistingOperation: boolean;
}

export type CredentialV2GatewayResult =
  | SimulatedV2GatewayResult
  | RealV2GatewayResult;

export interface SorobanCredentialV2GatewayDeps {
  gateway: StellarGateway;
  store: OperationStore;
  contractId: string;
  network: 'testnet' | 'mainnet' | 'demo';
  operatorAddress: string;
}

/**
 * D2 Real Soroban Gateway for Credential V2 (`CulturalCredentialRegistry::issue_credential_v2`).
 *
 * - Uses project-controlled operator signing on Stellar Testnet (the operator's
 *   WebAuthn passkey authenticates the HTTP application session).
 * - If a previous submission for `issue_v2:${publicId}` is uncertain or expired,
 *   queries transaction status before re-sending so retries never duplicate issuance.
 * - Marks the credential as confirmed (`Confirmada en Stellar` and persists
 *   `credentials.issued_ledger`) ONLY when the transaction is confirmed in a ledger
 *   AND the 32-byte digest read from `get_credential` matches `credential.payloadDigest`
 *   byte-for-byte.
 */
export class SorobanCredentialV2Gateway {
  constructor(private readonly deps: SorobanCredentialV2GatewayDeps) {}

  async anchorCredential(
    credential: CredentialV2Record
  ): Promise<RealV2GatewayResult> {
    const ids = deriveV2OnChainIdentifiers({
      publicId: credential.publicId,
      issuerEntityId: credential.issuerEntityId,
      subjectEntityId: credential.subjectEntityId,
      eventEntityId: credential.eventEntityId,
      credentialFamily: credential.credentialFamily,
      participationId: credential.participationId,
    });

    const idempotencyKey = `issue_v2:${credential.publicId}`;
    const existingOp = await this.deps.store.findByIdempotencyKey(idempotencyKey);
    const reconciledFromExistingOperation = Boolean(
      existingOp && existingOp.state.txHash !== null
    );

    const opState = await this.deps.gateway.issueCredentialV2({
      idempotencyKey,
      actorAddress: this.deps.operatorAddress,
      publicId: credential.publicId,
      issuerEntityId: credential.issuerEntityId,
      subjectEntityId: credential.subjectEntityId,
      eventEntityId: credential.eventEntityId,
      familyCode: ids.familyCode,
      participationId: credential.participationId,
      payloadDigest: credential.payloadDigest,
    });

    let readbackDigest: string | null = null;
    let digestMatches = false;
    let onChainConfirmed = false;

    if (opState.phase === 'confirmed' && opState.ledger !== null) {
      const verification = await this.deps.gateway.verifyCredentialV2({
        publicId: credential.publicId,
        payloadDigest: credential.payloadDigest,
        participationId: credential.participationId,
        familyCode: ids.familyCode,
      });

      readbackDigest = verification.readbackDigest;
      digestMatches = Boolean(
        verification.exists &&
          !verification.revoked &&
          verification.matches &&
          verification.scopeMatches &&
          verification.hashSchema === 2 &&
          verification.readbackDigest &&
          compareDigests32ByteForByte(
            credential.payloadDigest,
            verification.readbackDigest
          )
      );

      if (digestMatches) {
        onChainConfirmed = true;
        if (isPersistenceConfigured()) {
          await query(
            `UPDATE credentials
             SET issued_ledger = $1,
                 updated_at = NOW()
             WHERE id = $2`,
            [opState.ledger, credential.id]
          );
        }
      }
    }

    const publicStatusLabel = onChainConfirmed
      ? 'Confirmada en Stellar'
      : 'Registro local — sin confirmación Stellar';

    return {
      simulated: false,
      gatewayMode: 'soroban_v2',
      network: this.deps.network,
      onChainConfirmed,
      publicStatusLabel,
      contractMethod: 'issue_credential_v2',
      contractId: this.deps.contractId,
      operationId: opState.operationId,
      idempotencyKey: opState.idempotencyKey,
      phase: opState.phase,
      txHash: opState.txHash,
      ledger: onChainConfirmed ? opState.ledger : null,
      errorCode: onChainConfirmed
        ? null
        : opState.errorCode ?? (opState.phase === 'confirmed' && !digestMatches ? 'READBACK_MISMATCH' : null),
      hashSchema: 2,
      familyCode: ids.familyCode,
      credentialIdHex: ids.credentialIdHex,
      issuerIdHex: ids.issuerIdHex,
      subjectIdHex: ids.subjectIdHex,
      eventIdHex: ids.eventIdHex,
      scopeIdHex: ids.scopeIdHex,
      businessKeyHex: ids.businessKeyHex,
      payloadDigest: credential.payloadDigest,
      readbackDigest,
      digestMatches,
      operatorAddress: this.deps.operatorAddress,
      reconciledFromExistingOperation,
    };
  }
}

let testGatewayOverride: SorobanCredentialV2Gateway | null = null;

/**
 * Allows D2 integration tests to inject a SorobanCredentialV2Gateway instance
 * (e.g., backed by PostgreSQLOperationStore and a controlled SorobanTransport).
 */
export function setCredentialV2GatewayOverrideForTests(
  gateway: SorobanCredentialV2Gateway | null
): void {
  testGatewayOverride = gateway;
}

export function getCredentialV2GatewayOverrideForTests(): SorobanCredentialV2Gateway | null {
  return testGatewayOverride;
}

const fallbackInMemoryStore = new InMemoryOperationStore();

/**
 * Constructs a real `SorobanCredentialV2Gateway` bound to the configured
 * Testnet network, contract ID, and project-controlled operator signer.
 */
export function createRealCredentialV2Gateway(): SorobanCredentialV2Gateway {
  if (testGatewayOverride) {
    return testGatewayOverride;
  }
  const networkConfig = getStellarNetworkConfig();
  const signerConfig = getTestnetOperatorSignerConfig();
  const transport = new SdkSorobanTransport(networkConfig);
  const store = isPersistenceConfigured()
    ? new PostgreSQLOperationStore()
    : fallbackInMemoryStore;
  const signer = new LocalSigner(
    signerConfig.operatorSecret,
    networkConfig.networkPassphrase
  );
  const gateway = new SorobanStellarGateway(
    networkConfig,
    transport,
    store,
    signer
  );

  return new SorobanCredentialV2Gateway({
    gateway,
    store,
    contractId: networkConfig.credentialRegistryContractId,
    network: networkConfig.environment,
    operatorAddress: signerConfig.operatorAddress,
  });
}

/**
 * Executes V2 credential anchoring through the real Soroban V2 gateway when
 * Testnet signing is configured (or injected in tests), or falls back to the
 * explicitly labeled simulated D1 gateway when Testnet operator signing is not
 * configured in the local environment (unless `requireReal` is true).
 */
export async function executeCredentialV2Gateway(
  credential: CredentialV2Record,
  options?: {
    operatorAddressFallback?: string;
    requireReal?: boolean;
  }
): Promise<CredentialV2GatewayResult> {
  if (testGatewayOverride) {
    return testGatewayOverride.anchorCredential(credential);
  }

  const isUnitTestEnv =
    process.env.VITEST === 'true' &&
    process.env.CULTURAGO_TEST_LIVE_SOROBAN !== 'true';

  const readiness = inspectTestnetV2SigningReadiness();
  if ((readiness.ready && !isUnitTestEnv) || options?.requireReal) {
    const realGateway = createRealCredentialV2Gateway();
    return realGateway.anchorCredential(credential);
  }

  return new SimulatedCredentialV2Gateway().simulateIssue(credential, {
    operatorAddress: options?.operatorAddressFallback,
  });
}
