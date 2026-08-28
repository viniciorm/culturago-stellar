import { describe, expect, it, vi, beforeEach } from 'vitest';
import { InMemoryIdentityStore } from '@/infrastructure/auth/InMemoryIdentityStore';
import { PasskeyService } from '@/infrastructure/auth/PasskeyService';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';

vi.mock('@simplewebauthn/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simplewebauthn/server')>();
  return {
    ...actual,
    generateRegistrationOptions: vi.fn(),
    generateAuthenticationOptions: vi.fn(),
    verifyRegistrationResponse: vi.fn(),
    verifyAuthenticationResponse: vi.fn(),
  };
});

const rpId = 'localhost';
const origin = 'http://localhost:3000';

function makeClientDataJSON(challenge: string): string {
  return Buffer.from(JSON.stringify({ challenge, origin })).toString('base64url');
}

function makeRegistrationResponse(
  credentialId: string,
  challenge: string
): RegistrationResponseJSON {
  return {
    id: credentialId,
    rawId: credentialId,
    response: {
      clientDataJSON: makeClientDataJSON(challenge),
      attestationObject: 'attestation',
    },
    type: 'public-key',
    clientExtensionResults: {},
    authenticatorAttachment: 'platform',
  } as RegistrationResponseJSON;
}

function makeAuthenticationResponse(credentialId: string, challenge: string): AuthenticationResponseJSON {
  return {
    id: credentialId,
    rawId: credentialId,
    response: {
      clientDataJSON: makeClientDataJSON(challenge),
      authenticatorData: 'authdata',
      signature: 'sig',
      userHandle: 'user-id',
    },
    type: 'public-key',
    clientExtensionResults: {},
  } as AuthenticationResponseJSON;
}

describe('PasskeyService', () => {
  let store: InMemoryIdentityStore;
  let service: PasskeyService;

  beforeEach(() => {
    vi.resetAllMocks();
    store = new InMemoryIdentityStore();
    service = new PasskeyService(store, rpId, [origin]);
  });

  it('registers a passkey, authenticates with it, and updates the sign counter', async () => {
    const account = await store.createAccount({
      id: 'acc-1',
      status: 'active',
      personEntityId: null,
      walletContractAddress: null,
    });

    const regChallenge = 'registration-challenge';
    vi.mocked(generateRegistrationOptions).mockResolvedValue({
      challenge: regChallenge,
      user: { id: 'user-id', name: account.id, displayName: 'Test' },
      excludeCredentials: [],
    } as never);

    vi.mocked(verifyRegistrationResponse).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'cred-1',
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
          transports: ['hybrid'],
        },
      },
    } as never);

    await service.startRegistration(account.id, 'Test');
    const registered = await service.finishRegistration(account.id, makeRegistrationResponse('cred-1', regChallenge));
    expect(registered.credentialId).toBe('cred-1');

    const authChallenge = 'authentication-challenge';
    vi.mocked(generateAuthenticationOptions).mockResolvedValue({
      challenge: authChallenge,
      allowCredentials: [{ id: 'cred-1', transports: ['hybrid'] as never }],
    } as never);

    vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 1 },
    } as never);

    await service.startAuthentication(account.id);
    const authenticatedAccountId = await service.finishAuthentication(makeAuthenticationResponse('cred-1', authChallenge));
    expect(authenticatedAccountId).toBe(account.id);

    const updated = await store.getPasskey('cred-1');
    expect(updated).not.toBeNull();
    expect(updated?.signCounter).toBe(1);
  });

  it('rejects a consumed or mismatched challenge', async () => {
    const account = await store.createAccount({
      id: 'acc-2',
      status: 'active',
      personEntityId: null,
      walletContractAddress: null,
    });

    const challenge = 'single-use';
    vi.mocked(generateRegistrationOptions).mockResolvedValue({
      challenge,
      user: { id: 'u', name: 'a', displayName: 'A' },
      excludeCredentials: [],
    } as never);
    vi.mocked(verifyRegistrationResponse).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'c2',
          publicKey: new Uint8Array([4]),
          counter: 0,
          transports: [],
        },
      },
    } as never);

    await service.startRegistration(account.id, 'A');
    const response = makeRegistrationResponse('c2', challenge);
    await service.finishRegistration(account.id, response);
    await expect(service.finishRegistration(account.id, response)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('excludes existing passkeys when registering an additional one (step-up)', async () => {
    const account = await store.createAccount({
      id: 'acc-4',
      status: 'active',
      personEntityId: null,
      walletContractAddress: null,
    });

    const firstChallenge = 'first-passkey-challenge';
    vi.mocked(generateRegistrationOptions).mockResolvedValue({
      challenge: firstChallenge,
      user: { id: 'u4', name: account.id, displayName: 'First' },
      excludeCredentials: [],
    } as never);

    vi.mocked(verifyRegistrationResponse).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'cred-first',
          publicKey: new Uint8Array([4]),
          counter: 0,
          transports: ['hybrid'],
        },
      },
    } as never);

    await service.startRegistration(account.id, 'First');
    await service.finishRegistration(account.id, makeRegistrationResponse('cred-first', firstChallenge));

    const secondChallenge = 'second-passkey-challenge';
    vi.mocked(generateRegistrationOptions).mockResolvedValue({
      challenge: secondChallenge,
      user: { id: 'u4', name: account.id, displayName: 'Second' },
      excludeCredentials: [],
    } as never);

    await service.startRegistration(account.id, 'Second');
    const lastCall = vi.mocked(generateRegistrationOptions).mock.calls.at(-1)?.[0];
    expect(lastCall?.excludeCredentials).toEqual([{ id: 'cred-first', transports: ['hybrid'] }]);
  });

  it('rejects authentication when there are no active passkeys for account', async () => {
    const account = await store.createAccount({
      id: 'acc-3',
      status: 'active',
      personEntityId: null,
      walletContractAddress: null,
    });

    await expect(service.startAuthentication(account.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
