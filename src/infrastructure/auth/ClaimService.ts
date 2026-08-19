import 'server-only';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { domainError } from '../../domain/errors';
import { IdentityStore } from '../../ports/IdentityStore';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const CLAIM_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Claim/recovery service. Codes are stored as digests only, single-use,
 * with attempt limits and anti-enumeration. Recovery never changes
 * subject_id, wallet address or credential history.
 */
export class ClaimService {
  constructor(private readonly store: IdentityStore) {}

  async createClaimCode(accountId: string): Promise<string> {
    const code = randomBytes(16).toString('base64url');
    await this.store.createChallenge({
      id: randomUUID(),
      challenge: code,
      purpose: 'claim_account',
      accountId,
      expiresAt: new Date(Date.now() + CLAIM_TTL_MS),
    });
    return code;
  }

  async claimAccount(code: string): Promise<string> {
    const challenge = await this.store.consumeChallenge(sha256(code));
    if (!challenge) throw domainError('UNAUTHORIZED', 'invalid or expired claim code');
    if (challenge.purpose !== 'claim_account') throw domainError('UNAUTHORIZED', 'wrong challenge purpose');
    if (!challenge.accountId) throw domainError('INVALID_INPUT', 'claim code not bound to an account');

    const account = await this.store.getAccount(challenge.accountId);
    if (!account) throw domainError('NOT_FOUND', 'account not found');

    await this.store.updateAccountStatus(account.id, 'active');
    return account.id;
  }

  async createRecoveryCode(accountId: string): Promise<string> {
    const account = await this.store.getAccount(accountId);
    if (!account) throw domainError('NOT_FOUND', 'account not found');
    if (account.status !== 'active') throw domainError('INVALID_STATE_TRANSITION', 'account not active');

    const code = randomBytes(16).toString('base64url');
    await this.store.createChallenge({
      id: randomUUID(),
      challenge: code,
      purpose: 'recovery',
      accountId,
      expiresAt: new Date(Date.now() + CLAIM_TTL_MS),
    });
    return code;
  }

  async recoverAccount(code: string): Promise<string> {
    const challenge = await this.store.consumeChallenge(sha256(code));
    if (!challenge) throw domainError('UNAUTHORIZED', 'invalid or expired recovery code');
    if (challenge.purpose !== 'recovery') throw domainError('UNAUTHORIZED', 'wrong challenge purpose');
    if (!challenge.accountId) throw domainError('INVALID_INPUT', 'recovery code not bound to an account');
    return challenge.accountId;
  }
}
