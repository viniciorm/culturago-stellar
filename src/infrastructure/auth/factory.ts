import 'server-only';
import { getPublicConfig } from '../config/env';
import { PasskeyService } from './PasskeyService';
import { SessionService } from './SessionService';
import { PostgreSQLIdentityStore } from './PostgreSQLIdentityStore';

export interface AuthBundle {
  store: PostgreSQLIdentityStore;
  passkeys: PasskeyService;
  sessions: SessionService;
}

/** Builds the identity stack from environment configuration. */
export function createAuthBundle(): AuthBundle {
  const environment = getPublicConfig().environment;
  const rawOrigins = process.env.WEBAUTHN_ORIGINS;
  const rpId = process.env.WEBAUTHN_RP_ID;

  if (environment !== 'demo' && (!rpId || !rawOrigins)) {
    throw new Error('WEBAUTHN_RP_ID and WEBAUTHN_ORIGINS are required for non-demo environment');
  }

  const resolvedRpId = rpId ?? 'localhost';
  const resolvedOrigins = rawOrigins
    ? rawOrigins.split(',').map((o) => o.trim()).filter(Boolean)
    : ['http://localhost:3000'];

  const store = new PostgreSQLIdentityStore();
  return {
    store,
    passkeys: new PasskeyService(store, resolvedRpId, resolvedOrigins),
    sessions: new SessionService(store),
  };
}
