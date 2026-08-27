import { describe, expect, it } from 'vitest';
import { DatabaseGateway } from '@/ports/DatabaseGateway';
import { CredentialRecord } from '@/domain/credentials/credential';
import { createParticipation } from '@/domain/participation/participation';

/**
 * Liskov contract suite for DatabaseGateway adapters. Every adapter
 * (in-memory, Supabase, future ones) MUST satisfy these behaviors so use
 * cases can swap implementations without changing semantics.
 */
export function runDatabaseGatewayContract(
  name: string,
  makeGateway: () => DatabaseGateway | Promise<DatabaseGateway>
) {
  describe(`DatabaseGateway contract [${name}]`, () => {
    const cred = (id: string): CredentialRecord => ({
      credentialId: id,
      credentialCode: `CODE-${id}`,
      issuerId: 'issuer-1',
      issuedBy: 'operator-1',
      subjectId: 'subject-1',
      eventId: 'event-1',
      credentialType: 1,
      title: 'Credential title',
      description: 'Credential description',
      metadataHash: 'a'.repeat(64),
      hashSchema: 2,
      status: 'issued',
      issuedIntentAt: '2026-03-01T12:00:00Z',
      issuedLedger: null,
      revokedLedger: null,
      revokedReasonHash: null,
      revokedAt: null,
      revokedBy: null,
    });

    it('enforces the unique credential business key', async () => {
      const db = await makeGateway();
      await db.saveCredential(cred('c1'));
      const conflicting = { ...cred('c2') }; // same business key, different id
      await expect(db.saveCredential(conflicting)).rejects.toMatchObject({
        code: 'ALREADY_EXISTS',
      });
    });

    it('persists and retrieves credentials by id and subject', async () => {
      const db = await makeGateway();
      await db.saveCredential(cred('c1'));
      expect((await db.getCredentialById('c1'))?.credentialCode).toBe('CODE-c1');
      expect(await db.getCredentialById('missing')).toBeNull();
      expect(await db.listCredentialsBySubject('subject-1')).toHaveLength(1);
      expect(await db.listCredentialsBySubject('other')).toHaveLength(0);
    });

    it('finds credentials by business key', async () => {
      const db = await makeGateway();
      await db.saveCredential(cred('c1'));
      const found = await db.findCredentialByBusinessKey('issuer-1', 'subject-1', 'event-1', 1);
      expect(found?.credentialId).toBe('c1');
      expect(await db.findCredentialByBusinessKey('issuer-1', 'subject-1', 'event-1', 2)).toBeNull();
    });

    it('stores and returns participation with transitions intact', async () => {
      const db = await makeGateway();
      const p = createParticipation({ participationId: 'p1', subjectId: 's1', eventId: 'e1' });
      await db.saveParticipation(p);
      const loaded = await db.getParticipation('s1', 'e1');
      expect(loaded?.state).toBe('registered');
      expect(await db.getParticipation('s1', 'e2')).toBeNull();
    });

    it('rejects shrinking entity history', async () => {
      const db = await makeGateway();
      const v1 = {
        entityId: 'ent-1',
        active: true,
        latestVersion: 1,
        versions: [
          {
            version: 1,
            metadataHash: 'b'.repeat(64),
            hashSchema: 1,
            registrarId: 'r1',
            recordedAt: '2026-03-01T00:00:00Z',
            recordedLedger: null,
          },
        ],
      };
      await db.saveEntityRecord(v1, {
        kind: 'organization',
        displayName: 'Org',
        slug: 'org',
        country: 'CL',
        city: 'Santiago',
      });
      await expect(
        db.saveEntityRecord({ entityId: 'ent-1', active: true, latestVersion: 0, versions: [] })
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('returns null for unknown issuer-operator links', async () => {
      const db = await makeGateway();
      expect(await db.getIssuerOperatorLink('nobody', 'nobody')).toBeNull();
    });
  });
}
