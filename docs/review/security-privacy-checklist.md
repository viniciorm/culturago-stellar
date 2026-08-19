# Revisión de seguridad y privacidad — bloqueadores de Mainnet

## Identidad y autenticación

- [ ] WebAuthn server-side verificado con challenges one-time y anti-replay.
- [ ] No se custodian passkeys, biometría, seeds ni claves privadas.
- [ ] Sesiones `HttpOnly`/`Secure`/`SameSite`, rotación, revocación y CSRF probadas.
- [ ] Múltiples passkeys no crean otro `subject_id`.

## Autorización

- [ ] Una sesión válida sin rol/issuer scope/`IssuerOperator` no puede emitir/revocar.
- [ ] Suplantación entre organizaciones rechazada.
- [ ] Roles de aplicación verificados server-side en cada caso de uso.

## Smart wallet

- [ ] WASM hash allowlisted por red verificado antes de crear/conectar.
- [ ] Backend nunca firma por el usuario.
- [ ] Relayer/fees server-only si se aprueban; no conceden issuer scope.

## Datos y privacidad

- [ ] Hash canónico y medios verifican igual en TS y Rust.
- [ ] QR/PDF/JSON no filtran PII ni datos de sesión/passkey.
- [ ] Logs no contienen secretos, connection strings, cookies, challenges o respuestas WebAuthn.

## Infraestructura

- [ ] PostgreSQL sin puerto público, TLS, pool/timeouts acotados.
- [ ] Backup/restore verificado con RPO/RTO.
- [ ] HTTPS/certificados válidos para origins WebAuthn.

## Bloqueadores

Cualquier ítem marcado como bloqueador debe resolverse antes de aprobar el gate Mainnet.
