import { describe, expect, it } from 'vitest';
import { isDomainError } from '@/domain/errors';
import {
  createMockStellarGateway,
  MockSigner,
} from '@/infrastructure/stellar/MockStellarGateway';
import { credentialRecordMatches } from '@/infrastructure/stellar/SorobanStellarGateway';
import { StellarGateway } from '@/ports/StellarGateway';

const ACTOR = 'G_DEMO_ACTOR';
const hex = (byte: number) => byte.toString(16).padStart(2, '0').repeat(32);

function registerCommand(key: string) {
  return {
    idempotencyKey: key,
    actorAddress: ACTOR,
    entityId: hex(1),
    metadataHash: hex(9),
    hashSchema: 1,
  };
}

function issueCommand(key: string) {
  return {
    idempotencyKey: key,
    actorAddress: ACTOR,
    credentialId: hex(2),
    issuerId: hex(7),
    subjectId: hex(3),
    eventId: hex(4),
    credentialType: 1,
    metadataHash: hex(10),
    hashSchema: 1,
  };
}

function revokeCommand(key: string) {
  return {
    idempotencyKey: key,
    actorAddress: ACTOR,
    credentialId: hex(2),
    reasonHash: null,
  };
}

/** Liskov suite: any StellarGateway implementation must behave identically.
 *  The mock runs the real gateway pipeline over the in-memory chain, so this
 *  single suite covers both. */
