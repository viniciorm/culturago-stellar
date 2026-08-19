import { createHash, randomUUID } from 'crypto';
import { domainError } from '../../domain/errors';
import { Account, AuthChallenge, IdentityStore, PasskeyCredential, Session } from '../../ports/IdentityStore';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** In-memory identity store for tests and local demo. */
export class InMemoryIdentityStore implements IdentityStore {
  private accounts = new Map<string, Account>();
  private roles = new Map<string, Set<string>>();
  private issuerScopes = new Map<string, Set<string>>();
  private challenges = new Map<string, AuthChallenge>();
  private passkeys = new Map<string, PasskeyCredential>();
  private sessions = new Map<string, Session>();

  async getAccount(accountId: string): Promise<Account | null> {
    return this.accounts.get(accountId) ?? null;
  }

  async findAccountByPerson(personEntityId: string): Promise<Account | null> {
    return [...this.accounts.values()].find((a) => a.personEntityId === personEntityId) ?? null;
  }

  async createAccount(account: Omit<Account, 'createdAt'>): Promise<Account> {
    if (this.accounts.has(account.id)) {
      throw domainError('ALREADY_EXISTS', `account ${account.id} already exists`);
    }
    const created: Account = { ...account, createdAt: new Date() };
    this.accounts.set(account.id, created);
    return created;
  }

  async updateAccountStatus(accountId: string, status: Account['status']): Promise<void> {
    const account = this.accounts.get(accountId);
    if (!account) throw domainError('NOT_FOUND', `account ${accountId} not found`);
    account.status = status;
  }

  async grantRole(accountId: string, role: string): Promise<void> {
    const roles = this.roles.get(accountId) ?? new Set<string>();
    roles.add(role);
    this.roles.set(accountId, roles);
  }

  async getRoles(accountId: string): Promise<string[]> {
    return [...(this.roles.get(accountId) ?? [])];
  }

  async linkIssuerOperator(issuerEntityId: string, operatorAccountId: string): Promise<void> {
    const scopes = this.issuerScopes.get(operatorAccountId) ?? new Set<string>();
    scopes.add(issuerEntityId);
    this.issuerScopes.set(operatorAccountId, scopes);
  }

  async getIssuerScopes(operatorAccountId: string): Promise<string[]> {
    return [...(this.issuerScopes.get(operatorAccountId) ?? [])];
  }

  async createChallenge(challenge: Omit<AuthChallenge, 'consumedAt'>): Promise<void> {
    const digest = sha256(challenge.challenge);
    if (this.challenges.has(digest)) {
      throw domainError('ALREADY_EXISTS', 'challenge digest collision');
    }
    this.challenges.set(digest, { ...challenge, consumedAt: null });
  }

  async consumeChallenge(challengeDigest: string): Promise<AuthChallenge | null> {
    const challenge = this.challenges.get(challengeDigest);
    if (!challenge) return null;
    if (challenge.consumedAt) return null;
    if (challenge.expiresAt.getTime() <= Date.now()) return null;
    challenge.consumedAt = new Date();
    return challenge;
  }

  async addPasskey(credential: Omit<PasskeyCredential, 'id' | 'createdAt'>): Promise<PasskeyCredential> {
    if (this.passkeys.has(credential.credentialId)) {
      throw domainError('ALREADY_EXISTS', `credential ${credential.credentialId} already registered`);
    }
    const created: PasskeyCredential = { ...credential, id: randomUUID(), createdAt: new Date() };
    this.passkeys.set(credential.credentialId, created);
    return created;
  }

  async getPasskey(credentialId: string): Promise<PasskeyCredential | null> {
    return this.passkeys.get(credentialId) ?? null;
  }

  async listPasskeys(accountId: string): Promise<PasskeyCredential[]> {
    return [...this.passkeys.values()].filter((p) => p.accountId === accountId && !p.revokedAt);
  }

  async updatePasskeyCounter(credentialId: string, counter: number, lastUsedAt: Date): Promise<void> {
    const passkey = this.passkeys.get(credentialId);
    if (!passkey) throw domainError('NOT_FOUND', `passkey ${credentialId} not found`);
    passkey.signCounter = counter;
    passkey.lastUsedAt = lastUsedAt;
  }

  async revokePasskey(credentialId: string, reason: string): Promise<void> {
    const passkey = this.passkeys.get(credentialId);
    if (!passkey) throw domainError('NOT_FOUND', `passkey ${credentialId} not found`);
    passkey.revokedAt = new Date();
    // Store revoked reason in the record for audit (not in public type yet).
    (passkey as unknown as Record<string, string>).revokedReason = reason;
  }

  async createSession(session: Omit<Session, 'id'>): Promise<Session> {
    const digest = sha256(session.sessionToken);
    if (this.sessions.has(digest)) {
      throw domainError('ALREADY_EXISTS', 'session token collision');
    }
    const created: Session = { ...session, id: randomUUID() };
    this.sessions.set(digest, created);
    return created;
  }

  async getSession(sessionTokenDigest: string): Promise<Session | null> {
    return this.sessions.get(sessionTokenDigest) ?? null;
  }

  async rotateSession(oldSessionId: string, newSession: Omit<Session, 'id'>): Promise<void> {
    // oldSessionId is already the digest of the previous token.
    const old = this.sessions.get(oldSessionId);
    if (old) {
      old.revokedAt = new Date();
    }
    const newDigest = sha256(newSession.sessionToken);
    const created: Session = { ...newSession, id: randomUUID(), rotatedFrom: oldSessionId };
    this.sessions.set(newDigest, created);
  }

  async revokeSession(sessionTokenDigest: string): Promise<void> {
    const session = this.sessions.get(sessionTokenDigest);
    if (session) session.revokedAt = new Date();
  }

  async revokeAllSessions(accountId: string): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.accountId === accountId) session.revokedAt = new Date();
    }
  }
}
