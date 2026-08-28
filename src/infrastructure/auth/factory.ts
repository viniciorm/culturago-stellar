import 'server-only';
import { domainError } from '../../domain/errors';
import { IdentityStore } from '../../ports/IdentityStore';
import { getPublicConfig } from '../config/env';
import { PasskeyService } from './PasskeyService';
import { SessionService } from './SessionService';
import { PostgreSQLIdentityStore } from './PostgreSQLIdentityStore';
import { InMemoryIdentityStore } from './InMemoryIdentityStore';

export interface AuthBundle {
  store: IdentityStore;
  passkeys: PasskeyService;
  sessions: SessionService;
}

// Demo uses a single in-memory store so routes, sessions and tests that run
// without DATABASE_URL share the same identity state.
const demoStore = new InMemoryIdentityStore();

/** Builds the identity stack from environment configuration. */
export function createAuthBundle(): AuthBundle {
  const environment = getPublicConfig().environment;
  const rawOrigins = process.env.WEBAUTHN_ORIGINS;
  const rpId = process.env.WEBAUTHN_RP_ID;

  if (environment !== 'demo' && (!rpId || !rawOrigins)) {
    throw domainError('INVALID_INPUT', 'WEBAUTHN_RP_ID and WEBAUTHN_ORIGINS are required for non-demo environment');
  }

  const resolvedRpId = rpId ?? 'localhost';
  const resolvedOrigins = rawOrigins
    ? rawOrigins.split(',').map((o) => o.trim()).filter(Boolean)
    : ['http://localhost:3000'];

  const store = environment === 'demo' ? demoStore : new PostgreSQLIdentityStore();
  return {
    store,
    passkeys: new PasskeyService(store, resolvedRpId, resolvedOrigins),
    sessions: new SessionService(store),
  };
}
