import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSQLIdentityStore } from '@/infrastructure/auth/PostgreSQLIdentityStore';
import { closePool, query } from '@/infrastructure/database/pool';

const dbUrl = process.env.DATABASE_URL;

const describeIfPg = dbUrl ? describe : describe.skip;

describeIfPg('PostgreSQLIdentityStore integration', () => {
  let store: PostgreSQLIdentityStore;

  beforeAll(async () => {
    store = new PostgreSQLIdentityStore();
    // Ensure a clean auth test surface.
    await query('DELETE FROM passkey_credentials WHERE display_name LIKE \'test-%\'');
    await query('DELETE FROM sessions WHERE account_id IN (SELECT id FROM accounts WHERE person_entity_id IS NULL)');
    await query('DELETE FROM account_roles WHERE account_id IN (SELECT id FROM accounts WHERE person_entity_id IS NULL)');
    await query('DELETE FROM accounts WHERE person_entity_id IS NULL');
  });

  afterAll(async () => {
    await closePool();
  });

  it('creates and retrieves an account', async () => {
    const created = await store.createAccount({
      id: '00000000-0000-0000-0000-000000000001',
      status: 'pending_claim',
      personEntityId: null,
      walletContractAddress: null,
    });
    expect(created.status).toBe('pending_claim');

    const found = await store.getAccount(created.id);
    expect(found).not.toBeNull();
  });

  it('persists and consumes a challenge digest', async () => {
    const account = await store.createAccount({
      id: '00000000-0000-0000-0000-000000000002',
      status: 'active',
      personEntityId: null,
      walletContractAddress: null,
    });
    await store.createChallenge({
      id: '10000000-0000-0000-0000-000000000001',
      challenge: 'raw-challenge-value',
      purpose: 'authenticate',
      accountId: account.id,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const digest = '282ed34d009b00c49c294123733c85bfd85ee75957cf4e5ff7e54f98448238f6'; // sha256('raw-challenge-value')
    const first = await store.consumeChallenge(digest);
    expect(first).not.toBeNull();
    expect(first?.accountId).toBe(account.id);

    const second = await store.consumeChallenge(digest);
    expect(second).toBeNull();
  });
});
