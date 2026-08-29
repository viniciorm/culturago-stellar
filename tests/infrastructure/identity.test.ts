import { createHash, randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import { InMemoryIdentityStore } from '@/infrastructure/auth/InMemoryIdentityStore';
import { SessionService } from '@/infrastructure/auth/SessionService';

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

describe('InMemoryIdentityStore', () => {
  it('creates and retrieves an account', async () => {
    const store = new InMemoryIdentityStore();
    const account = await store.createAccount({
      id: randomUUID(),
      status: 'active',
      personEntityId: randomUUID(),
      walletContractAddress: 'C_TEST',
    });
    const loaded = await store.getAccount(account.id);
    expect(loaded?.id).toBe(account.id);
  });

  it('challenge is single-use and expires', async () => {
    const store = new InMemoryIdentityStore();
    const challenge = 'test-challenge';
    const digest = sha256(challenge);
    await store.createChallenge({
      id: randomUUID(),
      challenge,
      purpose: 'authenticate',
      accountId: null,
      expiresAt: new Date(Date.now() + 1000),
    });
    const first = await store.consumeChallenge(digest);
    expect(first).not.toBeNull();
    const second = await store.consumeChallenge(digest);
    expect(second).toBeNull();

    await store.createChallenge({
      id: randomUUID(),
      challenge: 'expired',
      purpose: 'authenticate',
      accountId: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await store.consumeChallenge(sha256('expired'))).toBeNull();
  });

  it('roles and issuer scopes are separate', async () => {
    const store = new InMemoryIdentityStore();
    const account = await store.createAccount({
      id: randomUUID(),
      status: 'active',
      personEntityId: null,
      walletContractAddress: null,
    });
    await store.grantRole(account.id, 'organizer');
    await store.linkIssuerOperator('issuer-a', account.id);
    await store.linkIssuerOperator('issuer-b', account.id);
    expect(await store.getRoles(account.id)).toEqual(['organizer']);
    expect(await store.getIssuerScopes(account.id)).toEqual(['issuer-a', 'issuer-b']);
  });

  it('saves and retrieves smart wallet claims and upserts wallets', async () => {
    const store = new InMemoryIdentityStore();
    const accountId = randomUUID();
    const entityId = randomUUID();
    const contractId = 'CBQPZU6O2HTURYQBMYYZ3DDZBTT67AYCXMT5YUYOSVQU5PUCBW642RJ6';

    const wallet = await store.upsertWallet({
      entityId,
      walletAddress: contractId,
      walletType: 'passkey',
      walletStatus: 'claimed',
    });
    expect(wallet.walletStatus).toBe('claimed');
    expect(wallet.walletAddress).toBe(contractId);

    const claim = await store.saveSmartWalletClaim({
      accountId,
      entityId,
      contractId,
      keyId: 'key-123',
      walletWasmHash: 'wasm-hash',
      network: 'testnet',
      deployTxHash: 'tx-hash',
    });
    expect(claim.contractId).toBe(contractId);
    expect(claim.keyId).toBe('key-123');

    const fetchedClaim = await store.getSmartWalletClaimByAccount(accountId);
    expect(fetchedClaim?.contractId).toBe(contractId);

    const fetchedWallet = await store.getWalletByEntity(entityId);
    expect(fetchedWallet?.walletStatus).toBe('claimed');
  });
});

describe('SessionService', () => {
  it('creates, validates and revokes sessions', async () => {
    const store = new InMemoryIdentityStore();
    const sessions = new SessionService(store, { idleTtlMs: 1000, absoluteTtlMs: 5000 });
    const account = await store.createAccount({
      id: randomUUID(),
      status: 'active',
      personEntityId: null,
      walletContractAddress: null,
    });
    const session = await sessions.create(account.id);
    expect(await sessions.validate(session.sessionToken)).not.toBeNull();
    await sessions.revoke(session.sessionToken);
    expect(await sessions.validate(session.sessionToken)).toBeNull();
  });

  it('rotates a session and invalidates the old one', async () => {
    const store = new InMemoryIdentityStore();
    const sessions = new SessionService(store, { idleTtlMs: 1000, absoluteTtlMs: 5000 });
    const account = await store.createAccount({
      id: randomUUID(),
      status: 'active',
      personEntityId: null,
      walletContractAddress: null,
    });
    const session = await sessions.create(account.id);
    const rotated = await sessions.rotate(session);
    expect(await sessions.validate(session.sessionToken)).toBeNull();
    expect(await sessions.validate(rotated.sessionToken)).not.toBeNull();
  });

  it('expires sessions by idle ttl', async () => {
    const store = new InMemoryIdentityStore();
    const sessions = new SessionService(store, { idleTtlMs: 1, absoluteTtlMs: 5000 });
    const account = await store.createAccount({
      id: randomUUID(),
      status: 'active',
      personEntityId: null,
      walletContractAddress: null,
    });
    const session = await sessions.create(account.id);
    await new Promise((r) => setTimeout(r, 10));
    expect(await sessions.validate(session.sessionToken)).toBeNull();
  });
});
