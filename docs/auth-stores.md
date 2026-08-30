# Auth store boundaries

## Goal

Keep identity, session, passkey and wallet data inside a single persistence boundary.
No route should construct a store implementation directly except through the factory.

## Store implementations

- `InMemoryIdentityStore` — used only in `demo` and in unit tests.
- `PostgreSQLIdentityStore` — used in `testnet` and `mainnet`.

## Factory

`createAuthBundle()` in `src/infrastructure/auth/factory.ts` is the only production
entry point. It selects the store based on `NEXT_PUBLIC_CULTURAGO_ENV`:

- `demo`: returns a module-level singleton in-memory store so tests and local routes
  share the same identity state without `DATABASE_URL`.
- `testnet` / `mainnet`: returns a PostgreSQL store.

## Boundaries

- `src/app/api/claim/route.ts`, `src/app/api/auth/register/*` and
  `src/app/api/auth/login/*` all use `createAuthBundle()`.
- `src/app/api/auth/me/route.ts` uses `createAuthBundle()`.
- `src/app/api/recovery/route.ts` currently creates `new PostgreSQLIdentityStore()`
  directly and does not issue a session. It is a known boundary violation and
  should be reconciled with the factory before production.
- `InMemoryIdentityStore` stores raw session tokens and challenges only in tests/demo.
  PostgreSQL stores digests, never raw values.

## Anti-enumeration rules

- Claim, login and register routes must return the same generic 400/401 message
  for invalid codes, missing accounts, consumed challenges, wrong challenge purpose
  and mismatched actors.
- The actor is always derived from the session cookie; a request body `accountId`
  is never trusted to select the actor.
