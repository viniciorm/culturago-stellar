#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    BytesN, Env, Symbol, TryFromVal,
};
use stellar_access::access_control as access;

fn setup<'a>() -> (
    Env,
    Address,
    CulturalEntityRegistryClient<'a>,
    Address,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let registrar = Address::generate(&env);
    let contract_id = env.register(CulturalEntityRegistry, (&admin, &registrar, 1u32));
    let client = CulturalEntityRegistryClient::new(&env, &contract_id);
    (env, contract_id, client, admin, registrar)
}

/// Lee el rol desde dentro del contexto del contrato (storage inaccesible afuera).
fn has_role(env: &Env, contract_id: &Address, account: &Address) -> bool {
    env.as_contract(contract_id, || {
        access::has_role(env, account, &Symbol::new(env, REGISTRAR_ROLE)).is_some()
    })
}

fn hash(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

#[test]
fn registers_first_version_and_emits_event() {
    let (env, _contract_id, client, _admin, registrar) = setup();
    let entity_id = hash(&env, 1);
    let meta = hash(&env, 9);

    let version = client.register_entity(&registrar, &entity_id, &meta, &1);
    assert_eq!(version, 1);

    // SDK 26: events() refleja el frame de la última invocación; leer antes
    // de cualquier otro call al contrato.
    let events = env.events().all();
    assert!(!events.events().is_empty(), "event count is zero");
    let last = events.events().last().expect("event emitted").clone();
    let topics = match last.body {
        soroban_sdk::xdr::ContractEventBody::V0(v0) => v0.topics,
    };
    let topic0: Symbol =
        Symbol::try_from_val(&env, &topics.first().expect("topic 0").clone()).expect("symbol");
    // #[contractevent] publica el nombre del tipo en snake_case
    assert_eq!(topic0, Symbol::new(&env, "entity_registered"));

    let head = client.get_entity(&entity_id).expect("head exists");
    assert!(head.active);
    assert_eq!(head.latest_version, 1);

    let v1 = client
        .get_entity_version(&entity_id, &1)
        .expect("v1 exists");
    assert_eq!(v1.metadata_hash, meta);
    assert_eq!(v1.hash_schema, 1);
    assert_eq!(v1.registrar, registrar);
}

#[test]
fn repeated_register_with_same_payload_is_idempotent() {
    let (env, _contract_id, client, _admin, registrar) = setup();
    let entity_id = hash(&env, 1);
    let meta = hash(&env, 9);

    client.register_entity(&registrar, &entity_id, &meta, &1);
    assert_eq!(env.events().all().events().len(), 1);

    // Repetición idempotente: no publica ningún evento adicional
    let version = client.register_entity(&registrar, &entity_id, &meta, &1);
    assert_eq!(version, 1);
    assert_eq!(env.events().all().events().len(), 0);
}

#[test]
fn repeated_register_with_different_payload_fails() {
    let (env, _contract_id, client, _admin, registrar) = setup();
    let entity_id = hash(&env, 1);

    client.register_entity(&registrar, &entity_id, &hash(&env, 9), &1);
    let result = client.try_register_entity(&registrar, &entity_id, &hash(&env, 8), &1);
    assert_eq!(result, Err(Ok(ContractError::AlreadyExists)));
}

#[test]
fn rejects_unknown_hash_schema() {
    let (env, _contract_id, client, _admin, registrar) = setup();
    let result = client.try_register_entity(&registrar, &hash(&env, 1), &hash(&env, 9), &99);
    assert_eq!(result, Err(Ok(ContractError::UnsupportedHashSchema)));
}

#[test]
fn rejects_non_registrar() {
    let (env, _contract_id, client, _admin, _registrar) = setup();
    let stranger = Address::generate(&env);
    let result = client.try_register_entity(&stranger, &hash(&env, 1), &hash(&env, 9), &1);
    assert_eq!(result, Err(Ok(ContractError::Unauthorized)));
}

#[test]
fn versions_with_optimistic_control() {
    let (env, _contract_id, client, _admin, registrar) = setup();
    let entity_id = hash(&env, 1);
    client.register_entity(&registrar, &entity_id, &hash(&env, 9), &1);

    let v2 = client.version_entity(&registrar, &entity_id, &1, &hash(&env, 10), &1);
    assert_eq!(v2, 2);

    let head = client.get_entity(&entity_id).expect("head");
    assert_eq!(head.latest_version, 2);

    // La versión 1 permanece inmutable
    let v1 = client.get_entity_version(&entity_id, &1).expect("v1");
    assert_eq!(v1.metadata_hash, hash(&env, 9));
}

#[test]
fn version_conflict_is_rejected() {
    let (env, _contract_id, client, _admin, registrar) = setup();
    let entity_id = hash(&env, 1);
    client.register_entity(&registrar, &entity_id, &hash(&env, 9), &1);
    client.version_entity(&registrar, &entity_id, &1, &hash(&env, 10), &1);

    let result = client.try_version_entity(&registrar, &entity_id, &1, &hash(&env, 11), &1);
    assert_eq!(result, Err(Ok(ContractError::VersionConflict)));
}

#[test]
fn deactivate_preserves_history_and_is_idempotent() {
    let (env, _contract_id, client, _admin, registrar) = setup();
    let entity_id = hash(&env, 1);
    client.register_entity(&registrar, &entity_id, &hash(&env, 9), &1);

    client.deactivate_entity(&registrar, &entity_id, &1, &None);
    let head = client.get_entity(&entity_id).expect("head");
    assert!(!head.active);

    // Idempotente con la misma expected_version
    client.deactivate_entity(&registrar, &entity_id, &1, &None);

    // La historia sigue consultable
    let v1 = client
        .get_entity_version(&entity_id, &1)
        .expect("v1 preserved");
    assert_eq!(v1.version, 1);

    // verify_entity falla para entidad inactiva
    assert!(!client.verify_entity(&entity_id, &1, &hash(&env, 9), &1));
}

#[test]
fn cannot_version_inactive_entity() {
    let (env, _contract_id, client, _admin, registrar) = setup();
    let entity_id = hash(&env, 1);
    client.register_entity(&registrar, &entity_id, &hash(&env, 9), &1);
    client.deactivate_entity(&registrar, &entity_id, &1, &None);

    let result = client.try_version_entity(&registrar, &entity_id, &1, &hash(&env, 10), &1);
    assert_eq!(result, Err(Ok(ContractError::Inactive)));
}

#[test]
fn admin_can_grant_and_revoke_registrar() {
    let (env, contract_id, client, admin, _registrar) = setup();
    let second = Address::generate(&env);

    client.grant_registrar(&admin, &second);
    assert!(has_role(&env, &contract_id, &second));

    client.revoke_registrar(&admin, &second);
    assert!(!has_role(&env, &contract_id, &second));
}

#[test]
fn two_step_admin_transfer() {
    let (env, contract_id, client, _admin, _registrar) = setup();
    let new_admin = Address::generate(&env);
    env.ledger().with_mut(|l| l.sequence_number = 1000);

    client.transfer_admin(&new_admin, &2000);
    client.accept_admin_transfer();

    // El nuevo admin puede administrar
    let third = Address::generate(&env);
    client.grant_registrar(&new_admin, &third);
    assert!(has_role(&env, &contract_id, &third));
}

#[test]
fn verify_entity_matches_exactly() {
    let (env, _contract_id, client, _admin, registrar) = setup();
    let entity_id = hash(&env, 1);
    let meta = hash(&env, 9);
    client.register_entity(&registrar, &entity_id, &meta, &1);

    assert!(client.verify_entity(&entity_id, &1, &meta, &1));
    assert!(!client.verify_entity(&entity_id, &1, &hash(&env, 8), &1));
    assert!(!client.verify_entity(&entity_id, &2, &meta, &1));
    assert!(!client.verify_entity(&hash(&env, 2), &1, &meta, &1));
}
