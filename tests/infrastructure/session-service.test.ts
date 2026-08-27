import { describe, expect, it, vi, beforeEach } from 'vitest';
import { InMemoryIdentityStore } from '@/infrastructure/auth/InMemoryIdentityStore';
import { SessionService, SessionConfig } from '@/infrastructure/auth/SessionService';

const config: SessionConfig = {
  idleTtlMs: 60 * 1000,
  absoluteTtlMs: 24 * 60 * 60 * 1000,
};

describe('SessionService', () => {
  let store: InMemoryIdentityStore;
  let service: SessionService;

  beforeEach(async () => {
    vi.useRealTimers();
    store = new InMemoryIdentityStore();
    service = new SessionService(store, config);
    await store.createAccount({
      id: 'acc-1',
      status: 'active',
      personEntityId: null,
      walletContractAddress: null,
    });
  });

  it('creates and validates a session', async () => {
    const session = await service.create('acc-1');
    expect(session.sessionToken).toBeTruthy();
    const validated = await service.validate(session.sessionToken);
    expect(validated).not.toBeNull();
    expect(validated?.accountId).toBe('acc-1');
  });

  it('returns null for an unknown or revoked token', async () => {
    const validated = await service.validate('unknown-token');
    expect(validated).toBeNull();

    const session = await service.create('acc-1');
    await service.revoke(session.sessionToken);
    expect(await service.validate(session.sessionToken)).toBeNull();
  });

  it('expires a session after idle TTL', async () => {
    vi.useFakeTimers();
    const session = await service.create('acc-1');
    vi.advanceTimersByTime(config.idleTtlMs + 1);
    expect(await service.validate(session.sessionToken)).toBeNull();
    vi.useRealTimers();
  });

  it('rotates a session and revokes the old token', async () => {
    const oldSession = await service.create('acc-1');
    const newSession = await service.rotate(oldSession);
    expect(await service.validate(oldSession.sessionToken)).toBeNull();
    expect(await service.validate(newSession.sessionToken)).not.toBeNull();
    expect(newSession.rotatedFrom).toBeDefined();
  });

  it('revokes all sessions for an account', async () => {
    const a = await service.create('acc-1');
    const b = await service.create('acc-1');
    await service.revokeAll('acc-1');
    expect(await service.validate(a.sessionToken)).toBeNull();
    expect(await service.validate(b.sessionToken)).toBeNull();
  });
});
