#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    BytesN, Env, Symbol,
};
use stellar_access::access_control as access;

struct Setup<'a> {
    env: Env,
    contract_id: Address,
    client: CulturalCredentialRegistryClient<'a>,
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

/// Lee el rol desde dentro del contexto del contrato (storage inaccesible afuera).
fn has_role(s: &Setup, account: &Address, role: &str) -> bool {
    s.env.as_contract(&s.contract_id, || {
        access::has_role(&s.env, account, &Symbol::new(&s.env, role)).is_some()
    })
}

fn id(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

#[test]
fn issues_credential_with_unique_token_id() {
    let s = setup();
    let token_id = s.client.issue_credential(
        &s.issuer,
        &id(&s.env, 1),
        &s.issuer_id,
        &id(&s.env, 2),
        &id(&s.env, 3),
        &1,
        &id(&s.env, 9),
        &1,
    );
    assert_eq!(token_id, 1);

    let record = s.client.get_credential(&id(&s.env, 1)).expect("record");
    assert_eq!(record.token_id, 1);
    assert_eq!(record.issuer_id, s.issuer_id);
    assert_eq!(record.issued_by, s.issuer);
    assert!(!record.revoked);

    let by_token = s.client.get_credential_by_token_id(&1).expect("by token");
    assert_eq!(by_token.credential_id, id(&s.env, 1));
}

#[test]
fn repeated_issue_with_same_payload_is_idempotent() {
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
    let token_id = s.client.issue_credential(
        &s.issuer,
        &credential_id,
        &s.issuer_id,
        &id(&s.env, 2),
        &id(&s.env, 3),
        &1,
        &id(&s.env, 9),
        &1,
    );
    // Repetición idempotente: mismo token_id, sin duplicar estado
    assert_eq!(token_id, 1);
    let record = s.client.get_credential(&credential_id).expect("record");
    assert_eq!(record.token_id, 1);
    assert!(!record.revoked);
}

#[test]
fn issue_with_different_payload_same_business_key_fails() {
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
    // Distinto credential_id, misma clave de negocio
    let result = s.client.try_issue_credential(
        &s.issuer,
        &id(&s.env, 11),
        &s.issuer_id,
        &id(&s.env, 2),
        &id(&s.env, 3),
        &1,
        &id(&s.env, 9),
        &1,
    );
    assert_eq!(result, Err(Ok(ContractError::AlreadyExists)));
}

#[test]
fn rejects_unlinked_operator_even_with_role() {
    let s = setup();
    let other_issuer_id = id(&s.env, 77);
    // issuer tiene el rol ISSUER global pero NO está vinculado a other_issuer_id
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
}

#[test]
fn rejects_unknown_credential_type() {
    let s = setup();
    let result = s.client.try_issue_credential(
        &s.issuer,
        &id(&s.env, 1),
        &s.issuer_id,
        &id(&s.env, 2),
        &id(&s.env, 3),
        &99,
        &id(&s.env, 9),
        &1,
    );
    assert_eq!(result, Err(Ok(ContractError::UnknownCredentialType)));
}

#[test]
fn rejects_unknown_hash_schema() {
    let s = setup();
    let result = s.client.try_issue_credential(
        &s.issuer,
        &id(&s.env, 1),
        &s.issuer_id,
        &id(&s.env, 2),
        &id(&s.env, 3),
        &1,
        &id(&s.env, 9),
        &99,
    );
    assert_eq!(result, Err(Ok(ContractError::UnsupportedHashSchema)));
}

#[test]
fn revoke_preserves_record_and_is_idempotent_by_reason() {
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

    s.client
        .revoke_credential(&s.revoker, &credential_id, &Some(id(&s.env, 50)));
    let record = s
        .client
        .get_credential(&credential_id)
        .expect("record preserved");
    assert!(record.revoked);
    assert!(record.revoked_ledger.is_some());

    // Misma razón: éxito idempotente
    s.client
        .revoke_credential(&s.revoker, &credential_id, &Some(id(&s.env, 50)));

    // Razón distinta: AlreadyRevoked
    let result = s
        .client
        .try_revoke_credential(&s.revoker, &credential_id, &Some(id(&s.env, 51)));
    assert_eq!(result, Err(Ok(ContractError::AlreadyRevoked)));

    // Verificación falla tras revocación
    assert!(!s
        .client
        .verify_credential(&credential_id, &id(&s.env, 9), &1));
}

#[test]
fn revoking_unknown_credential_fails() {
    let s = setup();
    let result = s
        .client
        .try_revoke_credential(&s.revoker, &id(&s.env, 99), &None);
    assert_eq!(result, Err(Ok(ContractError::NotFound)));
}

#[test]
fn revoke_requires_revoker_role_and_link() {
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

    // issuer tiene rol ISSUER pero no REVOKER
    let result = s
        .client
        .try_revoke_credential(&s.issuer, &credential_id, &None);
    assert_eq!(result, Err(Ok(ContractError::Unauthorized)));

    // revoker vinculado puede revocar
    s.client
        .revoke_credential(&s.revoker, &credential_id, &None);
    assert!(
        s.client
            .get_credential(&credential_id)
            .expect("record")
            .revoked
    );
}

#[test]
fn unlinked_operator_cannot_issue_or_revoke() {
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

    s.client.unlink_issuer_operator(&s.issuer_id, &s.revoker);
    let result = s
        .client
        .try_revoke_credential(&s.revoker, &credential_id, &None);
    assert_eq!(result, Err(Ok(ContractError::IssuerOperatorNotLinked)));

    // Re-vincular restaura la capacidad
    s.client.link_issuer_operator(&s.issuer_id, &s.revoker);
    s.client
        .revoke_credential(&s.revoker, &credential_id, &None);
}

#[test]
fn verify_credential_matches_exactly() {
    let s = setup();
    let credential_id = id(&s.env, 1);
    let meta = id(&s.env, 9);
    s.client.issue_credential(
        &s.issuer,
        &credential_id,
        &s.issuer_id,
        &id(&s.env, 2),
        &id(&s.env, 3),
        &1,
        &meta,
        &1,
    );

    assert!(s.client.verify_credential(&credential_id, &meta, &1));
    assert!(!s
        .client
        .verify_credential(&credential_id, &id(&s.env, 8), &1));
    assert!(!s.client.verify_credential(&credential_id, &meta, &2));
    assert!(!s.client.verify_credential(&id(&s.env, 2), &meta, &1));
}

#[test]
fn token_ids_are_monotonic() {
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
}

#[test]
fn admin_manages_roles_and_schema() {
    let s = setup();
    let third = Address::generate(&s.env);

    s.client.grant_issuer(&s.admin, &third);
    assert!(has_role(&s, &third, ISSUER_ROLE));
    s.client.revoke_issuer(&s.admin, &third);
    assert!(!has_role(&s, &third, ISSUER_ROLE));

    s.client.allow_hash_schema(&2);
    s.client.link_issuer_operator(&s.issuer_id, &s.issuer);
    // Esquema 2 ahora admitido
    let token = s.client.issue_credential(
        &s.issuer,
        &id(&s.env, 1),
        &s.issuer_id,
        &id(&s.env, 2),
        &id(&s.env, 3),
        &1,
        &id(&s.env, 9),
        &2,
    );
    assert_eq!(token, 1);
}

#[test]
fn two_step_admin_transfer() {
    let s = setup();
    let new_admin = Address::generate(&s.env);
    s.env.ledger().with_mut(|l| l.sequence_number = 1000);

    s.client.transfer_admin(&new_admin, &2000);
    s.client.accept_admin_transfer();

    let another = Address::generate(&s.env);
    s.client.grant_issuer(&new_admin, &another);
    assert!(has_role(&s, &another, ISSUER_ROLE));
}