describe.each([['mock', () => createMockStellarGateway().gateway]] as const)(
  'StellarGateway contract (%s)',
  (_name, make) => {
    let gateway: StellarGateway;

    it('register: full pipeline reaches confirmed only after readback', async () => {
      gateway = make();
      const state = await gateway.registerEntity(registerCommand('k1'));
      expect(state.phase).toBe('confirmed');
      expect(state.txHash).not.toBeNull();
      expect(state.ledger).not.toBeNull();
      expect(state.errorCode).toBeNull();
    });

    it('register: same idempotency key + same payload returns the stored operation', async () => {
      gateway = make();
      const first = await gateway.registerEntity(registerCommand('k2'));
      const second = await gateway.registerEntity(registerCommand('k2'));
      expect(second.operationId).toBe(first.operationId);
      expect(second.phase).toBe('confirmed');
    });

    it('register: same idempotency key + different payload conflicts', async () => {
      gateway = make();
      await gateway.registerEntity(registerCommand('k3'));
      await expect(
        gateway.registerEntity({ ...registerCommand('k3'), metadataHash: hex(77) })
      ).rejects.toSatisfy((e) => isDomainError(e, 'ALREADY_EXISTS'));
    });

    it('register: malformed metadata hash fails before touching the chain', async () => {
      gateway = make();
      await expect(
        gateway.registerEntity({ ...registerCommand('k4'), metadataHash: 'not-hex' })
      ).rejects.toSatisfy((e) => isDomainError(e, 'INVALID_INPUT'));
    });

    it('issue + revoke: lifecycle confirms and verifyCredential reflects revocation', async () => {
      gateway = make();
      const issued = await gateway.issueCredential(issueCommand('k5'));
      expect(issued.phase).toBe('confirmed');

      const before = await gateway.verifyCredential({
        credentialId: hex(2),
        metadataHash: hex(10),
        hashSchema: 1,
      });
      expect(before).toMatchObject({ exists: true, matches: true, revoked: false });
      expect(before.ledger).not.toBeNull();

      const revoked = await gateway.revokeCredential(revokeCommand('k6'));
      expect(revoked.phase).toBe('confirmed');

      const after = await gateway.verifyCredential({
        credentialId: hex(2),
        metadataHash: hex(10),
        hashSchema: 1,
      });
      expect(after.revoked).toBe(true);
    });

    it('issue: wrong hash verification reports mismatch, not success', async () => {
      gateway = make();
      await gateway.issueCredential(issueCommand('k7'));
      const result = await gateway.verifyCredential({
        credentialId: hex(2),
        metadataHash: hex(99),
        hashSchema: 1,
      });
      expect(result.exists).toBe(true);
      expect(result.matches).toBe(false);
    });

    it('issue: unknown credential type fails terminally at prepare time', async () => {
      gateway = make();
      const state = await gateway.issueCredential({ ...issueCommand('k8'), credentialType: 99 });
      expect(state.phase).toBe('failed_terminal');
      expect(state.errorCode).toBe('UNKNOWN_CREDENTIAL_TYPE');
      expect(state.txHash).toBeNull();
    });

    it('two-phase flow: prepare stops at awaiting_signature, submitSigned confirms', async () => {
      const bundle = createMockStellarGateway({ signer: null });
      gateway = bundle.gateway;

      const prepared = await gateway.prepareRegisterEntity(registerCommand('k9'));
      expect(prepared.phase).toBe('awaiting_signature');
      expect(prepared.txHash).toBeNull();

      const payload = await gateway.getPreparedPayload(prepared.operationId);
      const signed = await new MockSigner(ACTOR).sign(payload);
      const final = await gateway.submitSigned(
        prepared.operationId,
        signed.signedXdr,
        signed.signerAddress
      );
      expect(final.phase).toBe('confirmed');
      expect(final.txHash).not.toBeNull();
    });

    it('two-phase flow: a tampered signed payload is rejected', async () => {
      const bundle = createMockStellarGateway({ signer: null });
      gateway = bundle.gateway;

      const prepared = await gateway.prepareRegisterEntity(registerCommand('k10'));
      const payload = await gateway.getPreparedPayload(prepared.operationId);

      // Tamper: sign a DIFFERENT envelope
      const tampered = JSON.parse(payload.unsignedXdr) as Record<string, unknown>;
      (tampered.spec as { method: string }).method = 'deactivate_entity';
      tampered.signature = 'demo-sig:evil';
      tampered.mode = 'signed';

      await expect(
        gateway.submitSigned(prepared.operationId, JSON.stringify(tampered), ACTOR)
      ).rejects.toSatisfy((e) => isDomainError(e, 'UNAUTHORIZED'));
    });

    it('two-phase flow: signer address must match the intent actor', async () => {
      const bundle = createMockStellarGateway({ signer: null });
      gateway = bundle.gateway;

      const prepared = await gateway.prepareRegisterEntity(registerCommand('k11'));
      const payload = await gateway.getPreparedPayload(prepared.operationId);
      const signed = await new MockSigner('G_IMPERSONATOR').sign(payload);

      await expect(
        gateway.submitSigned(prepared.operationId, signed.signedXdr, 'G_IMPERSONATOR')
      ).rejects.toSatisfy((e) => isDomainError(e, 'UNAUTHORIZED'));
    });

    it('confirmed operations cannot be re-submitted', async () => {
      const bundle = createMockStellarGateway({ signer: null });
      gateway = bundle.gateway;

      const prepared = await gateway.prepareRegisterEntity(registerCommand('k12'));
      const payload = await gateway.getPreparedPayload(prepared.operationId);
      const signed = await new MockSigner(ACTOR).sign(payload);
      await gateway.submitSigned(prepared.operationId, signed.signedXdr, signed.signerAddress);

      await expect(
        gateway.submitSigned(prepared.operationId, signed.signedXdr, signed.signerAddress)
      ).rejects.toSatisfy((e) => isDomainError(e, 'INVALID_STATE_TRANSITION'));
    });

    it('timeout: pending submission degrades to unknown, never blind-resubmits', async () => {
      const bundle = createMockStellarGateway({ signer: null });
      bundle.transport.nextSubmissionStaysPending = true;
      gateway = bundle.gateway;

      const prepared = await gateway.prepareRegisterEntity(registerCommand('k13'));
      const payload = await gateway.getPreparedPayload(prepared.operationId);
      const signed = await new MockSigner(ACTOR).sign(payload);
      const state = await gateway.submitSigned(
        prepared.operationId,
        signed.signedXdr,
        signed.signerAddress
      );

      expect(state.phase).toBe('unknown');
      expect(state.txHash).not.toBeNull();
      // unknown is reconcilable but never re-submitted blind
      await expect(
        gateway.submitSigned(prepared.operationId, signed.signedXdr, signed.signerAddress)
      ).rejects.toSatisfy((e) => isDomainError(e, 'INVALID_STATE_TRANSITION'));
    });

    it('getOperation returns the stored state', async () => {
      gateway = make();
      const state = await gateway.registerEntity(registerCommand('k14'));
      const fetched = await gateway.getOperation(state.operationId);
      expect(fetched.operationId).toBe(state.operationId);
      expect(fetched.phase).toBe('confirmed');
    });

    it('verifyCredential on unknown id reports not-found without error', async () => {
      gateway = make();
      const result = await gateway.verifyCredential({
        credentialId: hex(200),
        metadataHash: hex(10),
        hashSchema: 1,
      });
      expect(result).toMatchObject({ exists: false, matches: false, revoked: false });
    });

    it('issue: readback detects mismatched metadata hash and fails terminal', async () => {
      const bundle = createMockStellarGateway({ signer: null });
      gateway = bundle.gateway;
      const prepared = await gateway.prepareIssueCredential(issueCommand('k-readback-hash'));

      const op = (await bundle.store.get(prepared.operationId))!;
      op.intent.expected!.metadataHash = hex(99);
      await bundle.store.save(op);

      const payload = await gateway.getPreparedPayload(prepared.operationId);
      const signed = await new MockSigner(ACTOR).sign(payload);
      const final = await gateway.submitSigned(
        prepared.operationId,
        signed.signedXdr,
        signed.signerAddress
      );

      expect(final.phase).toBe('failed_terminal');
      expect(final.errorCode).toBe('READBACK_MISMATCH');
    });

    it('issue: readback detects mismatched hash schema and fails terminal', async () => {
      const bundle = createMockStellarGateway({ signer: null });
      gateway = bundle.gateway;
      const prepared = await gateway.prepareIssueCredential(issueCommand('k-readback-schema'));

      const op = (await bundle.store.get(prepared.operationId))!;
      op.intent.expected!.hashSchema = 99;
      await bundle.store.save(op);

      const payload = await gateway.getPreparedPayload(prepared.operationId);
      const signed = await new MockSigner(ACTOR).sign(payload);
      const final = await gateway.submitSigned(
        prepared.operationId,
        signed.signedXdr,
        signed.signerAddress
      );

      expect(final.phase).toBe('failed_terminal');
      expect(final.errorCode).toBe('READBACK_MISMATCH');
    });

    it('issue: readback detects mismatched issuer id and fails terminal', async () => {
      const bundle = createMockStellarGateway({ signer: null });
      gateway = bundle.gateway;
      const prepared = await gateway.prepareIssueCredential(issueCommand('k-readback-issuer'));

      const op = (await bundle.store.get(prepared.operationId))!;
      op.intent.expected!.issuerId = hex(88);
      await bundle.store.save(op);

      const payload = await gateway.getPreparedPayload(prepared.operationId);
      const signed = await new MockSigner(ACTOR).sign(payload);
      const final = await gateway.submitSigned(
        prepared.operationId,
        signed.signedXdr,
        signed.signerAddress
      );

      expect(final.phase).toBe('failed_terminal');
      expect(final.errorCode).toBe('READBACK_MISMATCH');
    });

    it('register: readback detects mismatched metadata hash and fails terminal', async () => {
      const bundle = createMockStellarGateway({ signer: null });
      gateway = bundle.gateway;
      const prepared = await gateway.prepareRegisterEntity(registerCommand('k-readback-entity'));

      const op = (await bundle.store.get(prepared.operationId))!;
      op.intent.expected!.metadataHash = hex(99);
      await bundle.store.save(op);

      const payload = await gateway.getPreparedPayload(prepared.operationId);
      const signed = await new MockSigner(ACTOR).sign(payload);
      const final = await gateway.submitSigned(
        prepared.operationId,
        signed.signedXdr,
        signed.signerAddress
      );

      expect(final.phase).toBe('failed_terminal');
      expect(final.errorCode).toBe('READBACK_MISMATCH');
    });

    it('revoke: readback detects mismatched reason hash and fails terminal', async () => {
      const bundle = createMockStellarGateway();
      gateway = bundle.gateway;
      await gateway.issueCredential(issueCommand('k-revoke-reason'));

      const prepared = await gateway.prepareRevokeCredential({
        idempotencyKey: 'k-revoke-reason-post',
        actorAddress: ACTOR,
        credentialId: hex(2),
        reasonHash: null,
      });

      const op = (await bundle.store.get(prepared.operationId))!;
      op.intent.expected!.revokedReasonHash = hex(99);
      await bundle.store.save(op);

      const payload = await gateway.getPreparedPayload(prepared.operationId);
      const signed = await new MockSigner(ACTOR).sign(payload);
      const final = await gateway.submitSigned(
        prepared.operationId,
        signed.signedXdr,
        signed.signerAddress
      );

      expect(final.phase).toBe('failed_terminal');
      expect(final.errorCode).toBe('READBACK_MISMATCH');
    });
  }
);

