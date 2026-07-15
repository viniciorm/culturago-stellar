# Guía de Integración con Stellar & Soroban para Danilo

Esta guía detalla los pasos, especificaciones y contratos inteligentes necesarios en **Soroban (Stellar)** para reemplazar el módulo de simulación (`src/lib/stellar.ts`) con una integración real en producción.

---

## 1. Mapeo del Modelo de Datos (Base de Datos)

En Supabase, los campos específicos de Stellar ya están listos y expuestos en el Dashboard:

*   **`metadata_hash` (text):** Hash determinístico SHA-256 de los datos de la entidad o credencial. Generado por `generateMetadataHash(data)` en `src/lib/hashes.ts`.
*   **`stellar_status` (text):** Estado de registro en cadena: `not_registered`, `pending`, `registered`, `failed`.
*   **`stellar_tx` (text):** Hash de la transacción confirmada en Stellar (ej. `tx_hash` para explorar en stellar.expert).
*   **`wallet_address` (text):** Llave pública G... de la cuenta Stellar asociada.
*   **`wallet_status` (text):** Estado de la cuenta: `none`, `reserved` (passkey generada pero no reclamada), `claimed` (cuenta activada y controlada por el usuario).

---

## 2. Contratos Inteligentes (Soroban Rust Contracts)

Recomendamos estructurar el contrato en Soroban con las siguientes funciones de entrada:

### A. Registro de Entidades Culturales
Registra el hash de la metadata de un artista, escuela o proveedor, haciendo de anclaje de autenticidad inmutable.

```rust
pub fn register_entity(
    env: Env,
    entity_id: Symbol,
    metadata_hash: BytesN<32>,
    owner: Address,
) {
    owner.require_auth();
    
    // Verificar si ya existe
    if env.storage().persistent().has(&entity_id) {
        panic!("Entidad ya registrada");
    }
    
    // Guardar en almacenamiento persistente
    env.storage().persistent().set(&entity_id, &metadata_hash);
}
```

### B. Emisión de Credenciales Verificables
Registra una credencial digital, vinculando al emisor (ej. FDVC 2026) y al sujeto receptor.

```rust
pub fn issue_credential(
    env: Env,
    credential_id: Symbol,
    issuer: Address,
    subject: Address,
    metadata_hash: BytesN<32>,
) {
    issuer.require_auth();
    
    let credential_record = (issuer.clone(), subject, metadata_hash);
    env.storage().persistent().set(&credential_id, &credential_record);
}
```

### C. Revocación de Credenciales
Invalida una credencial emitida previamente si el participante infringe normas o no asiste.

```rust
pub fn revoke_credential(
    env: Env,
    credential_id: Symbol,
    issuer: Address,
) {
    issuer.require_auth();
    
    // Buscar la credencial y verificar que el emisor sea quien revoca
    let record: (Address, Address, BytesN<32>) = env.storage().persistent().get(&credential_id).unwrap();
    assert_eq!(record.0, issuer, "Solo el emisor puede revocar");
    
    // Eliminar o actualizar estado a revocado
    env.storage().persistent().remove(&credential_id);
}
```

---

## 3. Reemplazo del Módulo Frontend (`src/lib/stellar.ts`)

En el archivo [stellar.ts](file:///C:/Users/marco/.gemini/antigravity/scratch/culturago-stellar/src/lib/stellar.ts) debes importar la librería `@stellar/stellar-sdk` e implementar la conexión de red (ej. Testnet).

### Plantilla de Conexión Real:

```typescript
import { 
  Network, 
  Keypair, 
  TransactionBuilder, 
  rpc, 
  Contract, 
  Address, 
  xdr 
} from '@stellar/stellar-sdk';

const RPC_URL = 'https://soroban-testnet.stellar.org';
const server = new rpc.Server(RPC_URL);
const CONTRACT_ID = 'C...'; // Dirección del contrato desplegado

export async function registerEntityOnChain(entity: {
  id: string;
  display_name: string;
  type: string;
  metadata_hash?: string;
}) {
  // 1. Instanciar el Contrato
  const contract = new Contract(CONTRACT_ID);
  
  // 2. Preparar el argumento metadata_hash como BytesN<32>
  const hashBytes = Buffer.from(entity.metadata_hash!, 'hex');
  
  // 3. Crear la transacción llamando a register_entity
  // (Requiere firmar con la wallet del administrador)
  // ...
  
  return {
    txHash: 'tx_real_hash_from_stellar_submission',
    status: 'success',
    timestamp: new Date().toISOString()
  };
}
```

---

## 4. Integración de Passkeys (Smart Wallets)

Para la activación con un solo clic de las bailarinas, implementaremos **Cuentas Secundarias/Smart Accounts** controladas por firmas WebAuthn.
1.  **Generación de Passkey:** Usa el navegador para solicitar una nueva credencial WebAuthn.
2.  **Registro de Cuenta:** El backend de CulturaGO pre-fondea la cuenta Stellar (ej. 2 XLM mínimos) y le asigna el firmante de Passkey mediante un contrato de cuenta inteligente (Smart Wallet) en Soroban.
3.  **Firma de Transacciones:** Cuando la bailarina reclame un premio o firme su asistencia, firma el desafío de Stellar utilizando la passkey de su teléfono móvil (FaceID/TouchID).
