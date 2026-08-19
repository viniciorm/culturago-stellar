#![no_std]
//! CulturalCredentialRegistry — atestaciones no transferibles emitidas por
//! instituciones autorizadas. NO es un NFT: sin owner, balance, approve,
//! transfer, burn ni URI pública. No llama a otros contratos: la
//! precondición de participación en evento pertenece a la aplicación.
//! Roles: ADMIN (AccessControl), ISSUER y REVOKER. Emitir/revocar exige
//! simultáneamente rol, operator.require_auth() y vínculo IssuerOperator
//! activo: un rol global nunca permite suplantar a otro emisor.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, Env,
    Symbol,
};
use stellar_access::access_control::{self as access, AccessControl};

pub const ISSUER_ROLE: &str = "issuer";
pub const REVOKER_ROLE: &str = "revoker";

/// Umbral y extensión de TTL (ledgers).
pub const TTL_THRESHOLD: u32 = 50_000;
pub const TTL_EXTEND_TO: u32 = 500_000;

#[contracttype]
#[derive(Clone)]
pub struct CredentialRecord {
    pub credential_id: BytesN<32>,
    pub token_id: u64,
    pub issuer_id: BytesN<32>,
    pub issued_by: Address,
    pub subject_id: BytesN<32>,
    pub event_id: BytesN<32>,
    pub credential_type: u32,
    pub metadata_hash: BytesN<32>,
    pub hash_schema: u32,
    pub issued_ledger: u32,
    pub revoked: bool,
    pub revoked_ledger: Option<u32>,
    pub revoked_reason_hash: Option<BytesN<32>>,
}

#[contracttype]
pub enum CredentialKey {
    ById(BytesN<32>),
    ByToken(u64),
    /// Índice de unicidad de clave de negocio: digest de issuer|subject|event|type.
    ByBusinessKey(BytesN<32>),
    /// Vínculo institucional activo entre emisor y operador.
    IssuerOperator(BytesN<32>, Address),
    /// Hash de esquema admitido.
    AllowedSchema(u32),
}

#[contracttype]
pub enum InstanceKey {
    NextTokenId,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    Unauthorized = 1,
    InvalidInput = 2,
    AlreadyExists = 3,
    NotFound = 4,
    AlreadyRevoked = 6,
    UnsupportedHashSchema = 7,
    TokenIdOverflow = 8,
    IssuerOperatorNotLinked = 9,
    UnknownCredentialType = 10,
}

#[contractevent]
#[derive(Clone)]
pub struct CredentialIssued {
    #[topic]
    pub credential_id: BytesN<32>,
    #[topic]
    pub token_id: u64,
    pub issuer_id: BytesN<32>,
    pub issued_by: Address,
    pub subject_id: BytesN<32>,
    pub event_id: BytesN<32>,
    pub credential_type: u32,
    pub metadata_hash: BytesN<32>,
    pub hash_schema: u32,
    pub issued_ledger: u32,
}

#[contractevent]
#[derive(Clone)]
pub struct CredentialRevoked {
    #[topic]
    pub credential_id: BytesN<32>,
    #[topic]
    pub token_id: u64,
    pub revoker: Address,
    pub reason_hash: Option<BytesN<32>>,
    pub revoked_ledger: u32,
}

#[contractevent]
#[derive(Clone)]
pub struct IssuerOperatorLinked {
    #[topic]
    pub issuer_id: BytesN<32>,
    #[topic]
    pub operator: Address,
}

#[contractevent]
#[derive(Clone)]
pub struct IssuerOperatorUnlinked {
    #[topic]
    pub issuer_id: BytesN<32>,
    #[topic]
    pub operator: Address,
}

#[contract]
pub struct CulturalCredentialRegistry;

