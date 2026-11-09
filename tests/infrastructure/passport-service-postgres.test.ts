import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PassportService } from '@/infrastructure/stellar/PassportService';
import { PostgreSQLIndexer } from '@/infrastructure/stellar/PostgreSQLIndexer';
import { verifyCredentialOnChain, verifyCredentialOnChainByCode } from '@/app/actions';
import { GET as verifyGet } from '@/app/api/verify/[credentialId]/route';
import { GET as exportJsonGet } from '@/app/api/export/[credentialId]/json/route';
import { GET as exportPdfGet } from '@/app/api/export/[credentialId]/pdf/route';
import { closePool, query } from '@/infrastructure/database/pool';
import { isPersistenceConfigured } from '@/infrastructure/config/env';

const describeIfPg = isPersistenceConfigured() ? describe : describe.skip;

describeIfPg('PassportService & PostgreSQLIndexer V1 verification regression (PostgreSQL)', () => {
  const issuerId = randomUUID();
  const subjectId = randomUUID();
  const eventEntityId = randomUUID();
  const credentialId = randomUUID();
  const credentialCode = `FDVC2026-REG-${credentialId.slice(0, 8).toUpperCase()}`;
  const metadataHash = '9402b238a0b8f3508411eae874ec9c3a37cae0714cec69af458e96d2cd270da6';

  beforeAll(async () => {
    await query(
      `INSERT INTO entities (id, kind, display_name, slug, country, city)
       VALUES
         ($1, 'organization', 'Festival Emisor Regresión', $2, 'Chile', 'Santiago'),
         ($3, 'person', 'Sujeto Regresión V1', $4, 'Chile', 'Santiago'),
         ($5, 'event', 'Festival Regresión 2026', $6, 'Chile', 'Santiago')`,
      [
        issuerId,
        `org-reg-${issuerId.slice(0, 8)}`,
        subjectId,
        `sub-reg-${subjectId.slice(0, 8)}`,
        eventEntityId,
        `evt-reg-${eventEntityId.slice(0, 8)}`,
      ]
    );

    await query(
      `INSERT INTO events (entity_id, name, year, start_date, location, organizer_entity_id)
       VALUES ($1, 'Festival Regresión 2026', 2026, '2026-09-05', 'Santiago', $2)`,
      [eventEntityId, issuerId]
    );

    await query(
      `INSERT INTO credentials (
         id, credential_code, issuer_entity_id, subject_entity_id, event_id,
         credential_type, metadata_hash, hash_schema, status
       ) VALUES (
         $1, $2, $3, $4, $5, 5, $6, 1, 'issued'
       )`,
      [credentialId, credentialCode, issuerId, subjectId, eventEntityId, metadataHash]
    );
  });

  afterAll(async () => {
    await query('DELETE FROM stellar_indexed_events WHERE credential_id = $1 OR subject_id = $2', [
      credentialId,
      subjectId,
    ]);
    await query("DELETE FROM stellar_events WHERE contract_id = 'C_REGRESSION_TEST_CONTRACT'");
    await query('DELETE FROM credentials WHERE id = $1', [credentialId]);
    await query('DELETE FROM events WHERE entity_id = $1', [eventEntityId]);
    await query('DELETE FROM entities WHERE id = ANY($1::uuid[])', [[issuerId, subjectId, eventEntityId]]);
    await closePool();
  });

  it('confirms stellar_indexed_events has no event_index column while stellar_events does', async () => {
    const cols = await query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_name IN ('stellar_events', 'stellar_indexed_events')
         AND column_name = 'event_index'`
    );

    expect(cols.rows).toEqual([{ table_name: 'stellar_events', column_name: 'event_index' }]);
  });

  it('verifyIndexedCredential returns null without throwing when credential is not indexed', async () => {
    const passport = new PassportService();
    const res = await passport.verifyIndexedCredential(credentialId);
    expect(res).toBeNull();
  });

  it('reports unverified status (no false on-chain authenticity) when V1 credential exists only in local DB', async () => {
    const chainById = await verifyCredentialOnChain(credentialId);
    expect(chainById.credentialId).toBe(credentialId);
    expect(chainById.exists).toBe(false);
    expect(chainById.matches).toBe(false);
    expect(chainById.revoked).toBe(false);
    expect(chainById.status).toBe('unverified');
    expect(chainById.dbStatus).toBe('issued');

    const chainByCode = await verifyCredentialOnChainByCode(credentialCode);
    expect(chainByCode.status).toBe('unverified');
    expect(chainByCode.exists).toBe(false);

    const verifyResp = await verifyGet(new Request(`http://localhost/api/verify/${credentialId}`), {
      params: Promise.resolve({ credentialId }),
    });
    expect(verifyResp.status).toBe(200);
    const verifyBody = await verifyResp.json();
    expect(verifyBody).toMatchObject({
      credentialId,
      status: 'unverified',
      verifiedOnChain: false,
      dbStatus: 'issued',
      onChain: {
        exists: false,
        matches: false,
        revoked: false,
        ledger: null,
      },
      canonical: {
        digest: metadataHash,
        schema: 1,
      },
    });

    const jsonResp = await exportJsonGet(new Request(`http://localhost/api/export/${credentialId}/json`), {
      params: Promise.resolve({ credentialId }),
    });
    expect(jsonResp.status).toBe(200);
    const jsonBody = await jsonResp.json();
    expect(jsonBody.format).toBe('culturago.credential.v1');
    expect(jsonBody.status).toBe('unverified');
    expect(jsonBody.verifiedOnChain).toBe(false);
    expect(jsonBody.onChain).toEqual({
      exists: false,
      matches: false,
      revoked: false,
      ledger: null,
    });

    const pdfResp = await exportPdfGet(new Request(`http://localhost/api/export/${credentialId}/pdf`), {
      params: Promise.resolve({ credentialId }),
    });
    expect(pdfResp.status).toBe(200);
    const pdfBytes = Buffer.from(await pdfResp.arrayBuffer()).toString('latin1');
    expect(pdfBytes).toContain('Sin confirmacion en Stellar \\(registro local\\)');
    expect(pdfBytes).toContain('Registrada en Stellar: No');
  });

  it('indexes raw events and orders verifyIndexedCredential + getPassport by (ledger, event_index) via stellar_events join', async () => {
    const indexer = new PostgreSQLIndexer();
    const passport = new PassportService();
    const txIssue = `tx_issue_${randomUUID().replace(/-/g, '')}`;
    const txRevoke = `tx_revoke_${randomUUID().replace(/-/g, '')}`;

    const ingested = await indexer.ingest([
      {
        network: 'testnet',
        contractId: 'C_REGRESSION_TEST_CONTRACT',
        txHash: txIssue,
        ledger: 55000,
        eventIndex: 0,
        eventType: 'CredentialIssued',
        topics: ['CredentialIssued', credentialId],
        data: {
          credential_id: credentialId,
          issuer_id: issuerId,
          subject_id: subjectId,
          event_id: eventEntityId,
          credential_type: 5,
          metadata_hash: metadataHash,
          hash_schema: 1,
        },
      },
      {
        network: 'testnet',
        contractId: 'C_REGRESSION_TEST_CONTRACT',
        txHash: txRevoke,
        ledger: 55000,
        eventIndex: 1,
        eventType: 'CredentialRevoked',
        topics: ['CredentialRevoked', credentialId],
        data: {
          credential_id: credentialId,
          issuer_id: issuerId,
          subject_id: subjectId,
          event_id: eventEntityId,
          credential_type: 5,
          metadata_hash: metadataHash,
          hash_schema: 1,
        },
      },
    ]);
    expect(ingested.inserted).toBe(2);

    const processed = await indexer.processUnprocessed('testnet', 'C_REGRESSION_TEST_CONTRACT');
    expect(processed).toBeGreaterThanOrEqual(2);

    const verified = await passport.verifyIndexedCredential(credentialId);
    expect(verified).not.toBeNull();
    expect(verified?.credentialId).toBe(credentialId);
    expect(verified?.eventType).toBe('CredentialRevoked');
    expect(verified?.eventIndex).toBe(1);
    expect(verified?.ledger).toBe(55000);

    const entries = await passport.getPassport(subjectId, eventEntityId);
    const credEntry = entries.find((c) => c.credentialId === credentialId);
    expect(credEntry).toBeDefined();
    expect(credEntry?.status).toBe('revoked');
    expect(credEntry?.ledger).toBe(55000);

    // Also verify rebuildProjections succeeds without event_index column error
    await expect(indexer.rebuildProjections()).resolves.toBeUndefined();
  });
});
