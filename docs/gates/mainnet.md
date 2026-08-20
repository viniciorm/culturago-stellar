# Gate Mainnet — acción separada y explícitamente autorizada

## Precondiciones

- [ ] Testnet smoke completo pasó con readback y sin errores.
- [ ] `docs/review/security-privacy-checklist.md` sin bloqueadores abiertos.
- [ ] `docs/runbooks/postgres-restore.md` ejecutado y evidencia registrada.
- [x] `docs/decisions/upgradeability.md` aprobada.
- [ ] Manifiesto Testnet (`docs/manifests/testnet-manifest.json`) con IDs/ledgers reales.
- [ ] Allowlist WASM de smart wallet para Mainnet revisada y registrada.
- [ ] Backup/restore PostgreSQL de producción verificado.
- [ ] Aprobación humana explícita registrada.

## Acción de despliegue

1. `pnpm install --frozen-lockfile && pnpm build && pnpm test`
2. `cargo fmt --check && cargo clippy --all-targets --all-features && cargo test`
3. `stellar contract build --manifest-path contracts/Cargo.toml --locked`
4. Verificar checksums WASM contra el manifiesto.
5. Desplegar únicamente tras aprobación y con rollback plan listo.

## Prohibiciones

- Nunca ejecutar este gate desde CI sin aprobación humana.
- Nunca reutilizar un signer Testnet en Mainnet.
- Nunca desplegar sin evidencia de restore reciente.
