# Revisión de seguridad y privacidad — bloqueadores de Mainnet

## Identidad y autenticación

- [x] WebAuthn server-side verificado con challenges one-time y anti-replay.
- [x] No se custodian passkeys, biometría, seeds ni claves privadas.
- [x] Sesiones `HttpOnly`/`Secure`/`SameSite`, rotación, revocación y CSRF probadas.
- [x] Múltiples passkeys no crean otro `subject_id`.

## Autorización

- [x] Una sesión válida sin rol/issuer scope/`IssuerOperator` no puede emitir/revocar.
- [x] Suplantación entre organizaciones rechazada.
- [x] Roles de aplicación verificados server-side en cada caso de uso.

## Smart wallet

- [ ] WASM hash allowlisted por red verificado antes de crear/conectar.
- [x] Backend nunca firma por el usuario.
- [ ] Relayer/fees server-only si se aprueban; no conceden issuer scope.

## Datos y privacidad

- [x] Hash canónico y medios verifican igual en TS y Rust.
- [x] QR/PDF/JSON no filtran PII ni datos de sesión/passkey.
- [x] Logs no contienen secretos, connection strings, cookies, challenges o respuestas WebAuthn.

## Infraestructura

- [ ] PostgreSQL sin puerto público, TLS, pool/timeouts acotados.
- [ ] Backup/restore verificado con RPO/RTO.
- [ ] HTTPS/certificados válidos para origins WebAuthn.

## Bloqueadores

Cualquier ítem marcado como bloqueador debe resolverse antes de aprobar el gate Mainnet.
