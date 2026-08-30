import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { POST as postOptions } from '@/app/api/auth/login/options/route';
import { POST as postVerify } from '@/app/api/auth/login/verify/route';
import { createAuthBundle } from '@/infrastructure/auth/factory';

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CULTURAGO_ENV = 'demo';
  process.env.STELLAR_WORKER_ENABLED = 'false';
});

vi.mock('@simplewebauthn/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simplewebauthn/server')>();
  return {
    ...actual,
    generateAuthenticationOptions: vi.fn(),
    verifyAuthenticationResponse: vi.fn(),
  };
});

function clientDataJSON(challenge: string): string {
  return Buffer.from(JSON.stringify({ challenge, origin: 'http://localhost:3000' })).toString('base64url');
}

function authenticationResponse(credentialId: string, challenge: string): AuthenticationResponseJSON {
  return {
    id: credentialId,
    rawId: credentialId,
    response: {
      clientDataJSON: clientDataJSON(challenge),
      authenticatorData: 'auth-data',
      signature: 'signature',
      userHandle: 'user-handle',
    },
    type: 'public-key',
    clientExtensionResults: {},
    authenticatorAttachment: 'platform',
  } as AuthenticationResponseJSON;
}

describe('/api/auth/login route', () => {
  const originalEnv: NodeJS.ProcessEnv = { ...process.env };

  beforeAll(() => {
    process.env.NEXT_PUBLIC_CULTURAGO_ENV = 'demo';
    process.env.STELLAR_WORKER_ENABLED = 'false';
    vi.resetAllMocks();
  });

  afterAll(() => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  async function seedAccountWithPasskey(accountId: string, credentialId: string) {
    const { store } = createAuthBundle();
    await store.createAccount({
      id: accountId,
      status: 'active',
      personEntityId: null,
      walletContractAddress: null,
    });
    await store.addPasskey({
      accountId,
      credentialId,
      publicKey: Buffer.from([1, 2, 3]),
      signCounter: 0,
      displayName: 'Test',
      transports: null,
      lastUsedAt: new Date(),
      revokedAt: null,
    });
  }

  it('returns options for an account with passkeys', async () => {
    await seedAccountWithPasskey('login-actor', 'cred-login');
    vi.mocked(generateAuthenticationOptions).mockResolvedValue({
      challenge: 'login-challenge',
      allowCredentials: [{ id: 'cred-login', type: 'public-key' }],
    } as never);

    const res = await postOptions(
      new Request('http://localhost/api/auth/login/options', {
        method: 'POST',
        body: JSON.stringify({ accountId: 'login-actor' }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.challenge).toBe('login-challenge');
  });

  it('returns a generic error for a non-existent account', async () => {
    const res = await postOptions(
      new Request('http://localhost/api/auth/login/options', {
        method: 'POST',
        body: JSON.stringify({ accountId: 'no-such-actor' }),
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid authentication request');
  });

  it('returns a generic error for an account with no passkeys', async () => {
    const { store } = createAuthBundle();
    await store.createAccount({
      id: 'login-no-passkey',
      status: 'active',
      personEntityId: null,
      walletContractAddress: null,
    });

    const res = await postOptions(
      new Request('http://localhost/api/auth/login/options', {
        method: 'POST',
        body: JSON.stringify({ accountId: 'login-no-passkey' }),
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid authentication request');
  });

  it('returns a generic error and no session for an invalid authentication response', async () => {
    await seedAccountWithPasskey('login-bad-response', 'cred-login-bad');
    vi.mocked(generateAuthenticationOptions).mockResolvedValue({
      challenge: 'bad-login-challenge',
      allowCredentials: [{ id: 'cred-login-bad', type: 'public-key' }],
    } as never);

    const res = await postVerify(
      new Request('http://localhost/api/auth/login/verify', {
        method: 'POST',
        body: JSON.stringify({
          response: authenticationResponse('cred-login-bad', 'bad-login-challenge'),
        }),
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid authentication response');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('creates a session for a valid authentication response', async () => {
    await seedAccountWithPasskey('login-valid', 'cred-login-valid');
    const challenge = 'valid-login-challenge';
    vi.mocked(generateAuthenticationOptions).mockResolvedValue({
      challenge,
      allowCredentials: [{ id: 'cred-login-valid', type: 'public-key' }],
    } as never);

    await postOptions(
      new Request('http://localhost/api/auth/login/options', {
        method: 'POST',
        body: JSON.stringify({ accountId: 'login-valid' }),
      })
    );

    vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 1 },
    } as never);

    const res = await postVerify(
      new Request('http://localhost/api/auth/login/verify', {
        method: 'POST',
        body: JSON.stringify({
          response: authenticationResponse('cred-login-valid', challenge),
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accountId).toBe('login-valid');
    expect(res.headers.get('set-cookie')).toContain('culturago_session');
  });
});
