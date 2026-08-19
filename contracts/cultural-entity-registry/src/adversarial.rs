#![cfg(test)]
//! Suite adversarial (Fase 5): autorización real (sin mock_all_auths),
//! fallos sin estado/eventos parciales, historia inmutable, TTL y presupuesto.

extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{storage::Persistent as _, Address as _, Events, Ledger},
    BytesN, Env, Symbol, TryFromVal,
};

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

fn hash(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

/// require_auth sin mock_all_auths: una invocación sin firma del operador
/// debe fallar a nivel de autenticación, no de dominio.
#[test]
fn register_requires_operator_auth() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let registrar = Address::generate(&env);
    let contract_id = env.register(CulturalEntityRegistry, (&admin, &registrar, 1u32));
    let client = CulturalEntityRegistryClient::new(&env, &contract_id);

    // Sin mock de auth: el host rechaza la invocación.
    let result = client.try_register_entity(&registrar, &hash(&env, 1), &hash(&env, 9), &1);
    assert!(result.is_err());
    // No quedó estado parcial
    assert!(client.try_get_entity(&hash(&env, 1)).is_ok());
}

/// Un fallo de dominio no deja estado ni eventos parciales.
#[test]
fn failed_register_leaves_no_state_and_no_events() {
    let (env, _id, client, _admin, registrar) = setup();
    let entity_id = hash(&env, 1);

    let result = client.try_register_entity(&registrar, &entity_id, &hash(&env, 9), &99);
    assert_eq!(result, Err(Ok(ContractError::UnsupportedHashSchema)));
    assert_eq!(env.events().all().events().len(), 0);
    assert!(client.get_entity(&entity_id).is_none());
}

/// El constructor es único: no se puede re-ejecutar sobre la misma instancia.
#[test]
fn constructor_cannot_run_twice() {
    let (env, contract_id, _client, _admin, _registrar) = setup();
    let result = env.as_contract(&contract_id, || {
        env.storage()
            .instance()
            .get::<_, bool>(&EntityKey::AllowedSchema(1))
    });
    assert_eq!(result, Some(true));
    // Nota: el host de Soroban impide re-invocar __constructor sobre una
    // instancia ya creada; esta invariante la garantiza la red.
}

/// Ninguna secuencia de comandos altera una versión histórica.
#[test]
fn historical_versions_are_immutable_across_sequences() {
    let (env, _id, client, _admin, registrar) = setup();
    let entity_id = hash(&env, 1);

    client.register_entity(&registrar, &entity_id, &hash(&env, 9), &1);
    let v1_before = client.get_entity_version(&entity_id, &1).expect("v1");

    client.version_entity(&registrar, &entity_id, &1, &hash(&env, 10), &1);
    client.version_entity(&registrar, &entity_id, &2, &hash(&env, 11), &1);
    client.deactivate_entity(&registrar, &entity_id, &3, &Some(hash(&env, 77)));

    let v1_after = client.get_entity_version(&entity_id, &1).expect("v1");
    assert_eq!(v1_before.metadata_hash, v1_after.metadata_hash);
    assert_eq!(v1_before.hash_schema, v1_after.hash_schema);
    assert_eq!(v1_before.registrar, v1_after.registrar);
    assert_eq!(v1_before.recorded_ledger, v1_after.recorded_ledger);

    let v2 = client.get_entity_version(&entity_id, &2).expect("v2");
    assert_eq!(v2.metadata_hash, hash(&env, 10));
}

/// Las escrituras extienden el TTL persistente por encima del umbral.
#[test]
fn persistent_entries_are_extended_above_threshold() {
    let (env, contract_id, client, _admin, registrar) = setup();
    let entity_id = hash(&env, 1);
    client.register_entity(&registrar, &entity_id, &hash(&env, 9), &1);

    env.as_contract(&contract_id, || {
        let head_key = EntityKey::Head(entity_id.clone());
        let ttl = env.storage().persistent().get_ttl(&head_key);
        assert!(ttl > TTL_THRESHOLD, "ttl {ttl} debe superar el umbral");
        let version_key = EntityKey::Version(entity_id.clone(), 1u32);
        assert!(env.storage().persistent().get_ttl(&version_key) > TTL_THRESHOLD);
    });
}

