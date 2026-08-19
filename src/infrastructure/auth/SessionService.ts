import 'server-only';
import { createHash, randomBytes } from 'crypto';
import { domainError } from '../../domain/errors';
import { IdentityStore, Session } from '../../ports/IdentityStore';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export interface SessionConfig {
  idleTtlMs: number;
  absoluteTtlMs: number;
}

const DEFAULT_CONFIG: SessionConfig = {
  idleTtlMs: 15 * 60 * 1000,
  absoluteTtlMs: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Session service with opaque cookies. The server stores only a digest;
 * cookies are HttpOnly/Secure/SameSite=Lax/Path=/.
 */
export class SessionService {
  constructor(
    private readonly store: IdentityStore,
    private readonly config: SessionConfig = DEFAULT_CONFIG
  ) {}

  async create(accountId: string): Promise<Session> {
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    const session = await this.store.createSession({
      sessionToken: token,
      accountId,
      idleExpiresAt: new Date(now + this.config.idleTtlMs),
      absoluteExpiresAt: new Date(now + this.config.absoluteTtlMs),
      rotatedFrom: null,
      revokedAt: null,
    });
    return session;
  }

  async validate(sessionToken: string): Promise<Session | null> {
    const digest = sha256(sessionToken);
    const session = await this.store.getSession(digest);
    if (!session) return null;
    if (session.revokedAt) return null;
    if (session.idleExpiresAt.getTime() <= Date.now()) return null;
    if (session.absoluteExpiresAt.getTime() <= Date.now()) return null;
    return session;
  }

  async rotate(oldSession: Session): Promise<Session> {
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    const next: Omit<Session, 'id'> = {
      sessionToken: token,
      accountId: oldSession.accountId,
      idleExpiresAt: new Date(now + this.config.idleTtlMs),
      absoluteExpiresAt: oldSession.absoluteExpiresAt,
      rotatedFrom: sha256(oldSession.sessionToken),
      revokedAt: null,
    };
    await this.store.rotateSession(sha256(oldSession.sessionToken), next);
    const created = await this.store.getSession(sha256(token));
    if (!created) throw domainError('INTERNAL', 'failed to rotate session');
    return created;
  }

  async revoke(sessionToken: string): Promise<void> {
    await this.store.revokeSession(sha256(sessionToken));
  }

  async revokeAll(accountId: string): Promise<void> {
    await this.store.revokeAllSessions(accountId);
  }
}
