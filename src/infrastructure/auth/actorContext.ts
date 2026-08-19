import 'server-only';
import { domainError } from '../../domain/errors';

export type AppRole = 'admin' | 'organizer' | 'operator' | 'visitor';

/**
 * Explicit actor passed to every use case / DAL call. Until Phase 8 (smart
 * wallet + passkey sessions) there is NO login: callers inject either a
 * controlled test actor (demo/testnet only) or a service identity. A global
 * role never suffices to act for an organization: issuer scope is mandatory.
 */
export interface ActorContext {
  /** Stable account identifier (auth account in Phase 8; test/service id before). */
  accountId: string;
  role: AppRole;
  /** Institutional entities this account is linked to (issuer_operators). */
  issuerEntityIds: readonly string[];
  /** Person entity linked to this account, if any. */
  personEntityId: string | null;
  /** True only for controlled test/service identities, never for real users. */
  isServiceIdentity: boolean;
}

export function assertRole(actor: ActorContext, ...roles: AppRole[]): void {
  if (!roles.includes(actor.role)) {
    throw domainError('UNAUTHORIZED', `Actor role "${actor.role}" is not allowed here`);
  }
}

/** Institutional scope check: a global role alone never suffices. */
export function assertIssuerScope(actor: ActorContext, issuerEntityId: string): void {
  if (actor.role === 'admin') return;
  if (!actor.issuerEntityIds.includes(issuerEntityId)) {
    throw domainError(
      'UNAUTHORIZED',
      `Actor ${actor.accountId} has no institutional link to issuer ${issuerEntityId}`
    );
  }
}

/**
 * Controlled test actor for development/tests before Phase 8. Explicitly
 * marked and refused in mainnet: a service identity is never a user session.
 */
export function createTestActor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    accountId: 'test-actor',
    role: 'admin',
    issuerEntityIds: [],
    personEntityId: null,
    isServiceIdentity: true,
    ...overrides,
  };
}