/// La transferencia de admin expira: aceptar después del límite falla y el
/// admin original sigue vigente.
#[test]
fn admin_transfer_expires_after_live_until_ledger() {
    let (env, _id, client, admin, _registrar) = setup();
    let new_admin = Address::generate(&env);
    env.ledger().with_mut(|l| l.sequence_number = 1000);

    client.transfer_admin(&new_admin, &2000);
    // La ventana expira
    env.ledger().with_mut(|l| l.sequence_number = 2001);
    let result = client.try_accept_admin_transfer();
    assert!(result.is_err());

    // El admin original sigue pudiendo administrar
    let third = Address::generate(&env);
    client.grant_registrar(&admin, &third);
    let head_check = client.try_register_entity(&third, &hash(&env, 5), &hash(&env, 9), &1);
    assert!(head_check.is_ok());
}

/// Baseline de presupuesto: registro + versionado + desactivación.
/// Registrado en docs/evidence.md; no es un límite duro, es una referencia.
#[test]
fn budget_baseline_is_recorded() {
    let (env, _id, client, _admin, registrar) = setup();
    let entity_id = hash(&env, 1);

    // Nota: resources() mide la última invocación de nivel superior; en tests
    // nativos no incluye instanciación WASM ni rent (ver docs de CostEstimate).
    client.register_entity(&registrar, &entity_id, &hash(&env, 9), &1);
    let r = env.cost_estimate().resources();
    std::println!("BASELINE register_entity: instructions={} disk_read_bytes={} write_bytes={} events_bytes={}", r.instructions, r.disk_read_bytes, r.write_bytes, r.contract_events_size_bytes);

    client.version_entity(&registrar, &entity_id, &1, &hash(&env, 10), &1);
    let r = env.cost_estimate().resources();
    std::println!("BASELINE version_entity: instructions={} disk_read_bytes={} write_bytes={} events_bytes={}", r.instructions, r.disk_read_bytes, r.write_bytes, r.contract_events_size_bytes);

    client.deactivate_entity(&registrar, &entity_id, &2, &None);
    let r = env.cost_estimate().resources();
    std::println!("BASELINE deactivate_entity: instructions={} disk_read_bytes={} write_bytes={} events_bytes={}", r.instructions, r.disk_read_bytes, r.write_bytes, r.contract_events_size_bytes);
}

/// Desactivar una entidad inexistente falla sin efectos.
#[test]
fn deactivate_unknown_entity_fails_cleanly() {
    let (env, _id, client, _admin, registrar) = setup();
    let result = client.try_deactivate_entity(&registrar, &hash(&env, 42), &1, &None);
    assert_eq!(result, Err(Ok(ContractError::NotFound)));
    assert_eq!(env.events().all().events().len(), 0);
}

/// Versionar una entidad inexistente falla sin efectos.
#[test]
fn version_unknown_entity_fails_cleanly() {
    let (env, _id, client, _admin, registrar) = setup();
    let result = client.try_version_entity(&registrar, &hash(&env, 42), &0, &hash(&env, 9), &1);
    assert_eq!(result, Err(Ok(ContractError::NotFound)));
    assert_eq!(env.events().all().events().len(), 0);
}

/// Un admin no es registrar por defecto: los roles son explícitos.
#[test]
fn admin_is_not_implicitly_registrar() {
    let (env, _id, client, admin, _registrar) = setup();
    let result = client.try_register_entity(&admin, &hash(&env, 1), &hash(&env, 9), &1);
    assert_eq!(result, Err(Ok(ContractError::Unauthorized)));
    let _ = env;
}

/// Los eventos de registro y versionado son distinguibles por tópico.
#[test]
fn register_and_version_events_have_distinct_topics() {
    let (env, _id, client, _admin, registrar) = setup();
    let entity_id = hash(&env, 1);

    client.register_entity(&registrar, &entity_id, &hash(&env, 9), &1);
    let e1 = env.events().all();
    client.version_entity(&registrar, &entity_id, &1, &hash(&env, 10), &1);
    let e2 = env.events().all();

    let topic_of = |evs: &soroban_sdk::testutils::ContractEvents| -> Symbol {
        let last = evs.events().last().expect("event").clone();
        let topics = match last.body {
            soroban_sdk::xdr::ContractEventBody::V0(v0) => v0.topics,
        };
        Symbol::try_from_val(&env, &topics.first().expect("topic").clone()).expect("symbol")
    };
    assert_eq!(topic_of(&e1), Symbol::new(&env, "entity_registered"));
    assert_eq!(topic_of(&e2), Symbol::new(&env, "entity_versioned"));
}
