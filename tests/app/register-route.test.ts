import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { POST as postOptions } from '@/app/api/auth/register/options/route';
import { POST as postVerify } from '@/app/api/auth/register/verify/route';
import { createAuthBundle } from '@/infrastructure/auth/factory';

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CULTURAGO_ENV = 'demo';
  process.env.STELLAR_WORKER_ENABLED = 'false';
});

vi.mock('@simplewebauthn/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simplewebauthn/server')>();
  return {
    ...actual,
    generateRegistrationOptions: vi.fn(),
    verifyRegistrationResponse: vi.fn(),
  };
});

function clientDataJSON(challenge: string): string {
  return Buffer.from(JSON.stringify({ challenge, origin: 'http://localhost:3000' })).toString('base64url');
}

function registrationResponse(credentialId: string, challenge: string): RegistrationResponseJSON {
  return {
    id: credentialId,
    rawId: credentialId,
    response: {
      clientDataJSON: clientDataJSON(challenge),
      attestationObject: 'attestation',
    },
    type: 'public-key',
    clientExtensionResults: {},
    authenticatorAttachment: 'platform',
  } as RegistrationResponseJSON;
}

describe('/api/auth/register route', () => {
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

  it('returns registration options for the session actor', async () => {
    const { store } = createAuthBundle();
    await store.createAccount({
      id: 'test-actor',
      status: 'active',
      personEntityId: null,
      walletContractAddress: null,
    });

    const challenge = 'register-challenge';
    vi.mocked(generateRegistrationOptions).mockResolvedValue({
      challenge,
      user: { id: 'u', name: 'test-actor', displayName: 'Test' },
      excludeCredentials: [],
    } as never);

    const res = await postOptions(
      new Request('http://localhost/api/auth/register/options', {
        method: 'POST',
        body: JSON.stringify({ accountId: 'test-actor', displayName: 'Test' }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.challenge).toBe(challenge);
  });

  it('rejects registration when the account does not match the session', async () => {
    const res = await postOptions(
      new Request('http://localhost/api/auth/register/options', {
        method: 'POST',
        body: JSON.stringify({ accountId: 'other-actor', displayName: 'Test' }),
      })
    );

    expect(res.status).toBe(401);
  });

  it('verifies a registration and returns the credential id', async () => {
    const { store } = createAuthBundle();
    const existing = await store.getAccount('test-actor');
    if (!existing) {
      await store.createAccount({
        id: 'test-actor',
        status: 'active',
        personEntityId: null,
        walletContractAddress: null,
      });
    }

    const challenge = 'verify-register-challenge';
    vi.mocked(generateRegistrationOptions).mockResolvedValue({
      challenge,
      user: { id: 'u', name: 'test-actor', displayName: 'Test' },
      excludeCredentials: [],
    } as never);

    await postOptions(
      new Request('http://localhost/api/auth/register/options', {
        method: 'POST',
        body: JSON.stringify({ accountId: 'test-actor', displayName: 'Test' }),
      })
    );

    vi.mocked(verifyRegistrationResponse).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'cred-register',
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
          transports: [],
        },
      },
    } as never);

    const res = await postVerify(
      new Request('http://localhost/api/auth/register/verify', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'test-actor',
          response: registrationResponse('cred-register', challenge),
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.credentialId).toBe('cred-register');
  });
});
