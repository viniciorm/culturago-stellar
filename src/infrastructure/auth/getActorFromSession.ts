import 'server-only';
import { cookies } from 'next/headers';
import { domainError } from '../../domain/errors';
import { getPublicConfig } from '../config/env';
import { ActorContext, createTestActor } from './actorContext';
import { createAuthBundle } from './factory';
import { resolveActor } from './resolveActor';

/**
 * Resolve the current actor from the session cookie.
 *
 * - In `demo` mode, returns a controlled test actor (server-side only).
 * - In `testnet`/`mainnet`, validates the session token server-side.
 *
 * Returns `null` when there is no valid session.
 */
export async function getActorFromSession(): Promise<ActorContext | null> {
  const publicConfig = getPublicConfig();
  if (publicConfig.environment === 'demo') {
    return createTestActor({ role: 'admin' });
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('culturago_session')?.value;
  if (!sessionToken) return null;

  try {
    const auth = createAuthBundle();
    const session = await auth.sessions.validate(sessionToken);
    if (!session) return null;
    return resolveActor(auth.store, session.accountId);
  } catch (error) {
    if (error instanceof Error) {
      console.error('[getActorFromSession] failed to resolve actor:', error.message);
    }
    return null;
  }
}

/**
 * Require a valid actor or throw an unauthorized domain error.
 */
export async function requireActorFromSession(): Promise<ActorContext> {
  const actor = await getActorFromSession();
  if (!actor) {
    throw domainError('UNAUTHORIZED', 'session required');
  }
  return actor;
}