#[contractimpl]
impl CulturalCredentialRegistry {
    /// Constructor único, solo al desplegar. Inicializa admin, roles
    /// issuer/revoker y esquema de hash inicial.
    pub fn __constructor(
        env: Env,
        admin: Address,
        issuer: Address,
        revoker: Address,
        hash_schema: u32,
    ) {
        access::set_admin(&env, &admin);
        access::grant_role_no_auth(&env, &issuer, &Symbol::new(&env, ISSUER_ROLE), &admin);
        access::grant_role_no_auth(&env, &revoker, &Symbol::new(&env, REVOKER_ROLE), &admin);

        env.storage()
            .instance()
            .set(&CredentialKey::AllowedSchema(hash_schema), &true);
        env.storage()
            .instance()
            .set(&InstanceKey::NextTokenId, &1u64);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    /// Emite una atestación. Idempotente por clave de negocio: repetir con
    /// los mismos campos devuelve el `token_id` original sin escribir ni
    /// emitir evento; con diferencias devuelve `AlreadyExists`.
    pub fn issue_credential(
        env: Env,
        operator: Address,
        credential_id: BytesN<32>,
        issuer_id: BytesN<32>,
        subject_id: BytesN<32>,
        event_id: BytesN<32>,
        credential_type: u32,
        metadata_hash: BytesN<32>,
        hash_schema: u32,
    ) -> Result<u64, ContractError> {
        operator.require_auth();
        Self::ensure_role(&env, &operator, ISSUER_ROLE)?;
        Self::ensure_linked(&env, &issuer_id, &operator)?;
        Self::ensure_schema(&env, hash_schema)?;
        Self::ensure_known_type(credential_type)?;

        let business_key =
            Self::business_key(&env, &issuer_id, &subject_id, &event_id, credential_type);
        let business_key_entry = CredentialKey::ByBusinessKey(business_key.clone());

        if let Some(existing_id) = env
            .storage()
            .persistent()
            .get::<_, BytesN<32>>(&business_key_entry)
        {
            let existing: CredentialRecord = env
                .storage()
                .persistent()
                .get(&CredentialKey::ById(existing_id.clone()))
                .ok_or(ContractError::NotFound)?;
            Self::extend_persistent(&env, &business_key_entry);
            Self::extend_persistent(&env, &CredentialKey::ById(existing_id.clone()));
            if existing.credential_id == credential_id
                && existing.metadata_hash == metadata_hash
                && existing.hash_schema == hash_schema
            {
                return Ok(existing.token_id);
            }
            return Err(ContractError::AlreadyExists);
        }

        if env
            .storage()
            .persistent()
            .get::<_, CredentialRecord>(&CredentialKey::ById(credential_id.clone()))
            .is_some()
        {
            return Err(ContractError::AlreadyExists);
        }

        let next: u64 = env
            .storage()
            .instance()
            .get(&InstanceKey::NextTokenId)
            .unwrap_or(1);
        if next == u64::MAX {
            return Err(ContractError::TokenIdOverflow);
        }

        let ledger = env.ledger().sequence();
        let record = CredentialRecord {
            credential_id: credential_id.clone(),
            token_id: next,
            issuer_id: issuer_id.clone(),
            issued_by: operator.clone(),
            subject_id: subject_id.clone(),
            event_id: event_id.clone(),
            credential_type,
            metadata_hash: metadata_hash.clone(),
            hash_schema,
            issued_ledger: ledger,
            revoked: false,
            revoked_ledger: None,
            revoked_reason_hash: None,
        };

        let by_id = CredentialKey::ById(credential_id.clone());
        let by_token = CredentialKey::ByToken(next);
        env.storage().persistent().set(&by_id, &record);
        env.storage().persistent().set(&by_token, &credential_id);
        env.storage()
            .persistent()
            .set(&business_key_entry, &credential_id);
        Self::extend_persistent(&env, &by_id);
        Self::extend_persistent(&env, &by_token);
        Self::extend_persistent(&env, &business_key_entry);
        env.storage()
            .instance()
            .set(&InstanceKey::NextTokenId, &(next + 1));
        Self::extend_instance(&env);

        CredentialIssued {
            credential_id,
            token_id: next,
            issuer_id,
            issued_by: operator,
            subject_id,
            event_id,
            credential_type,
            metadata_hash,
            hash_schema,
            issued_ledger: ledger,
        }
        .publish(&env);

        Ok(next)
    }

    /// Revoca preservando el registro. Idempotente con la misma razón; una
    /// razón distinta devuelve `AlreadyRevoked`. No afecta otras credenciales.
    pub fn revoke_credential(
        env: Env,
        operator: Address,
        credential_id: BytesN<32>,
        reason_hash: Option<BytesN<32>>,
    ) -> Result<(), ContractError> {
        operator.require_auth();

        let key = CredentialKey::ById(credential_id.clone());
        let record: CredentialRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(ContractError::NotFound)?;

        Self::ensure_role(&env, &operator, REVOKER_ROLE)?;
        Self::ensure_linked(&env, &record.issuer_id, &operator)?;
        Self::extend_persistent(&env, &key);

        if record.revoked {
            if record.revoked_reason_hash == reason_hash {
                return Ok(());
            }
            return Err(ContractError::AlreadyRevoked);
        }

        let ledger = env.ledger().sequence();
        env.storage().persistent().set(
            &key,
            &CredentialRecord {
                revoked: true,
                revoked_ledger: Some(ledger),
                revoked_reason_hash: reason_hash.clone(),
                ..record.clone()
            },
        );

        CredentialRevoked {
            credential_id,
            token_id: record.token_id,
            revoker: operator,
            reason_hash,
            revoked_ledger: ledger,
        }
        .publish(&env);

        Ok(())
    }

    pub fn get_credential(env: Env, credential_id: BytesN<32>) -> Option<CredentialRecord> {
        let key = CredentialKey::ById(credential_id);
        let record: Option<CredentialRecord> = env.storage().persistent().get(&key);
        if record.is_some() {
            Self::extend_persistent(&env, &key);
        }
        record
    }

    pub fn get_credential_by_token_id(env: Env, token_id: u64) -> Option<CredentialRecord> {
        let token_key = CredentialKey::ByToken(token_id);
        let credential_id: Option<BytesN<32>> = env.storage().persistent().get(&token_key);
        if let Some(id) = credential_id {
            Self::extend_persistent(&env, &token_key);
            let key = CredentialKey::ById(id);
            let record: Option<CredentialRecord> = env.storage().persistent().get(&key);
            if record.is_some() {
                Self::extend_persistent(&env, &key);
            }
            return record;
        }
        None
    }

    /// Verificación pública completa: existe, coincide hash/esquema y no
    /// está revocada.
    pub fn verify_credential(
        env: Env,
        credential_id: BytesN<32>,
        metadata_hash: BytesN<32>,
        hash_schema: u32,
    ) -> bool {
        match env
            .storage()
            .persistent()
            .get::<_, CredentialRecord>(&CredentialKey::ById(credential_id))
        {
            Some(record) => {
                !record.revoked
                    && record.metadata_hash == metadata_hash
                    && record.hash_schema == hash_schema
            }
            None => false,
        }
    }

    // --- Vínculos IssuerOperator (solo admin) ---

    /// Vincula un operador a un emisor institucional. Idempotente.
    pub fn link_issuer_operator(env: Env, issuer_id: BytesN<32>, operator: Address) {
        access::enforce_admin_auth(&env);
        let key = CredentialKey::IssuerOperator(issuer_id.clone(), operator.clone());
        if env.storage().persistent().get::<_, bool>(&key).is_none() {
            env.storage().persistent().set(&key, &true);
            Self::extend_persistent(&env, &key);
            IssuerOperatorLinked {
                issuer_id,
                operator,
            }
            .publish(&env);
        }
        Self::extend_instance(&env);
    }

    /// Desvincula un operador de un emisor. Idempotente.
    pub fn unlink_issuer_operator(env: Env, issuer_id: BytesN<32>, operator: Address) {
        access::enforce_admin_auth(&env);
        let key = CredentialKey::IssuerOperator(issuer_id.clone(), operator.clone());
        if env.storage().persistent().get::<_, bool>(&key).is_some() {
            env.storage().persistent().remove(&key);
            IssuerOperatorUnlinked {
                issuer_id,
                operator,
            }
            .publish(&env);
        }
        Self::extend_instance(&env);
    }

    pub fn is_issuer_operator(env: Env, issuer_id: BytesN<32>, operator: Address) -> bool {
        let key = CredentialKey::IssuerOperator(issuer_id, operator);
        let linked: bool = env.storage().persistent().get(&key).unwrap_or(false);
        if linked {
            Self::extend_persistent(&env, &key);
        }
        linked
    }

    // --- Gestión administrativa (solo admin) ---

    pub fn grant_issuer(env: Env, caller: Address, account: Address) {
        access::enforce_admin_auth(&env);
        access::grant_role_no_auth(&env, &account, &Symbol::new(&env, ISSUER_ROLE), &caller);
        Self::extend_instance(&env);
    }

    pub fn revoke_issuer(env: Env, caller: Address, account: Address) {
        access::enforce_admin_auth(&env);
        access::revoke_role_no_auth(&env, &account, &Symbol::new(&env, ISSUER_ROLE), &caller);
        Self::extend_instance(&env);
    }

    pub fn grant_revoker(env: Env, caller: Address, account: Address) {
        access::enforce_admin_auth(&env);
        access::grant_role_no_auth(&env, &account, &Symbol::new(&env, REVOKER_ROLE), &caller);
        Self::extend_instance(&env);
    }

    pub fn revoke_revoker(env: Env, caller: Address, account: Address) {
        access::enforce_admin_auth(&env);
        access::revoke_role_no_auth(&env, &account, &Symbol::new(&env, REVOKER_ROLE), &caller);
        Self::extend_instance(&env);
    }

    pub fn allow_hash_schema(env: Env, hash_schema: u32) {
        access::enforce_admin_auth(&env);
        env.storage()
            .instance()
            .set(&CredentialKey::AllowedSchema(hash_schema), &true);
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

    fn ensure_role(env: &Env, operator: &Address, role: &str) -> Result<(), ContractError> {
        if Self::has_role(env, operator.clone(), Symbol::new(env, role)).is_none() {
            return Err(ContractError::Unauthorized);
        }
        Ok(())
    }

    fn ensure_linked(
        env: &Env,
        issuer_id: &BytesN<32>,
        operator: &Address,
    ) -> Result<(), ContractError> {
        let key = CredentialKey::IssuerOperator(issuer_id.clone(), operator.clone());
        let linked: bool = env.storage().persistent().get(&key).unwrap_or(false);
        if !linked {
            return Err(ContractError::IssuerOperatorNotLinked);
        }
        Self::extend_persistent(env, &key);
        Ok(())
    }

    fn ensure_schema(env: &Env, hash_schema: u32) -> Result<(), ContractError> {
        let allowed: bool = env
            .storage()
            .instance()
            .get(&CredentialKey::AllowedSchema(hash_schema))
            .unwrap_or(false);
        if !allowed {
            return Err(ContractError::UnsupportedHashSchema);
        }
        Ok(())
    }

    /// Catálogo v1: seis tipos, códigos u32 1..=6. Tipos desconocidos se
    /// rechazan; agregar un tipo exige nueva versión de esquema de catálogo.
    fn ensure_known_type(credential_type: u32) -> Result<(), ContractError> {
        if !(1..=6).contains(&credential_type) {
            return Err(ContractError::UnknownCredentialType);
        }
        Ok(())
    }

    /// Digest de la clave de negocio institucional. Los IDs son opacos y
    /// derivados con separación de dominio off-chain; aquí solo se mezclan
    /// para el índice de unicidad.
    fn business_key(
        env: &Env,
        issuer_id: &BytesN<32>,
        subject_id: &BytesN<32>,
        event_id: &BytesN<32>,
        credential_type: u32,
    ) -> BytesN<32> {
        let mut data = soroban_sdk::Bytes::new(env);
        data.append(&issuer_id.clone().into());
        data.append(&subject_id.clone().into());
        data.append(&event_id.clone().into());
        data.extend_from_array(&credential_type.to_be_bytes());
        env.crypto().sha256(&data).into()
    }

    fn extend_persistent(env: &Env, key: &CredentialKey) {
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
impl AccessControl for CulturalCredentialRegistry {}

mod adversarial;
mod test;
