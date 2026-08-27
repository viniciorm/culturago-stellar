import { challenge_purpose, account_status } from '../domain/types/identity';

/** WebAuthn public-key credential. CulturaGO never holds private material. */
export interface PasskeyCredential {
  id: string;
  accountId: string;
  credentialId: string; // base64url WebAuthn credential ID
  publicKey: Buffer;     // COSE public key
  signCounter: number;
  displayName: string;
  transports: string[] | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface AuthChallenge {
  id: string;
  challenge: string; // original value for in-memory/test; DB stores digest
  purpose: challenge_purpose;
  accountId: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface Session {
  id: string;
  sessionToken: string; // original token for in-memory/test; DB stores digest
  accountId: string;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  rotatedFrom: string | null;
  revokedAt: Date | null;
}

export interface Account {
  id: string;
  status: account_status;
  personEntityId: string | null;
  walletContractAddress: string | null;
  createdAt: Date;
}

/**
 * Identity persistence port. Implementations must store only public WebAuthn
 * material, digests (never raw challenge/session tokens), and allow atomic
 * challenge consumption and session rotation.
 */
export interface IdentityStore {
  getAccount(accountId: string): Promise<Account | null>;
  findAccountByPerson(personEntityId: string): Promise<Account | null>;
  createAccount(account: Omit<Account, 'createdAt'>): Promise<Account>;
  updateAccountStatus(accountId: string, status: Account['status']): Promise<void>;
  updateAccountWalletContractAddress(accountId: string, walletContractAddress: string): Promise<void>;
  grantRole(accountId: string, role: string): Promise<void>;
  getRoles(accountId: string): Promise<string[]>;
  linkIssuerOperator(issuerEntityId: string, operatorAccountId: string): Promise<void>;
  getIssuerScopes(operatorAccountId: string): Promise<string[]>;

  // Challenges (anti-replay)
  createChallenge(challenge: Omit<AuthChallenge, 'consumedAt'>): Promise<void>;
  consumeChallenge(challengeDigest: string): Promise<AuthChallenge | null>;

  // Passkeys
  addPasskey(credential: Omit<PasskeyCredential, 'id' | 'createdAt'>): Promise<PasskeyCredential>;
  getPasskey(credentialId: string): Promise<PasskeyCredential | null>;
  listPasskeys(accountId: string): Promise<PasskeyCredential[]>;
  updatePasskeyCounter(credentialId: string, counter: number, lastUsedAt: Date): Promise<void>;
  revokePasskey(credentialId: string, reason: string): Promise<void>;

  // Sessions
  createSession(session: Omit<Session, 'id'>): Promise<Session>;
  getSession(sessionTokenDigest: string): Promise<Session | null>;
  rotateSession(oldSessionId: string, newSession: Omit<Session, 'id'>): Promise<void>;
  revokeSession(sessionTokenDigest: string): Promise<void>;
  revokeAllSessions(accountId: string): Promise<void>;
}
