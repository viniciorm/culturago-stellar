import { describe, expect, it } from 'vitest';
import { isDomainError } from '@/domain/errors';
import {
  createMockStellarGateway,
  MockSigner,
} from '@/infrastructure/stellar/MockStellarGateway';
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
  }
);
