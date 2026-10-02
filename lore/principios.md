# Principios Invariantes — CulturaGO

## Invariante 1: Cero Custodia Criptográfica
CulturaGO no almacena ni custodia claves privadas ni semillas. La autenticación y firma se realizan en el cliente mediante WebAuthn / Passkeys contra Smart Wallets en Soroban (Stellar). Todo cambio en este perímetro requiere revisión de seguridad especializada.

## Invariante 2: Aislamiento en Stellar Testnet durante el Piloto
Durante la etapa de validación del piloto FDVC 2026:
- Las operaciones on-chain se limitan a Stellar Testnet.
- El valor predeterminado del sistema es `CULTURAGO_ALLOW_TESTNET_MUTATIONS=false`.
- Las cargas estructurales, ingestión de datos e inspecciones operan en modo local/off-chain sin interactuar con la blockchain de Stellar hasta la fase de emisión autorizada.

## Invariante 3: Contacto Operacional != Identidad Cultural
- `registration_email != identidad`: El correo utilizado en el formulario de inscripción es un dato de contacto del trámite, no el identificador primario del sujeto cultural.
- `credential_delivery_email != sujeto`: El correo de entrega inicial de la credencial puede corresponder a la directora de la academia o a la encargada del grupo, sin que ello signifique que dicha persona sea el sujeto o titular único de la presentación grupal.
- El almacenamiento de contactos de inscripción y entrega pertenece a la **participación/presentación** (`participations`), no a la entidad base (`entities`). Esto permite que una escuela inscriba 5 grupos con el mismo correo institucional sin colapsar las identidades culturales de los 5 grupos.

## Invariante 4: Membresía Escolar != Participación Escénica
- `membership != performance participation`: Pertenecer a una academia o compañía de danza no implica haber bailado en una presentación específica.
- `director_of` / `teacher_at` no implica `performed_in`: Una directora o profesora que inscribe a su ballet figura con rol directivo o formativo en la organización, pero solo adquiere la condición de intérprete escénica si efectivamente bailó en esa presentación puntual (caso de referencia: Samaira Laura Salinas).

## Invariante 5: Jerarquía de Entidades Culturales
El modelo preserva la siguiente jerarquía canónica:
```text
EVENTO (FDVC 2026)
└── ESCUELA / ORGANIZACIÓN
    ├── PERSONA / PROFESORA / DIRECTORA (director_of / teacher_at)
    └── GRUPO / BALLET / COMPAÑÍA (member_of escuela)
        └── PARTICIPACIÓN (participant_of evento)
            └── [Fase Futura: ROSTER DE BAILARINAS INDIVIDUALES] (performed_in)
```
En presentaciones solistas, el sujeto directo de la participación es la **Persona**. En presentaciones grupales, el sujeto directo es el **Grupo / Ballet / Compañía**.

## Invariante 6: Idempotencia y Transaccionalidad
Toda importación o actualización de base de datos debe ser estrictamente idempotente y ejecutarse dentro de transacciones SQL atómicas con rollback ante cualquier error. La ejecución repetida de un script debe producir 0 entidades duplicadas y 0 relaciones redundantes.

## Invariante 7: Estabilidad de Identificadores y UUIDs
Las correcciones en nombres visibles, nombres artísticos o nombres de ballets deben realizarse mediante actualización de atributos de la entidad existente, preservando de manera inviolable su UUID interno, sus relaciones preexistentes y su trazabilidad histórica.

## Invariante 8: Gobernanza de Decisiones y Producción
- La aprobación de cambios funcionales, arquitectónicos y de ejecución en producción reside en **Marcos Reyes**.
- La labor técnica de **Danilo** en la capa Stellar / Soroban / passkeys es de colaboración y asesoría técnica especializada; sus recomendaciones se coordinan y respetan, pero no es el aprobador final del proyecto.
- El **PR #6** continúa pausado y no debe modificarse salvo instrucción explícita de Marcos.

## Invariante 9: Taxonomía de Credenciales: Familia, Modalidad y Rol Contextual
El modelo de credenciales digitales se rige por la estricta ortogonalidad entre familia, modalidad y rol:
1. **`credential_family`**: Define la familia visual, ontológica y funcional de la credencial (`participant`, `guest`, `staff`).
2. **`participation_mode`**: Define la modalidad de interpretación escénica (`solo`, `group`, `not_applicable`).
3. **`role`**: Describe el rol contextual de la persona (`dancer`, `teacher`, `director`, `group_leader`, `photographer`, `cameraman`, `production`, `organizer`).
- **Principio Clave**: El rol contextual describe la posición de la persona pero **no muta por sí solo la familia ni genera un tipo disjunto de certificado**.
- **Regla Directiva/Formativa**: Ser profesora, directora o líder de grupo no crea un certificado de participación independiente; si bailó como solista, su credencial es `participant` / `solo`, y su rol pedagógico/directivo se expresa como metadata secundaria verificable.
- **Diferenciación Ceremonial**: Las invitadas especiales (`guest`) poseen una familia propia con tratamiento visual destacado/ceremonial, separado de la participación regular.
- **Contribuciones Operativas**: Los roles de apoyo operativo (`staff`) acreditan aportes verificados al evento (producción, organización, fotografía, cámara) con `participation_mode = not_applicable`, sin confundirse jamás con interpretaciones escénicas.

