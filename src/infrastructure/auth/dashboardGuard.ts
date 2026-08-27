import 'server-only';
import { requireActorFromSession } from './getActorFromSession';
import { assertRole } from './actorContext';

/**
 * Require a valid session and enforce the admin role for dashboard CRUD.
 */
export async function requireDashboardAdmin() {
  const actor = await requireActorFromSession();
  assertRole(actor, 'admin');
  return actor;
}
