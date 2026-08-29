import 'server-only';
import { createHash } from 'crypto';
import { Account, AuthChallenge, IdentityStore, PasskeyCredential, Session, SmartWalletClaim, WalletRecord } from '../../ports/IdentityStore';
import { query, translatePgError, withTransaction } from '../database/pool';

const sha256 = (value: string): Buffer => createHash('sha256').update(value).digest();

interface AccountRow {
  id: string;
  status: string;
  person_entity_id: string | null;
  wallet_contract_address: string | null;
  created_at: string;
}

interface PasskeyRow {
  id: string;
  account_id: string;
  credential_id: Buffer;
  public_key: Buffer;
  sign_counter: string;
  display_name: string;
  transports: string[] | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface SessionRow {
  id: string;
  account_id: string;
  idle_expires_at: string;
  absolute_expires_at: string;
  rotated_from: string | null;
  revoked_at: string | null;
}

interface SmartWalletClaimRow {
  id: string;
  account_id: string;
  entity_id: string;
  contract_id: string;
  key_id: string | null;
  wallet_wasm_hash: string | null;
  network: string;
  deploy_tx_hash: string | null;
  deployed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface WalletRow {
  id: string;
  entity_id: string;
  wallet_address: string | null;
  wallet_type: string;
  wallet_status: string;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
}

export class PostgreSQLIdentityStore implements IdentityStore {
  async getAccount(accountId: string): Promise<Account | null> {
    const result = await query<AccountRow>(
      'SELECT * FROM accounts WHERE id = $1',
      [accountId]
    ).catch(translatePgError);
    return result.rows[0] ? this.toAccount(result.rows[0]) : null;
  }

  async findAccountByPerson(personEntityId: string): Promise<Account | null> {
    const result = await query<AccountRow>(
      'SELECT * FROM accounts WHERE person_entity_id = $1',
      [personEntityId]
    ).catch(translatePgError);
    return result.rows[0] ? this.toAccount(result.rows[0]) : null;
  }

  async createAccount(account: Omit<Account, 'createdAt'>): Promise<Account> {
    const result = await query<AccountRow>(
      `INSERT INTO accounts (id, status, person_entity_id, wallet_contract_address)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [account.id, account.status, account.personEntityId, account.walletContractAddress]
    ).catch(translatePgError);
    return this.toAccount(result.rows[0]);
  }

  async updateAccountStatus(accountId: string, status: Account['status']): Promise<void> {
    await query(
      'UPDATE accounts SET status = $2, updated_at = NOW() WHERE id = $1',
      [accountId, status]
    ).catch(translatePgError);
  }

  async updateAccountWalletContractAddress(accountId: string, walletContractAddress: string): Promise<void> {
    await query(
      'UPDATE accounts SET wallet_contract_address = $2, updated_at = NOW() WHERE id = $1',
      [accountId, walletContractAddress]
    ).catch(translatePgError);
  }

  async grantRole(accountId: string, role: string): Promise<void> {
    await query(
      'INSERT INTO account_roles (account_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [accountId, role]
    ).catch(translatePgError);
  }

  async getRoles(accountId: string): Promise<string[]> {
    const result = await query<{ role: string }>(
      'SELECT role FROM account_roles WHERE account_id = $1',
      [accountId]
    ).catch(translatePgError);
    return result.rows.map((r) => r.role);
  }

  async linkIssuerOperator(issuerEntityId: string, operatorAccountId: string): Promise<void> {
    await query(
      'INSERT INTO issuer_operators (issuer_entity_id, operator_account_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [issuerEntityId, operatorAccountId]
    ).catch(translatePgError);
  }

  async unlinkIssuerOperator(issuerEntityId: string, operatorAccountId: string): Promise<void> {
    await query(
      'DELETE FROM issuer_operators WHERE issuer_entity_id = $1 AND operator_account_id = $2',
      [issuerEntityId, operatorAccountId]
    ).catch(translatePgError);
  }

  async getIssuerScopes(operatorAccountId: string): Promise<string[]> {
    const result = await query<{ issuer_entity_id: string }>(
      'SELECT issuer_entity_id FROM issuer_operators WHERE operator_account_id = $1 AND active',
      [operatorAccountId]
    ).catch(translatePgError);
    return result.rows.map((r) => r.issuer_entity_id);
  }

  async createChallenge(challenge: Omit<AuthChallenge, 'consumedAt'>): Promise<void> {
    await query(
      `INSERT INTO auth_challenges (id, challenge_digest, purpose, account_id, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        challenge.id,
        sha256(challenge.challenge),
        challenge.purpose,
        challenge.accountId,
        challenge.expiresAt,
      ]
    ).catch(translatePgError);
  }