describe('credentialRecordMatches readback validation', () => {
  const baseRecord = () => ({
    credential_id: hex(2),
    issuer_id: hex(7),
    issued_by: ACTOR,
    subject_id: hex(3),
    event_id: hex(4),
    credential_type: 1,
    metadata_hash: hex(10),
    hash_schema: 1,
    revoked: false,
    issued_ledger: 1001,
    revoked_ledger: null as number | null,
    revoked_reason_hash: null as string | null,
  });

  const baseExpected = () => ({
    credentialId: hex(2),
    issuerId: hex(7),
    issuedBy: ACTOR,
    subjectId: hex(3),
    eventId: hex(4),
    credentialType: 1,
    metadataHash: hex(10),
    hashSchema: 1,
    revoked: false,
  });

  it('accepts a fully matching issue record', () => {
    expect(credentialRecordMatches(baseRecord(), baseExpected(), 1001, 'issue_credential')).toBe(true);
  });

  it('rejects a record with the wrong credential id', () => {
    const record = { ...baseRecord(), credential_id: hex(99) };
    expect(credentialRecordMatches(record, baseExpected(), 1001, 'issue_credential')).toBe(false);
  });

  it('rejects a record with the wrong issuer id', () => {
    const record = { ...baseRecord(), issuer_id: hex(99) };
    expect(credentialRecordMatches(record, baseExpected(), 1001, 'issue_credential')).toBe(false);
  });

  it('rejects a record with the wrong subject id', () => {
    const record = { ...baseRecord(), subject_id: hex(99) };
    expect(credentialRecordMatches(record, baseExpected(), 1001, 'issue_credential')).toBe(false);
  });

  it('rejects a record with the wrong event id', () => {
    const record = { ...baseRecord(), event_id: hex(99) };
    expect(credentialRecordMatches(record, baseExpected(), 1001, 'issue_credential')).toBe(false);
  });

  it('rejects a record with the wrong credential type', () => {
    const record = { ...baseRecord(), credential_type: 2 };
    expect(credentialRecordMatches(record, baseExpected(), 1001, 'issue_credential')).toBe(false);
  });

  it('rejects a record with the wrong metadata hash', () => {
    const record = { ...baseRecord(), metadata_hash: hex(99) };
    expect(credentialRecordMatches(record, baseExpected(), 1001, 'issue_credential')).toBe(false);
  });

  it('rejects a record with the wrong hash schema', () => {
    const record = { ...baseRecord(), hash_schema: 2 };
    expect(credentialRecordMatches(record, baseExpected(), 1001, 'issue_credential')).toBe(false);
  });

  it('rejects a record with the wrong issued_by address', () => {
    const record = { ...baseRecord(), issued_by: 'G_OTHER' };
    expect(credentialRecordMatches(record, baseExpected(), 1001, 'issue_credential')).toBe(false);
  });

  it('rejects an issue record that is already revoked', () => {
    const record = { ...baseRecord(), revoked: true };
    expect(credentialRecordMatches(record, baseExpected(), 1001, 'issue_credential')).toBe(false);
  });

  it('rejects an issue record whose issued ledger does not match the confirmation ledger', () => {
    const record = { ...baseRecord(), issued_ledger: 1002 };
    expect(credentialRecordMatches(record, baseExpected(), 1001, 'issue_credential')).toBe(false);
  });

  it('rejects a record whose confirmation ledger differs from the recorded issued ledger', () => {
    const record = baseRecord();
    expect(credentialRecordMatches(record, baseExpected(), 1002, 'issue_credential')).toBe(false);
  });

  it('accepts a fully matching revoke record', () => {
    const record = {
      ...baseRecord(),
      revoked: true,
      issued_ledger: 1001,
      revoked_ledger: 1002,
      revoked_reason_hash: hex(11),
    };
    const expected = {
      ...baseExpected(),
      revoked: true,
      revokedReasonHash: hex(11),
    };
    expect(credentialRecordMatches(record, expected, 1002, 'revoke_credential')).toBe(true);
  });

  it('rejects a revoke record whose revoked ledger does not match the confirmation ledger', () => {
    const record = {
      ...baseRecord(),
      revoked: true,
      issued_ledger: 1001,
      revoked_ledger: 1002,
      revoked_reason_hash: hex(11),
    };
    const expected = {
      ...baseExpected(),
      revoked: true,
      revokedReasonHash: hex(11),
    };
    expect(credentialRecordMatches(record, expected, 1003, 'revoke_credential')).toBe(false);
  });

  it('rejects a revoke record whose reason hash does not match', () => {
    const record = {
      ...baseRecord(),
      revoked: true,
      issued_ledger: 1001,
      revoked_ledger: 1002,
      revoked_reason_hash: hex(11),
    };
    const expected = {
      ...baseExpected(),
      revoked: true,
      revokedReasonHash: hex(99),
    };
    expect(credentialRecordMatches(record, expected, 1002, 'revoke_credential')).toBe(false);
  });
});
