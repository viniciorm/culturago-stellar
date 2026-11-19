import { createHash } from 'node:crypto';
import { domainError } from '@/domain/errors';
import type { CredentialFamily } from '@/domain/credentials/v2';
import type { CredentialV2Record } from './CredentialV2Service';

export type V2ContractFamilyCode = 101 | 102 | 103;

const FAMILY_TO_CODE: Record<CredentialFamily, V2ContractFamilyCode> = {
  participant: 101,
  guest: 102,
  staff: 103,
};

const ZERO_BYTES32_HEX = '0'.repeat(64);

function sha256Hex(parts: (string | Buffer)[]): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(typeof part === 'string' ? Buffer.from(part, 'utf8') : part);
  }
  return hash.digest('hex');
}

function u32BeBuffer(val: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(val, 0);
  return buf;
}

export interface SimulatedV2ChainRecord {
  credentialIdHex: string;
  tokenId: number;
  issuerIdHex: string;
  issuedBy: string;
  subjectIdHex: string;
  eventIdHex: string;
  familyCode: V2ContractFamilyCode;
  scopeIdHex: string;
  metadataHash: string;
  hashSchema: 2;
  revoked: boolean;
  simulatedLedger: number;
}

export interface SimulatedV2GatewayResult {
  simulated: true;
  gatewayMode: 'simulated_d1';
  network: 'simulated-in-memory';
  onChainConfirmed: false;
  publicStatusLabel: 'Registro local — sin confirmación Stellar';
  contractMethod: 'issue_credential_v2';
  hashSchema: 2;
  familyCode: V2ContractFamilyCode;
  credentialIdHex: string;
  issuerIdHex: string;
  subjectIdHex: string;
  eventIdHex: string;
  scopeIdHex: string;
  businessKeyHex: string;
  payloadDigest: string;
  simulatedTokenId: number;
  simulatedLedger: number;
  simulatedReadbackMatches: boolean;
}

/**
 * Simulated V2 gateway for D1 vertical verification.
 *
 * Mirrors the exact domain-separated identifiers, scope rules, and business-key
 * uniqueness of `CulturalCredentialRegistry::issue_credential_v2` in memory,
 * while explicitly marking its output as `simulated: true` and `onChainConfirmed: false`
 * so it is never confused with a real Stellar Testnet transaction (which is D2).
 */
export class SimulatedCredentialV2Gateway {
  private ledger = 1000;
  private nextTokenId = 1;
  private recordsById = new Map<string, SimulatedV2ChainRecord>();
  private activeByBusinessKey = new Map<string, string>();

  simulateIssue(
    credential: CredentialV2Record,
    options?: { operatorAddress?: string }
  ): SimulatedV2GatewayResult {
    const operatorAddress =
      options?.operatorAddress?.trim() || 'G_SIMULATED_D1_OPERATOR';
    const familyCode = FAMILY_TO_CODE[credential.credentialFamily];
    if (!familyCode) {
      throw domainError(
        'INVALID_CREDENTIAL',
        `Unsupported V2 credential family '${credential.credentialFamily}'`
      );
    }

    if (
      (credential.credentialFamily === 'participant' ||
        credential.credentialFamily === 'guest') &&
      !credential.participationId
    ) {
      throw domainError(
        'INVALID_CREDENTIAL',
        `Family '${credential.credentialFamily}' requires participationId for V2 scope`
      );
    }

    if (credential.credentialFamily === 'staff' && credential.participationId != null) {
      throw domainError(
        'INVALID_CREDENTIAL',
        `Family 'staff' requires null participationId (zero scope)`
      );
    }

    const credentialIdHex = sha256Hex([
      `culturago.credential.v2.id\0${credential.publicId}`,
    ]);
    const issuerIdHex = sha256Hex([
      `culturago.entity.v1\0${credential.issuerEntityId}`,
    ]);
    const subjectIdHex = sha256Hex([
      `culturago.entity.v1\0${credential.subjectEntityId}`,
    ]);
    const eventIdHex = sha256Hex([
      `culturago.entity.v1\0${credential.eventEntityId}`,
    ]);
    const scopeIdHex =
      credential.credentialFamily === 'staff'
        ? ZERO_BYTES32_HEX
        : sha256Hex([
            `culturago.participation.v2\0${credential.participationId!}`,
          ]);

    const businessKeyHex = sha256Hex([
      'culturago.registry.v2\0',
      Buffer.from(subjectIdHex, 'hex'),
      Buffer.from(eventIdHex, 'hex'),
      u32BeBuffer(familyCode),
      Buffer.from(scopeIdHex, 'hex'),
    ]);

    const existingId = this.activeByBusinessKey.get(businessKeyHex);
    if (existingId) {
      const existing = this.recordsById.get(existingId);
      if (existing && !existing.revoked) {
        if (
          existing.credentialIdHex === credentialIdHex &&
          existing.issuerIdHex === issuerIdHex &&
          existing.metadataHash === credential.payloadDigest
        ) {
          return this.buildResult(existing, businessKeyHex);
        }
        throw domainError(
          'ALREADY_EXISTS',
          'Simulated V2 gateway: active credential already exists for this business key'
        );
      }
    }

    if (this.recordsById.has(credentialIdHex)) {
      throw domainError(
        'ALREADY_EXISTS',
        'Simulated V2 gateway: credential ID already exists'
      );
    }

    const record: SimulatedV2ChainRecord = {
      credentialIdHex,
      tokenId: this.nextTokenId++,
      issuerIdHex,
      issuedBy: operatorAddress,
      subjectIdHex,
      eventIdHex,
      familyCode,
      scopeIdHex,
      metadataHash: credential.payloadDigest,
      hashSchema: 2,
      revoked: false,
      simulatedLedger: ++this.ledger,
    };

    this.recordsById.set(credentialIdHex, record);
    this.activeByBusinessKey.set(businessKeyHex, credentialIdHex);

    return this.buildResult(record, businessKeyHex);
  }

  getSimulatedRecord(credentialIdHex: string): SimulatedV2ChainRecord | null {
    return this.recordsById.get(credentialIdHex) ?? null;
  }

  private buildResult(
    record: SimulatedV2ChainRecord,
    businessKeyHex: string
  ): SimulatedV2GatewayResult {
    const readback = this.recordsById.get(record.credentialIdHex);
    const simulatedReadbackMatches = Boolean(
      readback &&
        !readback.revoked &&
        readback.metadataHash === record.metadataHash &&
        readback.hashSchema === 2 &&
        readback.scopeIdHex === record.scopeIdHex
    );

    return {
      simulated: true,
      gatewayMode: 'simulated_d1',
      network: 'simulated-in-memory',
      onChainConfirmed: false,
      publicStatusLabel: 'Registro local — sin confirmación Stellar',
      contractMethod: 'issue_credential_v2',
      hashSchema: 2,
      familyCode: record.familyCode,
      credentialIdHex: record.credentialIdHex,
      issuerIdHex: record.issuerIdHex,
      subjectIdHex: record.subjectIdHex,
      eventIdHex: record.eventIdHex,
      scopeIdHex: record.scopeIdHex,
      businessKeyHex,
      payloadDigest: record.metadataHash,
      simulatedTokenId: record.tokenId,
      simulatedLedger: record.simulatedLedger,
      simulatedReadbackMatches,
    };
  }
}
