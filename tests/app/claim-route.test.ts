import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/claim/route';
import { ClaimService } from '@/infrastructure/auth/ClaimService';
import { createAuthBundle } from '@/infrastructure/auth/factory';

describe('/api/claim route', () => {
  const originalEnv: NodeJS.ProcessEnv = { ...process.env };

  beforeAll(() => {
    process.env.NEXT_PUBLIC_CULTURAGO_ENV = 'demo';
    process.env.STELLAR_WORKER_ENABLED = 'false';
  });

  afterAll(() => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it('creates a session for a valid claim code', async () => {
    const { store } = createAuthBundle();
    const account = await store.createAccount({
      id: 'acc-claim-1',
      status: 'pending_claim',
      personEntityId: null,
      walletContractAddress: null,
    });

    const claimService = new ClaimService(store);
    const code = await claimService.createClaimCode(account.id);

    const res = await POST(
      new Request('http://localhost/api/claim', {
        method: 'POST',
        body: JSON.stringify({ code }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accountId).toBe(account.id);

    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain('culturago_session');
  });

  it('rejects an invalid claim code', async () => {
    const res = await POST(
      new Request('http://localhost/api/claim', {
        method: 'POST',
        body: JSON.stringify({ code: 'not-a-real-code' }),
      })
    );

    expect(res.status).toBe(400);
  });
});
