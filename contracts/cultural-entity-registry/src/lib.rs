#![no_std]
//! CulturalEntityRegistry — registro público y versionado de hashes de
//! entidades culturales. No almacena PII ni llama a otros contratos.
//! Roles: ADMIN (AccessControl) y REGISTRAR. Sin Pausable/Upgradeable:
//! decisión deliberada, documentada en docs/soroban-contract-architecture.md.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, Env,
    Symbol,
};
use stellar_access::access_control::{self as access, AccessControl};

pub const REGISTRAR_ROLE: &str = "registrar";

/// Umbral y extensión de TTL (ledgers). Conservadores: bien por debajo del
/// mínimo de red para datos persistentes (~120 días en mainnet).
pub const TTL_THRESHOLD: u32 = 50_000;
pub const TTL_EXTEND_TO: u32 = 500_000;

#[contracttype]
#[derive(Clone)]
pub struct EntityVersion {
    pub metadata_hash: BytesN<32>,
    pub hash_schema: u32,
    pub version: u32,
    pub registrar: Address,
    pub recorded_ledger: u32,
}

#[contracttype]
#[derive(Clone)]
pub struct EntityHead {
    pub latest_version: u32,
    pub active: bool,
    pub updated_ledger: u32,
}

#[contracttype]
pub enum EntityKey {
    Head(BytesN<32>),
    Version(BytesN<32>, u32),
    /// Hash de esquema admitido (ej. schema 1 = culturago.entity.v1).
    AllowedSchema(u32),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    Unauthorized = 1,
    InvalidInput = 2,
    AlreadyExists = 3,
    NotFound = 4,
    Inactive = 5,
    VersionConflict = 6,
    UnsupportedHashSchema = 7,
}

#[contractevent]
#[derive(Clone)]
pub struct EntityRegistered {
    #[topic]
    pub entity_id: BytesN<32>,
    #[topic]
    pub version: u32,
    pub metadata_hash: BytesN<32>,
    pub hash_schema: u32,
    pub registrar: Address,
    pub recorded_ledger: u32,
}

#[contractevent]
#[derive(Clone)]
pub struct EntityVersioned {
    #[topic]
    pub entity_id: BytesN<32>,
    #[topic]
    pub version: u32,
    pub metadata_hash: BytesN<32>,
    pub hash_schema: u32,
    pub registrar: Address,
    pub recorded_ledger: u32,
}

#[contractevent]
#[derive(Clone)]
pub struct EntityDeactivated {
    #[topic]
    pub entity_id: BytesN<32>,
    #[topic]
    pub version: u32,
    pub operator: Address,
    pub reason_hash: Option<BytesN<32>>,
    pub recorded_ledger: u32,
}

#[contract]
pub struct CulturalEntityRegistry;