  async consumeChallenge(challengeDigest: string): Promise<AuthChallenge | null> {
    const result = await query<{
      id: string;
      purpose: string;
      account_id: string | null;
      expires_at: string;
      consumed_at: string | null;
    }>(
      `UPDATE auth_challenges
       SET consumed_at = NOW()
       WHERE challenge_digest = $1
         AND consumed_at IS NULL
         AND expires_at > NOW()
       RETURNING *`,
      [Buffer.from(challengeDigest, 'hex')]
    ).catch(translatePgError);
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      challenge: challengeDigest,
      purpose: row.purpose as AuthChallenge['purpose'],
      accountId: row.account_id,
      expiresAt: new Date(row.expires_at),
      consumedAt: row.consumed_at ? new Date(row.consumed_at) : null,
    };
  }

  async addPasskey(credential: Omit<PasskeyCredential, 'id' | 'createdAt'>): Promise<PasskeyCredential> {
    const result = await query<PasskeyRow>(
      `INSERT INTO passkey_credentials (
        account_id, credential_id, public_key, sign_counter, display_name, transports
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        credential.accountId,
        Buffer.from(credential.credentialId, 'base64url'),
        credential.publicKey,
        credential.signCounter.toString(),
        credential.displayName,
        credential.transports,
      ]
    ).catch(translatePgError);
    return this.toPasskey(result.rows[0]);
  }

  async getPasskey(credentialId: string): Promise<PasskeyCredential | null> {
    const result = await query<PasskeyRow>(
      'SELECT * FROM passkey_credentials WHERE credential_id = $1',
      [Buffer.from(credentialId, 'base64url')]
    ).catch(translatePgError);
    return result.rows[0] ? this.toPasskey(result.rows[0]) : null;
  }

  async listPasskeys(accountId: string): Promise<PasskeyCredential[]> {
    const result = await query<PasskeyRow>(
      'SELECT * FROM passkey_credentials WHERE account_id = $1 AND revoked_at IS NULL ORDER BY created_at',
      [accountId]
    ).catch(translatePgError);
    return result.rows.map((r) => this.toPasskey(r));
  }

  async updatePasskeyCounter(credentialId: string, counter: number, lastUsedAt: Date): Promise<void> {
    await query(
      'UPDATE passkey_credentials SET sign_counter = $2, last_used_at = $3 WHERE credential_id = $1',
      [Buffer.from(credentialId, 'base64url'), counter.toString(), lastUsedAt]
    ).catch(translatePgError);
  }

  async revokePasskey(credentialId: string, reason: string): Promise<void> {
    await query(
      'UPDATE passkey_credentials SET revoked_at = NOW(), revoked_reason = $2 WHERE credential_id = $1',
      [Buffer.from(credentialId, 'base64url'), reason]
    ).catch(translatePgError);
  }

  async createSession(session: Omit<Session, 'id'>): Promise<Session> {
    const result = await query<SessionRow>(
      `INSERT INTO sessions (
        session_token_digest, account_id, idle_expires_at, absolute_expires_at, rotated_from
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [
        sha256(session.sessionToken),
        session.accountId,
        session.idleExpiresAt,
        session.absoluteExpiresAt,
        session.rotatedFrom,
      ]
    ).catch(translatePgError);
    return this.toSession(result.rows[0], session.sessionToken);
  }

  async getSession(sessionTokenDigest: string): Promise<Session | null> {
    const result = await query<SessionRow>(
      'SELECT * FROM sessions WHERE session_token_digest = $1',
      [Buffer.from(sessionTokenDigest, 'hex')]
    ).catch(translatePgError);
    return result.rows[0] ? this.toSession(result.rows[0], null) : null;
  }

  async rotateSession(oldSessionId: string, newSession: Omit<Session, 'id'>): Promise<void> {
    await withTransaction(async (client) => {
      await client.query(
        'UPDATE sessions SET revoked_at = NOW() WHERE session_token_digest = $1',
        [Buffer.from(oldSessionId, 'hex')]
      );
      await client.query(
        `INSERT INTO sessions (
          session_token_digest, account_id, idle_expires_at, absolute_expires_at, rotated_from
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          sha256(newSession.sessionToken),
          newSession.accountId,
          newSession.idleExpiresAt,
          newSession.absoluteExpiresAt,
          oldSessionId,
        ]
      );
    }).catch(translatePgError);
  }

  async revokeSession(sessionTokenDigest: string): Promise<void> {
    await query(
      'UPDATE sessions SET revoked_at = NOW() WHERE session_token_digest = $1',
      [Buffer.from(sessionTokenDigest, 'hex')]
    ).catch(translatePgError);
  }

  async revokeAllSessions(accountId: string): Promise<void> {
    await query(
      'UPDATE sessions SET revoked_at = NOW() WHERE account_id = $1 AND revoked_at IS NULL',
      [accountId]
    ).catch(translatePgError);
  }

  async saveSmartWalletClaim(claim: {
    accountId: string;
    entityId: string;
    contractId: string;
    keyId?: string | null;
    walletWasmHash?: string | null;
    network?: string;
    deployTxHash?: string | null;
    deployedAt?: Date | null;
  }): Promise<SmartWalletClaim> {
    const result = await query<SmartWalletClaimRow>(
      `INSERT INTO smart_wallet_claims (
        account_id, entity_id, contract_id, key_id, wallet_wasm_hash, network, deploy_tx_hash, deployed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (contract_id) DO UPDATE SET
        key_id = EXCLUDED.key_id,
        wallet_wasm_hash = EXCLUDED.wallet_wasm_hash,
        network = EXCLUDED.network,
        deploy_tx_hash = EXCLUDED.deploy_tx_hash,
        deployed_at = EXCLUDED.deployed_at,
        updated_at = NOW()
      RETURNING *`,
      [
        claim.accountId,
        claim.entityId,
        claim.contractId,
        claim.keyId ?? null,
        claim.walletWasmHash ?? null,
        claim.network ?? 'testnet',
        claim.deployTxHash ?? null,
        claim.deployedAt ?? new Date(),
      ]
    ).catch(translatePgError);
    return this.toSmartWalletClaim(result.rows[0]);
  }

  async getSmartWalletClaimByAccount(accountId: string): Promise<SmartWalletClaim | null> {
    const result = await query<SmartWalletClaimRow>(
      'SELECT * FROM smart_wallet_claims WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1',
      [accountId]
    ).catch(translatePgError);
    return result.rows[0] ? this.toSmartWalletClaim(result.rows[0]) : null;
  }

  async upsertWallet(wallet: {
    entityId: string;
    walletAddress: string;
    walletType: WalletRecord['walletType'];
    walletStatus: WalletRecord['walletStatus'];
    claimedAt?: Date | null;
  }): Promise<WalletRecord> {
    const existing = await query<WalletRow>(
      'SELECT * FROM wallets WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 1',
      [wallet.entityId]
    ).catch(translatePgError);

    if (existing.rows[0]) {
      const updated = await query<WalletRow>(
        `UPDATE wallets
         SET wallet_address = $2, wallet_type = $3, wallet_status = $4, claimed_at = $5, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          existing.rows[0].id,
          wallet.walletAddress,
          wallet.walletType,
          wallet.walletStatus,
          wallet.claimedAt ?? new Date(),
        ]
      ).catch(translatePgError);
      return this.toWalletRecord(updated.rows[0]);
    } else {
      const inserted = await query<WalletRow>(
        `INSERT INTO wallets (entity_id, wallet_address, wallet_type, wallet_status, claimed_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          wallet.entityId,
          wallet.walletAddress,
          wallet.walletType,
          wallet.walletStatus,
          wallet.claimedAt ?? new Date(),
        ]
      ).catch(translatePgError);
      return this.toWalletRecord(inserted.rows[0]);
    }
  }

  async getWalletByEntity(entityId: string): Promise<WalletRecord | null> {
    const result = await query<WalletRow>(
      'SELECT * FROM wallets WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 1',
      [entityId]
    ).catch(translatePgError);
    return result.rows[0] ? this.toWalletRecord(result.rows[0]) : null;
  }

  private toAccount(row: AccountRow): Account {
    return {
      id: row.id,
      status: row.status as Account['status'],
      personEntityId: row.person_entity_id,
      walletContractAddress: row.wallet_contract_address,
      createdAt: new Date(row.created_at),
    };
  }

  private toPasskey(row: PasskeyRow): PasskeyCredential {
    return {
      id: row.id,
      accountId: row.account_id,
      credentialId: row.credential_id.toString('base64url'),
      publicKey: row.public_key,
      signCounter: Number(row.sign_counter),
      displayName: row.display_name,
      transports: row.transports,
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null,
      revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
      createdAt: new Date(row.created_at),
    };
  }

  private toSession(row: SessionRow, rawToken: string | null): Session {
    return {
      id: row.id,
      sessionToken: rawToken ?? '',
      accountId: row.account_id,
      idleExpiresAt: new Date(row.idle_expires_at),
      absoluteExpiresAt: new Date(row.absolute_expires_at),
      rotatedFrom: row.rotated_from,
      revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
    };
  }

  private toSmartWalletClaim(row: SmartWalletClaimRow): SmartWalletClaim {
    return {
      id: row.id,
      accountId: row.account_id,
      entityId: row.entity_id,
      contractId: row.contract_id,
      keyId: row.key_id,
      walletWasmHash: row.wallet_wasm_hash,
      network: row.network,
      deployTxHash: row.deploy_tx_hash,
      deployedAt: row.deployed_at ? new Date(row.deployed_at) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private toWalletRecord(row: WalletRow): WalletRecord {
    return {
      id: row.id,
      entityId: row.entity_id,
      walletAddress: row.wallet_address,
      walletType: row.wallet_type as WalletRecord['walletType'],
      walletStatus: row.wallet_status as WalletRecord['walletStatus'],
      claimedAt: row.claimed_at ? new Date(row.claimed_at) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
