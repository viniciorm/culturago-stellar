import 'server-only';
import { createHash, randomUUID } from 'crypto';
import { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { domainError } from '../../domain/errors';
import { IdentityStore } from '../../ports/IdentityStore';

const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const RP_NAME = 'CulturaGO';

/**
 * WebAuthn service. The server never receives or stores the private key:
 * only the public key, credential id and sign counter are persisted.
 * Challenges are single-use and short-lived.
 */
export class PasskeyService {
  constructor(
    private readonly store: IdentityStore,
    private readonly rpId: string,
    private readonly expectedOrigins: readonly string[]
  ) {}

  async startRegistration(accountId: string, displayName: string) {
    const account = await this.store.getAccount(accountId);
    if (!account) throw domainError('NOT_FOUND', `account ${accountId} not found`);

    const existing = await this.store.listPasskeys(accountId);
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: this.rpId,
      userName: accountId,
      userDisplayName: displayName,
      excludeCredentials: existing.map((c) => ({
        id: c.credentialId,
        transports: c.transports as AuthenticatorTransportFuture[] | undefined,
      })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
      attestationType: 'none',
    });

    await this.store.createChallenge({
      id: randomUUID(),
      challenge: options.challenge,
      purpose: 'register_passkey',
      accountId,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    });

    return options;
  }

  async finishRegistration(accountId: string, response: Parameters<typeof verifyRegistrationResponse>[0]['response']) {
    const extractedChallenge = this.extractChallenge(response.response.clientDataJSON);
    const challengeDigest = sha256Hex(extractedChallenge);
    const challenge = await this.store.consumeChallenge(challengeDigest);
    if (!challenge) throw domainError('UNAUTHORIZED', 'challenge expired, consumed or replayed');
    if (challenge.purpose !== 'register_passkey') throw domainError('UNAUTHORIZED', 'wrong challenge purpose');
    if (challenge.accountId !== accountId) throw domainError('UNAUTHORIZED', 'challenge does not match account');

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: extractedChallenge,
      expectedOrigin: [...this.expectedOrigins],
      expectedRPID: this.rpId,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw domainError('UNAUTHORIZED', 'WebAuthn registration verification failed');
    }

    const { credential } = verification.registrationInfo;
    const passkey = await this.store.addPasskey({
      accountId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      signCounter: credential.counter,
      displayName: 'Passkey',
      transports: credential.transports ?? null,
      lastUsedAt: new Date(),
      revokedAt: null,
    });
    return passkey;
  }

  async startAuthentication(accountId: string) {
    const passkeys = await this.store.listPasskeys(accountId);
    if (passkeys.length === 0) throw domainError('NOT_FOUND', 'no active passkeys for account');

    const options = await generateAuthenticationOptions({
      rpID: this.rpId,
      allowCredentials: passkeys.map((c) => ({
        id: c.credentialId,
        transports: c.transports as AuthenticatorTransportFuture[] | undefined,
      })),
      userVerification: 'preferred',
    });

    await this.store.createChallenge({
      id: randomUUID(),
      challenge: options.challenge,
      purpose: 'authenticate',
      accountId,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    });

    return options;
  }

  async finishAuthentication(response: Parameters<typeof verifyAuthenticationResponse>[0]['response']) {
    const extractedChallenge = this.extractChallenge(response.response.clientDataJSON);
    const challengeDigest = sha256Hex(extractedChallenge);
    const challenge = await this.store.consumeChallenge(challengeDigest);
    if (!challenge) throw domainError('UNAUTHORIZED', 'challenge expired, consumed or replayed');
    if (challenge.purpose !== 'authenticate') throw domainError('UNAUTHORIZED', 'wrong challenge purpose');

    const passkey = await this.store.getPasskey(response.id);
    if (!passkey || passkey.revokedAt) throw domainError('UNAUTHORIZED', 'unknown or revoked credential');

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: extractedChallenge,
      expectedOrigin: [...this.expectedOrigins],
      expectedRPID: this.rpId,
      credential: {
        id: passkey.credentialId,
        publicKey: Uint8Array.from(passkey.publicKey),
        counter: passkey.signCounter,
        transports: passkey.transports as AuthenticatorTransportFuture[] | undefined,
      },
    });

    if (!verification.verified) {
      throw domainError('UNAUTHORIZED', 'WebAuthn authentication verification failed');
    }

    await this.store.updatePasskeyCounter(passkey.credentialId, verification.authenticationInfo.newCounter, new Date());
    return passkey.accountId;
  }

  private extractChallenge(clientDataJSON: string): string {
    const data = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf-8')) as { challenge: string };
    return data.challenge;
  }
}
