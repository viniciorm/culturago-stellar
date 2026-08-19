import 'server-only';
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
  const rpId = process.env.WEBAUTHN_RP_ID ?? 'localhost';
  const origin = process.env.WEBAUTHN_ORIGIN ?? 'http://localhost:3000';
  const store = new PostgreSQLIdentityStore();
  return {
    store,
    passkeys: new PasskeyService(store, rpId, origin),
    sessions: new SessionService(store),
  };
}
