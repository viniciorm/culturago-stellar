# Fases del Proyecto — CulturaGO

```yaml
proyecto: culturago-stellar
fase_actual: 2
estado_fase: completada
entorno: stellar-testnet
mutations_enabled: false
```

## Estado de Fases

### Fase 1: Importación y Normalización Estructural Piloto FDVC 2026 (Completada)
- Carga de 30 presentaciones normalizadas (12 solistas, 18 grupales) desde `data/culturago_fdvc2026_exportacion.txt`.
- Creación idempotente en PostgreSQL de 22 personas, 17 escuelas, 18 grupos, 69 relaciones y 30 participaciones.
- Verificación de casos emblemáticos (Priscilla Bellydancer como entidad unificada, separación entre organización y grupo en Tribu Raks El Hob, Mahaila, Casandra, Farida Warda, Shazadi, Habibi Danza).

### Fase 2: Atribución de Contactos Operacionales de Inscripción (Completada)
- Adición e indexación de columnas `presentation_code`, `registration_email` y `credential_delivery_email` a nivel de `participations` (migración 0013 aplicada idempotentemente).
- Mapeo y actualización verificada del 100% de correos operacionales (30/30 presentaciones confirmadas, 0 pendientes).
- Guardrails preservados estrictamente (`CULTURAGO_ALLOW_TESTNET_MUTATIONS=false`, 0 nuevas cuentas, 0 passkeys, 0 wallets, 0 credenciales on-chain, 0 transacciones Stellar).
- **Taxonomía de Credenciales Oficial en Lore**: Definición e incorporación en Lore del modelo tripartite (`participant`, `guest`, `staff`), sus modalidades escénicas (`solo`, `group`, `not_applicable`), roles contextuales y títulos visuales antes de iniciar diseño de plantillas o UI.

### Fase 3: Roster y Certificados Individuales para Bailarinas Grupales (Planificada)
- Modelado de relación `performed_in` para registrar el elenco nominal de cada presentación grupal.
- Diferenciación explícita entre rol directivo (`director_of` / `teacher_at`) y rol de intérprete en escenario (`performed_in`), respetando el caso Samaira.
- Emisión de certificados digitales individuales a bailarinas de los 18 grupos y ballets bajo la familia `participant` (o `guest` según corresponda).

### Fase 4: Preparación y Emisión de Credenciales Piloto (Pausada)
- Integración de Smart Wallets y emisión de credenciales en Stellar Testnet previa aprobación de Marcos.
- PR #6 en pausa hasta instrucción explícita de Marcos.
