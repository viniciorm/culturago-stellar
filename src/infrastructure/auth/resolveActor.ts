import 'server-only';
import { domainError } from '../../domain/errors';
import { ActorContext } from './actorContext';
import { IdentityStore } from '../../ports/IdentityStore';

/**
 * Resolve a validated session into an ActorContext. Roles and issuer scope
 * are always loaded server-side; a wallet address or session alone is never
 * sufficient for issuance/revocation.
 */
export async function resolveActor(
  store: IdentityStore,
  accountId: string
): Promise<ActorContext> {
  const account = await store.getAccount(accountId);
  if (!account) throw domainError('NOT_FOUND', `account ${accountId} not found`);
  if (account.status !== 'active') {
    throw domainError('UNAUTHORIZED', `account ${accountId} is ${account.status}`);
  }

  const roles = await store.getRoles(accountId);
  const issuerEntityIds = await store.getIssuerScopes(accountId);

  return {
    accountId: account.id,
    role: (roles[0] as ActorContext['role']) ?? 'visitor',
    issuerEntityIds,
    personEntityId: account.personEntityId,
    isServiceIdentity: false,
  };
}
