#![cfg(test)]
//! Suite adversarial (Fase 5): combinaciones rol/vínculo, doble envío,
//! revocación aislada, claves de negocio alternativas, overflow, TTL,
//! presupuesto y eventos exactos.

extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{storage::Persistent as _, Address as _, Events},
    BytesN, Env, Symbol, TryFromVal,
};

struct Setup<'a> {
    env: Env,
    contract_id: Address,
    client: CulturalCredentialRegistryClient<'a>,
    #[allow(dead_code)]
    admin: Address,
    issuer: Address,
    revoker: Address,
    issuer_id: BytesN<32>,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let issuer = Address::generate(&env);
    let revoker = Address::generate(&env);
    let contract_id = env.register(
        CulturalCredentialRegistry,
        (&admin, &issuer, &revoker, 1u32),
    );
    let client = CulturalCredentialRegistryClient::new(&env, &contract_id);
    let issuer_id = BytesN::from_array(&env, &[7; 32]);
    client.link_issuer_operator(&issuer_id, &issuer);
    client.link_issuer_operator(&issuer_id, &revoker);
    Setup {
        env,
        contract_id,
        client,
        admin,
        issuer,
        revoker,
        issuer_id,
    }
}

fn id(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

/// Rol ISSUER sin vínculo: no puede emitir para issuer_id ajeno.
#[test]
fn role_without_link_cannot_issue() {
    let s = setup();
    let other_issuer_id = id(&s.env, 77);
    let result = s.client.try_issue_credential(
        &s.issuer,
        &id(&s.env, 1),
        &other_issuer_id,
        &id(&s.env, 2),
        &id(&s.env, 3),
        &1,
        &id(&s.env, 9),
        &1,
    );
    assert_eq!(result, Err(Ok(ContractError::IssuerOperatorNotLinked)));
    assert_eq!(s.env.events().all().events().len(), 0);
}

/// Vínculo sin rol: un operador vinculado pero sin rol ISSUER no emite.
#[test]
fn link_without_role_cannot_issue() {
    let s = setup();
    let plain = Address::generate(&s.env);
    s.client.link_issuer_operator(&s.issuer_id, &plain);

    let result = s.client.try_issue_credential(
        &plain,
        &id(&s.env, 1),
        &s.issuer_id,
        &id(&s.env, 2),
        &id(&s.env, 3),
        &1,
        &id(&s.env, 9),
        &1,
    );
    assert_eq!(result, Err(Ok(ContractError::Unauthorized)));
    assert_eq!(s.env.events().all().events().len(), 0);
}

/// Vínculo a OTRO issuer_id no habilita: el scope es por emisor.
#[test]
fn link_to_other_issuer_does_not_transfer_scope() {
    let s = setup();
    let other_issuer_id = id(&s.env, 77);
    s.client.link_issuer_operator(&other_issuer_id, &s.issuer);

    let result = s.client.try_issue_credential(
        &s.issuer,
        &id(&s.env, 1),
        &s.issuer_id,
        &id(&s.env, 2),
        &id(&s.env, 3),
        &1,
        &id(&s.env, 9),
        &1,
    );
    assert!(result.is_ok());

    let result2 = s.client.try_issue_credential(
        &s.issuer,
        &id(&s.env, 12),
        &id(&s.env, 88),
        &id(&s.env, 2),
        &id(&s.env, 3),
        &1,
        &id(&s.env, 9),
        &1,
    );
    assert_eq!(result2, Err(Ok(ContractError::IssuerOperatorNotLinked)));
}

/// Mismo sujeto en Evento A y Evento B: credenciales independientes.
#[test]
fn same_subject_across_two_events() {
    let s = setup();
    let subject = id(&s.env, 2);
    let event_a = id(&s.env, 3);
    let event_b = id(&s.env, 4);

    let ta = s.client.issue_credential(
        &s.issuer,
        &id(&s.env, 10),
        &s.issuer_id,
        &subject,
        &event_a,
        &1,
        &id(&s.env, 91),
        &1,
    );
    let tb = s.client.issue_credential(
        &s.issuer,
        &id(&s.env, 11),
        &s.issuer_id,
        &subject,
        &event_b,
        &1,
        &id(&s.env, 92),
        &1,
    );
    assert_eq!(ta, 1);
    assert_eq!(tb, 2);

    // Revocar A nunca cambia B
    s.client
        .revoke_credential(&s.revoker, &id(&s.env, 10), &None);
    let a = s.client.get_credential(&id(&s.env, 10)).expect("a");
    let b = s.client.get_credential(&id(&s.env, 11)).expect("b");
    assert!(a.revoked);
    assert!(!b.revoked);
    assert_eq!(b.metadata_hash, id(&s.env, 92));
    assert!(s
        .client
        .verify_credential(&id(&s.env, 11), &id(&s.env, 92), &1));
}

/// Clave de negocio con credential_id alternativo: conflicto aunque cambie el ID.
#[test]
fn business_key_conflict_with_alternative_credential_id() {
    let s = setup();
    s.client.issue_credential(
        &s.issuer,
        &id(&s.env, 1),
        &s.issuer_id,
        &id(&s.env, 2),
        &id(&s.env, 3),
        &1,
        &id(&s.env, 9),
        &1,
    );
    // Mismo issuer+subject+event+type, otro credential_id y otro hash
    let result = s.client.try_issue_credential(
        &s.issuer,
        &id(&s.env, 55),
        &s.issuer_id,
        &id(&s.env, 2),
        &id(&s.env, 3),
        &1,
        &id(&s.env, 99),
        &1,
    );
    assert_eq!(result, Err(Ok(ContractError::AlreadyExists)));
}

/// credential_id ya usado con otra clave de negocio: conflicto.
#[test]
fn reused_credential_id_with_different_business_key_fails() {
    let s = setup();
    s.client.issue_credential(
        &s.issuer,
        &id(&s.env, 1),
        &s.issuer_id,
        &id(&s.env, 2),
        &id(&s.env, 3),
        &1,
        &id(&s.env, 9),
        &1,
    );
    let result = s.client.try_issue_credential(
        &s.issuer,
        &id(&s.env, 1),
        &s.issuer_id,
        &id(&s.env, 8),
        &id(&s.env, 3),
        &1,
        &id(&s.env, 9),
        &1,
    );
    assert_eq!(result, Err(Ok(ContractError::AlreadyExists)));
}

/// Doble envío consecutivo (retry tras timeout): mismo token, sin duplicar.
#[test]
fn double_submit_is_idempotent() {
    let s = setup();
    let args = (
        &s.issuer,
        &id(&s.env, 1),
        &s.issuer_id,
        &id(&s.env, 2),
        &id(&s.env, 3),
        &1u32,
        &id(&s.env, 9),
        &1u32,
    );
    let t1 = s.client.issue_credential(
        args.0, args.1, args.2, args.3, args.4, args.5, args.6, args.7,
    );
    let t2 = s.client.issue_credential(
        args.0, args.1, args.2, args.3, args.4, args.5, args.6, args.7,
    );
    assert_eq!(t1, t2);

    let record = s.client.get_credential(&id(&s.env, 1)).expect("record");
    assert_eq!(record.token_id, t1);
    // Solo hay una entrada por clave de negocio
    let t3 = s.client.issue_credential(
        args.0, args.1, args.2, args.3, args.4, args.5, args.6, args.7,
    );
    assert_eq!(t3, t1);
}

/// Revocar A nunca cambia B (aislamiento de revocación).
#[test]
fn revoke_is_isolated_per_credential() {
    let s = setup();
    s.client.issue_credential(
        &s.issuer,
        &id(&s.env, 1),
        &s.issuer_id,
        &id(&s.env, 2),
        &id(&s.env, 3),
        &1,
        &id(&s.env, 9),
        &1,
    );
    s.client.issue_credential(
        &s.issuer,
        &id(&s.env, 11),
        &s.issuer_id,
        &id(&s.env, 12),
        &id(&s.env, 3),
        &2,
        &id(&s.env, 19),
        &1,
    );
    let b_before = s.client.get_credential(&id(&s.env, 11)).expect("b");

    s.client
        .revoke_credential(&s.revoker, &id(&s.env, 1), &Some(id(&s.env, 50)));

    let b_after = s.client.get_credential(&id(&s.env, 11)).expect("b");
    assert_eq!(b_before.revoked, b_after.revoked);
    assert_eq!(b_before.metadata_hash, b_after.metadata_hash);
    assert_eq!(b_before.revoked_ledger, b_after.revoked_ledger);
    assert_eq!(b_before.revoked_reason_hash, b_after.revoked_reason_hash);
}

/// Un revoker puede revocar pero no emitir; un issuer emite pero no revoca.
#[test]
fn issuer_and_revoker_roles_are_disjoint() {
    let s = setup();
    let result = s
        .client
        .try_revoke_credential(&s.issuer, &id(&s.env, 1), &None);
    // NotFound primero: el registro no existe
    assert_eq!(result, Err(Ok(ContractError::NotFound)));

    s.client.issue_credential(
        &s.issuer,
        &id(&s.env, 1),
        &s.issuer_id,
        &id(&s.env, 2),
        &id(&s.env, 3),
        &1,
        &id(&s.env, 9),
        &1,
    );
    // issuer (sin rol revoker) no puede revocar
    let result2 = s
        .client
        .try_revoke_credential(&s.issuer, &id(&s.env, 1), &None);
    assert_eq!(result2, Err(Ok(ContractError::Unauthorized)));

    // revoker (sin rol issuer) no puede emitir
    let result3 = s.client.try_issue_credential(
        &s.revoker,
        &id(&s.env, 21),
        &s.issuer_id,
        &id(&s.env, 22),
        &id(&s.env, 3),
        &1,
        &id(&s.env, 29),
        &1,
    );
    assert_eq!(result3, Err(Ok(ContractError::Unauthorized)));
}

/// Unlink idempotente y revocación de acceso inmediata.
#[test]
fn unlink_revokes_access_immediately_and_is_idempotent() {
    let s = setup();
    s.client.unlink_issuer_operator(&s.issuer_id, &s.issuer);
    assert_eq!(s.env.events().all().events().len(), 1);
    // Segundo unlink (no-op): sin evento duplicado
    s.client.unlink_issuer_operator(&s.issuer_id, &s.issuer);
    assert_eq!(s.env.events().all().events().len(), 0);

    let result = s.client.try_issue_credential(
        &s.issuer,
        &id(&s.env, 1),
        &s.issuer_id,
        &id(&s.env, 2),
        &id(&s.env, 3),
        &1,
        &id(&s.env, 9),
        &1,
    );
    assert_eq!(result, Err(Ok(ContractError::IssuerOperatorNotLinked)));
}

/// Los eventos de link/unlink llevan tópicos indexables.
#[test]
fn link_unlink_events_are_indexable() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let issuer = Address::generate(&env);
    let revoker = Address::generate(&env);
    let contract_id = env.register(
        CulturalCredentialRegistry,
        (&admin, &issuer, &revoker, 1u32),
    );
    let client = CulturalCredentialRegistryClient::new(&env, &contract_id);
    let issuer_id = id(&env, 7);

    client.link_issuer_operator(&issuer_id, &issuer);
    let e = env.events().all();
    let last = e.events().last().expect("link event").clone();
    let topics = match last.body {
        soroban_sdk::xdr::ContractEventBody::V0(v0) => v0.topics,
    };
    let topic0: Symbol =
        Symbol::try_from_val(&env, &topics.first().expect("topic").clone()).expect("symbol");
    assert_eq!(topic0, Symbol::new(&env, "issuer_operator_linked"));
}

