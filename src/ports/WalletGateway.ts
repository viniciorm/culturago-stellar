/**
 * Wallet/passkey port. Claiming or recovering a passkey NEVER transfers or
 * rewrites credentials: it only binds an authenticator to a subject.
 */
export interface WalletChallenge {
  challengeId: string;
  subjectId: string;
  expiresAt: string;
}

export interface WalletBinding {
  subjectId: string;
  authenticatorId: string;
  boundAt: string;
}

export interface WalletGateway {
  createChallenge(subjectId: string): Promise<WalletChallenge>;
  verifyChallenge(challengeId: string, response: unknown): Promise<WalletBinding>;
}
