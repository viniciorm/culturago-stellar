# Identidad — CulturaGO

```yaml
registro: equilibrado
alcance: piloto-fdvc-2026
entorno: stellar-testnet
```

## 1. Propósito
CulturaGO es una plataforma de identidad soberana y credenciales culturales digitales verificables sobre la red Stellar (Soroban). Su propósito es otorgar reconocimiento verificable, permanente y digno a artistas, agrupaciones, directores y academias del ecosistema cultural y artístico, comenzando con el piloto oficial del **Festival Nacional Danza del Vientre Chile 2026 (FDVC 2026)**.

## 2. Visión y Calidad
- **Dignidad Cultural**: El reconocimiento del trabajo artístico es el centro ontológico. Las academias, bailarinas y ballets no son meros "usuarios", sino entidades culturales con historia, linaje formativo y autoría escénica.
- **Cero Custodia**: La soberanía reside en el titular mediante WebAuthn / Passkeys y Smart Wallets Soroban. CulturaGO nunca retiene claves privadas ni ejerce custodia sobre las identidades.
- **Inmutabilidad y Permanencia**: Los certificados y relaciones emitidos deben persistir de manera auditable y canónica en el tiempo.

## 3. Principio Rector de Identidad vs. Contacto Operacional
CulturaGO establece una frontera estricta entre la **identidad cultural** y el **contacto operacional**:
- **La identidad cultural** es ontológica: la persona (bailarina/directora) y la organización (escuela/ballet) existen como entidades con historia y relaciones.
- **El contacto operacional** (`registration_email`, `credential_delivery_email`) es transitorio y funcional: corresponde a los canales de comunicación y entrega utilizados en formularios de inscripción o convocatorias.
- **Ley**: `registration_email != identidad cultural`. Una entidad cultural no se define ni se limita por el correo electrónico con el que fue inscrita en un evento determinado.

## 4. Familias de Reconocimiento Verificable
CulturaGO estructura el reconocimiento cultural en tres familias inviolables que honran la naturaleza real del aporte:
- **Participant (Participante)**: Reconocimiento a la interpretación escénica regular, ya sea solista o grupal. El rol formativo o directivo (profesora, directora) es metadata contextual secundaria que acompaña a la persona, sin diluir la verdad de su participación artística en escenario.
- **Guest (Invitada Especial)**: Reconocimiento ceremonial y destacado a trayectorias e intervenciones artísticas invitadas de honor, con un tratamiento visual y simbólico diferenciado.
- **Staff (Staff Verificado)**: Reconocimiento a la contribución operativa, técnica, fotográfica, audiovisual y organizativa que hace posible el evento cultural, manteniéndola rigurosamente diferenciada de la participación escénica.

## 5. Frontera y Gobernanza
- En esta etapa, CulturaGO opera **exclusivamente en Stellar Testnet**.
- **Gobernanza del Proyecto**:
  - **Marcos Reyes** es quien aprueba cambios funcionales, arquitectónicos y ejecuciones de producción.
  - **Danilo** es colaborador técnico en Stellar / Soroban / passkeys. Sus cambios y recomendaciones técnicas se respetan y coordinan, pero Danilo no es el aprobador final del proyecto.
  - **PR #6** continúa pausado y no debe modificarse salvo instrucción explícita de Marcos.
- Quedan estrictamente fuera de alcance mutaciones en Mainnet y emisiones on-chain no auditadas.