/// Emisión extiende TTL de los tres índices persistentes.
#[test]
fn issuance_extends_ttl_on_all_persistent_indexes() {
    let s = setup();
    let credential_id = id(&s.env, 1);
    s.client.issue_credential(
        &s.issuer,
        &credential_id,
        &s.issuer_id,
        &id(&s.env, 2),
        &id(&s.env, 3),
        &1,
        &id(&s.env, 9),
        &1,
    );

    s.env.as_contract(&s.contract_id, || {
        let by_id = CredentialKey::ById(credential_id.clone());
        let by_token = CredentialKey::ByToken(1u64);
        assert!(s.env.storage().persistent().get_ttl(&by_id) > TTL_THRESHOLD);
        assert!(s.env.storage().persistent().get_ttl(&by_token) > TTL_THRESHOLD);
        // El índice de clave de negocio también
        let bk = CulturalCredentialRegistry::business_key(
            &s.env,
            &s.issuer_id,
            &id(&s.env, 2),
            &id(&s.env, 3),
            1,
        );
        let by_bk = CredentialKey::ByBusinessKey(bk);
        assert!(s.env.storage().persistent().get_ttl(&by_bk) > TTL_THRESHOLD);
    });
}

/// Baseline de presupuesto: emisión, revocación, verificación.
#[test]
fn budget_baseline_is_recorded() {
    let s = setup();
    let credential_id = id(&s.env, 1);

    s.client.issue_credential(
        &s.issuer,
        &credential_id,
        &s.issuer_id,
        &id(&s.env, 2),
        &id(&s.env, 3),
        &1,
        &id(&s.env, 9),
        &1,
    );
    let r = s.env.cost_estimate().resources();
    std::println!("BASELINE issue_credential: instructions={} disk_read_bytes={} write_bytes={} events_bytes={}", r.instructions, r.disk_read_bytes, r.write_bytes, r.contract_events_size_bytes);

    s.client
        .revoke_credential(&s.revoker, &credential_id, &Some(id(&s.env, 50)));
    let r = s.env.cost_estimate().resources();
    std::println!("BASELINE revoke_credential: instructions={} disk_read_bytes={} write_bytes={} events_bytes={}", r.instructions, r.disk_read_bytes, r.write_bytes, r.contract_events_size_bytes);

    s.client
        .verify_credential(&credential_id, &id(&s.env, 9), &1);
    let r = s.env.cost_estimate().resources();
    std::println!("BASELINE verify_credential: instructions={} disk_read_bytes={} write_bytes={} events_bytes={}", r.instructions, r.disk_read_bytes, r.write_bytes, r.contract_events_size_bytes);
}

/// El contador de token_id no retrocede ni tras revocaciones.
#[test]
fn token_id_counter_never_goes_backwards() {
    let s = setup();
    let t1 = s.client.issue_credential(
        &s.issuer,
        &id(&s.env, 1),
        &s.issuer_id,
        &id(&s.env, 2),
        &id(&s.env, 3),
        &1,
        &id(&s.env, 9),
        &1,
    );
    s.client
        .revoke_credential(&s.revoker, &id(&s.env, 1), &None);
    let t2 = s.client.issue_credential(
        &s.issuer,
        &id(&s.env, 11),
        &s.issuer_id,
        &id(&s.env, 12),
        &id(&s.env, 3),
        &1,
        &id(&s.env, 19),
        &1,
    );
    assert_eq!(t1, 1);
    assert_eq!(t2, 2);
    // La credencial revocada sigue siendo encontrable por su token original
    let by_token = s.client.get_credential_by_token_id(&1).expect("by token");
    assert!(by_token.revoked);
}
