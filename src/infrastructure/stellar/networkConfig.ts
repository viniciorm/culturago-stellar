import 'server-only';
import { Keypair } from '@stellar/stellar-sdk';
import { domainError } from '../../domain/errors';
import { getPublicConfig, CulturaGoEnvironment } from '../config/env';

/**
 * Typed, server-only network configuration. Networks never mix: passphrase,
 * RPC, contract IDs, explorer and the future smart-wallet WASM allowlist all
 * come from the same environment selection.
 */
export interface StellarNetworkConfig {
  environment: CulturaGoEnvironment;
  networkPassphrase: string;
  rpcUrl: string;
  entityRegistryContractId: string;
  credentialRegistryContractId: string;
  explorerBase: string | null;
  /** Future allowlist of approved smart-wallet WASM hashes. Empty until
   *  Phase 8 deploys a wallet contract. */
  smartWalletWasmAllowlist: readonly string[];
  /** Funded G-account that pays fees when the actor is a smart-wallet contract. */
  feePayerAddress: string | null;
  /** Secret for the fee payer; only used for restore/bump in the two-phase flow. */
  feePayerSecret: string | null;
  /** Server-controlled admin account used to grant registrar/issuer/revoker roles and link issuers/operators. */
  adminAddress: string | null;
  /** Secret for the admin account. Testnet only; mainnet must refuse plain secrets. */
  adminSecret: string | null;
}

export function getStellarNetworkConfig(): StellarNetworkConfig {
  const publicConfig = getPublicConfig();

  if (publicConfig.environment === 'demo') {
    throw domainError(
      'INVALID_INPUT',
      'demo environment has no chain configuration; use MockStellarGateway'
    );
  }

  if (!publicConfig.entityRegistryContractId || !publicConfig.credentialRegistryContractId) {
    throw domainError(
      'INVALID_INPUT',
      `${publicConfig.environment} requires both domain contract IDs`
    );
  }

  const allowlist = (process.env.STELLAR_SMART_WALLET_WASM_ALLOWLIST ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const feePayer = process.env.STELLAR_FEEPAYER_ADDRESS?.trim() || null;
  const feePayerSecret = process.env.STELLAR_FEEPAYER_SECRET?.trim() || null;

  if (feePayer && feePayerSecret) {
    const derived = Keypair.fromSecret(feePayerSecret).publicKey();
    if (derived !== feePayer) {
      throw domainError(
        'INVALID_INPUT',
        'STELLAR_FEEPAYER_SECRET does not match STELLAR_FEEPAYER_ADDRESS'
      );
    }
  }

  const adminAddress = process.env.STELLAR_ADMIN_ADDRESS?.trim() || null;
  const adminSecret = process.env.STELLAR_ADMIN_SECRET?.trim() || null;

  if (adminAddress && adminSecret) {
    const derived = Keypair.fromSecret(adminSecret).publicKey();
    if (derived !== adminAddress) {
      throw domainError('INVALID_INPUT', 'STELLAR_ADMIN_SECRET does not match STELLAR_ADMIN_ADDRESS');
    }
  }

  console.log('[networkConfig] feePayer present:', !!feePayer, 'feePayerSecret present:', !!feePayerSecret);

  return {
    environment: publicConfig.environment,
    networkPassphrase: publicConfig.stellarNetworkPassphrase!,
    rpcUrl: publicConfig.stellarRpcUrl!,
    entityRegistryContractId: publicConfig.entityRegistryContractId,
    credentialRegistryContractId: publicConfig.credentialRegistryContractId,
    explorerBase: publicConfig.stellarExplorerBase,
    smartWalletWasmAllowlist: allowlist,
    feePayerAddress: feePayer && feePayer.trim() !== '' ? feePayer.trim() : null,
    feePayerSecret: feePayerSecret && feePayerSecret.trim() !== '' ? feePayerSecret.trim() : null,
    adminAddress: adminAddress && adminAddress.trim() !== '' ? adminAddress.trim() : null,
    adminSecret: adminSecret && adminSecret.trim() !== '' ? adminSecret.trim() : null,
  };
}

/**
 * Controlled testnet fixture signer secret. Guards:
 * - only on testnet, never mainnet, never demo;
 * - explicit opt-in flag REQUIRED;
 * - labelled as fixture: it must never be presented as a user session.
 */
export function getFixtureSignerSecret(): string {
  const config = getStellarNetworkConfig();
  if (config.environment !== 'testnet') {
    throw domainError('INVALID_INPUT', 'fixture signer is only allowed on testnet');
  }
  if (process.env.CULTURAGO_ALLOW_TESTNET_FIXTURE_SIGNER !== 'true') {
    throw domainError(
      'UNAUTHORIZED',
      'testnet fixture signer requires CULTURAGO_ALLOW_TESTNET_FIXTURE_SIGNER=true'
    );
  }
  const secret = process.env.STELLAR_TESTNET_FIXTURE_SECRET;
  if (!secret) {
    throw domainError('INVALID_INPUT', 'STELLAR_TESTNET_FIXTURE_SECRET is not set');
  }
  return secret;
}
