import { createHash, randomUUID } from 'crypto';
import { domainError } from '../../domain/errors';
import { Account, AuthChallenge, IdentityStore, PasskeyCredential, Session, SmartWalletClaim, WalletRecord } from '../../ports/IdentityStore';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** In-memory identity store for tests and local demo. */
export class InMemoryIdentityStore implements IdentityStore {
  private accounts = new Map<string, Account>();
  private roles = new Map<string, Set<string>>();
  private issuerScopes = new Map<string, Set<string>>();
  private challenges = new Map<string, AuthChallenge>();
  private passkeys = new Map<string, PasskeyCredential>();
  private sessions = new Map<string, Session>();
  private smartWalletClaims = new Map<string, SmartWalletClaim>();
  private wallets = new Map<string, WalletRecord>();

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

  async updateAccountWalletContractAddress(accountId: string, walletContractAddress: string): Promise<void> {
    const account = this.accounts.get(accountId);
    if (!account) throw domainError('NOT_FOUND', `account ${accountId} not found`);
    account.walletContractAddress = walletContractAddress;
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

  async unlinkIssuerOperator(issuerEntityId: string, operatorAccountId: string): Promise<void> {
    const scopes = this.issuerScopes.get(operatorAccountId);
    if (scopes) {
      scopes.delete(issuerEntityId);
    }
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

  async saveSmartWalletClaim(claim: {
    accountId: string;
    entityId: string;
    contractId: string;
    keyId?: string | null;
    walletWasmHash?: string | null;
    network?: string;
    deployTxHash?: string | null;
    deployedAt?: Date | null;
  }): Promise<SmartWalletClaim> {
    const record: SmartWalletClaim = {
      id: randomUUID(),
      accountId: claim.accountId,
      entityId: claim.entityId,
      contractId: claim.contractId,
      keyId: claim.keyId ?? null,
      walletWasmHash: claim.walletWasmHash ?? null,
      network: claim.network ?? 'testnet',
      deployTxHash: claim.deployTxHash ?? null,
      deployedAt: claim.deployedAt ?? new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.smartWalletClaims.set(claim.contractId, record);
    return record;
  }

  async getSmartWalletClaimByAccount(accountId: string): Promise<SmartWalletClaim | null> {
    return [...this.smartWalletClaims.values()].find((c) => c.accountId === accountId) ?? null;
  }

  async upsertWallet(wallet: {
    entityId: string;
    walletAddress: string;
    walletType: WalletRecord['walletType'];
    walletStatus: WalletRecord['walletStatus'];
    claimedAt?: Date | null;
  }): Promise<WalletRecord> {
    const existing = this.wallets.get(wallet.entityId);
    if (existing) {
      existing.walletAddress = wallet.walletAddress;
      existing.walletType = wallet.walletType;
      existing.walletStatus = wallet.walletStatus;
      existing.claimedAt = wallet.claimedAt ?? new Date();
      existing.updatedAt = new Date();
      return existing;
    }
    const created: WalletRecord = {
      id: randomUUID(),
      entityId: wallet.entityId,
      walletAddress: wallet.walletAddress,
      walletType: wallet.walletType,
      walletStatus: wallet.walletStatus,
      claimedAt: wallet.claimedAt ?? new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.wallets.set(wallet.entityId, created);
    return created;
  }

  async getWalletByEntity(entityId: string): Promise<WalletRecord | null> {
    return this.wallets.get(entityId) ?? null;
  }
}