#[contractimpl]
impl CulturalEntityRegistry {
    /// Constructor único, solo al desplegar. Inicializa admin, rol registrar
    /// y el conjunto inicial de esquemas de hash admitidos.
    pub fn __constructor(env: Env, admin: Address, registrar: Address, hash_schema: u32) {
        access::set_admin(&env, &admin);
        let registrar_role = Symbol::new(&env, REGISTRAR_ROLE);
        access::grant_role_no_auth(&env, &registrar, &registrar_role, &admin);

        env.storage()
            .instance()
            .set(&EntityKey::AllowedSchema(hash_schema), &true);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    /// Registra la versión 1 de una entidad. Idempotente: repetir con el
    /// mismo hash/esquema devuelve 1 sin escribir ni emitir evento.
    pub fn register_entity(
        env: Env,
        operator: Address,
        entity_id: BytesN<32>,
        metadata_hash: BytesN<32>,
        hash_schema: u32,
    ) -> Result<u32, ContractError> {
        operator.require_auth();
        Self::ensure_registrar(&env, &operator)?;
        Self::ensure_schema(&env, hash_schema)?;

        let head_key = EntityKey::Head(entity_id.clone());
        if let Some(_head) = env.storage().persistent().get::<_, EntityHead>(&head_key) {
            let version_key = EntityKey::Version(entity_id.clone(), 1u32);
            let first: EntityVersion = env
                .storage()
                .persistent()
                .get(&version_key)
                .ok_or(ContractError::NotFound)?;
            Self::extend_persistent(&env, &head_key);
            Self::extend_persistent(&env, &version_key);
            if first.metadata_hash == metadata_hash && first.hash_schema == hash_schema {
                return Ok(1);
            }
            return Err(ContractError::AlreadyExists);
        }

        let ledger = env.ledger().sequence();
        let head = EntityHead {
            latest_version: 1,
            active: true,
            updated_ledger: ledger,
        };
        let version = EntityVersion {
            metadata_hash: metadata_hash.clone(),
            hash_schema,
            version: 1,
            registrar: operator.clone(),
            recorded_ledger: ledger,
        };
        let version_key = EntityKey::Version(entity_id.clone(), 1u32);
        env.storage().persistent().set(&head_key, &head);
        env.storage().persistent().set(&version_key, &version);
        Self::extend_persistent(&env, &head_key);
        Self::extend_persistent(&env, &version_key);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        EntityRegistered {
            entity_id,
            version: 1,
            metadata_hash,
            hash_schema,
            registrar: operator,
            recorded_ledger: ledger,
        }
        .publish(&env);

        Ok(1)
    }

    /// Crea una nueva versión con control optimista; nunca sobrescribe.
    pub fn version_entity(
        env: Env,
        operator: Address,
        entity_id: BytesN<32>,
        expected_version: u32,
        metadata_hash: BytesN<32>,
        hash_schema: u32,
    ) -> Result<u32, ContractError> {
        operator.require_auth();
        Self::ensure_registrar(&env, &operator)?;
        Self::ensure_schema(&env, hash_schema)?;

        let head_key = EntityKey::Head(entity_id.clone());
        let head: EntityHead = env
            .storage()
            .persistent()
            .get(&head_key)
            .ok_or(ContractError::NotFound)?;
        if !head.active {
            return Err(ContractError::Inactive);
        }
        if head.latest_version != expected_version {
            return Err(ContractError::VersionConflict);
        }

        let new_version = head.latest_version + 1;
        let ledger = env.ledger().sequence();
        let version = EntityVersion {
            metadata_hash: metadata_hash.clone(),
            hash_schema,
            version: new_version,
            registrar: operator.clone(),
            recorded_ledger: ledger,
        };
        let version_key = EntityKey::Version(entity_id.clone(), new_version);
        let new_head = EntityHead {
            latest_version: new_version,
            active: true,
            updated_ledger: ledger,
        };
        env.storage().persistent().set(&head_key, &new_head);
        env.storage().persistent().set(&version_key, &version);
        Self::extend_persistent(&env, &head_key);
        Self::extend_persistent(&env, &version_key);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        EntityVersioned {
            entity_id,
            version: new_version,
            metadata_hash,
            hash_schema,
            registrar: operator,
            recorded_ledger: ledger,
        }
        .publish(&env);

        Ok(new_version)
    }

    /// Desactiva la entidad sin borrar versiones. Idempotente si ya está
    /// inactiva y coincide `expected_version`.
    pub fn deactivate_entity(
        env: Env,
        operator: Address,
        entity_id: BytesN<32>,
        expected_version: u32,
        reason_hash: Option<BytesN<32>>,
    ) -> Result<(), ContractError> {
        operator.require_auth();
        Self::ensure_registrar(&env, &operator)?;

        let head_key = EntityKey::Head(entity_id.clone());
        let head: EntityHead = env
            .storage()
            .persistent()
            .get(&head_key)
            .ok_or(ContractError::NotFound)?;
        if head.latest_version != expected_version {
            return Err(ContractError::VersionConflict);
        }
        Self::extend_persistent(&env, &head_key);

        if head.active {
            let ledger = env.ledger().sequence();
            env.storage().persistent().set(
                &head_key,
                &EntityHead {
                    latest_version: head.latest_version,
                    active: false,
                    updated_ledger: ledger,
                },
            );
            EntityDeactivated {
                entity_id,
                version: head.latest_version,
                operator,
                reason_hash,
                recorded_ledger: ledger,
            }
            .publish(&env);
        }
        Ok(())
    }

    pub fn get_entity(env: Env, entity_id: BytesN<32>) -> Option<EntityHead> {
        let key = EntityKey::Head(entity_id);
        let head: Option<EntityHead> = env.storage().persistent().get(&key);
        if head.is_some() {
            Self::extend_persistent(&env, &key);
        }
        head
    }

    pub fn get_entity_version(
        env: Env,
        entity_id: BytesN<32>,
        version: u32,
    ) -> Option<EntityVersion> {
        let key = EntityKey::Version(entity_id, version);
        let value: Option<EntityVersion> = env.storage().persistent().get(&key);
        if value.is_some() {
            Self::extend_persistent(&env, &key);
        }
        value
    }

    /// Verificación pública: existe la versión, coincide hash/esquema y la
    /// cabeza está activa.
    pub fn verify_entity(
        env: Env,
        entity_id: BytesN<32>,
        version: u32,
        metadata_hash: BytesN<32>,
        hash_schema: u32,
    ) -> bool {
        let head_key = EntityKey::Head(entity_id.clone());
        let head: EntityHead = match env.storage().persistent().get(&head_key) {
            Some(h) => h,
            None => return false,
        };
        if !head.active {
            return false;
        }
        let version_key = EntityKey::Version(entity_id, version);
        match env
            .storage()
            .persistent()
            .get::<_, EntityVersion>(&version_key)
        {
            Some(v) => v.metadata_hash == metadata_hash && v.hash_schema == hash_schema,
            None => false,
        }
    }

    // --- Gestión administrativa (solo admin) ---

    pub fn grant_registrar(env: Env, caller: Address, account: Address) {
        access::enforce_admin_auth(&env);
        access::grant_role_no_auth(&env, &account, &Symbol::new(&env, REGISTRAR_ROLE), &caller);
        Self::extend_instance(&env);
    }

    pub fn revoke_registrar(env: Env, caller: Address, account: Address) {
        access::enforce_admin_auth(&env);
        access::revoke_role_no_auth(&env, &account, &Symbol::new(&env, REGISTRAR_ROLE), &caller);
        Self::extend_instance(&env);
    }

    pub fn allow_hash_schema(env: Env, hash_schema: u32) {
        access::enforce_admin_auth(&env);
        env.storage()
            .instance()
            .set(&EntityKey::AllowedSchema(hash_schema), &true);
        Self::extend_instance(&env);
    }

    /// Transferencia administrativa en dos pasos con expiración en ledger.
    pub fn transfer_admin(env: Env, new_admin: Address, live_until_ledger: u32) {
        access::transfer_admin_role(&env, &new_admin, live_until_ledger);
        Self::extend_instance(&env);
    }

    pub fn accept_admin_transfer(env: Env) {
        access::accept_admin_transfer(&env);
        Self::extend_instance(&env);
    }

    // --- Internas ---

    fn ensure_registrar(env: &Env, operator: &Address) -> Result<(), ContractError> {
        let role = Symbol::new(env, REGISTRAR_ROLE);
        if Self::has_role(env, operator.clone(), role).is_none() {
            return Err(ContractError::Unauthorized);
        }
        Ok(())
    }

    fn ensure_schema(env: &Env, hash_schema: u32) -> Result<(), ContractError> {
        let allowed: bool = env
            .storage()
            .instance()
            .get(&EntityKey::AllowedSchema(hash_schema))
            .unwrap_or(false);
        if !allowed {
            return Err(ContractError::UnsupportedHashSchema);
        }
        Ok(())
    }

    fn extend_persistent(env: &Env, key: &EntityKey) {
        env.storage()
            .persistent()
            .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    fn extend_instance(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }
}

#[contractimpl]
impl AccessControl for CulturalEntityRegistry {}

mod adversarial;
mod test;
