import 'server-only';
import { Keypair } from '@stellar/stellar-sdk';
import { domainError } from '../../domain/errors';
import { getPublicConfig, CulturaGoEnvironment } from '../config/env';
import manifestJson from '../../../docs/manifests/testnet-manifest.json';

/**
 * Typed, server-only network configuration. Networks never mix: passphrase,
 * RPC, contract IDs, explorer and the smart-wallet WASM allowlist all
 * come from the same environment selection.
 */
export interface StellarNetworkConfig {
  environment: CulturaGoEnvironment;
  networkPassphrase: string;
  rpcUrl: string;
  entityRegistryContractId: string;
  credentialRegistryContractId: string;
  explorerBase: string | null;
  /** Approved smart-wallet WASM hashes. Filled from the environment allowlist
   *  and, for testnet, from `docs/manifests/testnet-manifest.json`. */
  smartWalletWasmAllowlist: readonly string[];
  /** Funded G-account that pays fees when the actor is a smart-wallet contract. */
  feePayerAddress: string | null;
  /** Secret for the fee payer; only used for restore/bump in the two-phase flow. */
  feePayerSecret: string | null;
  /** Maximum fee (in stroops) the server is willing to pay per transaction. */
  maxFeeStrokes: number;
  /** Maximum number of relayer-sponsored operations per actor per day. */
  relayerDailyBudget: number;
}

export function getStellarNetworkConfig(): StellarNetworkConfig {
  const publicConfig = getPublicConfig();

  if (publicConfig.environment === 'demo') {
    throw domainError(
      'INVALID_INPUT',
      'demo environment has no chain configuration; use MockStellarGateway'
    );
  }

  const { environment, stellarNetworkPassphrase, stellarRpcUrl } = publicConfig;

  if (!stellarNetworkPassphrase || !stellarRpcUrl) {
    throw domainError('INVALID_INPUT', `${environment} requires Stellar network passphrase and RPC URL`);
  }

  if (!publicConfig.entityRegistryContractId || !publicConfig.credentialRegistryContractId) {
    throw domainError(
      'INVALID_INPUT',
      `${environment} requires both domain contract IDs`
    );
  }

  const envAllowlist = (process.env.STELLAR_SMART_WALLET_WASM_ALLOWLIST ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^0x/, ''))
    .filter((s) => s.length > 0);

  const manifest = manifestJson as { environment?: string; smartWallet?: { wasmHashAllowlist?: string[] } };
  const manifestList =
    publicConfig.environment === 'testnet' && manifest.environment === 'testnet'
      ? (manifest.smartWallet?.wasmHashAllowlist ?? []).map((s) => s.trim().toLowerCase().replace(/^0x/, ''))
      : [];

  const allowlist = [...new Set([...envAllowlist, ...manifestList])];

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

  // Role separation: the fee payer must never be the testnet admin or fixture signer
  // in production-like runs. For approved Testnet E2E, the admin wallet may also act
  // as fee payer to keep the test surface small.
  const allowAdminFeePayer =
    publicConfig.environment === 'testnet' &&
    process.env.CULTURAGO_ALLOW_TESTNET_MUTATIONS === 'true';

  const adminAddress = process.env.STELLAR_TESTNET_ADMIN_ADDRESS?.trim() || null;
  if (!allowAdminFeePayer && feePayer && adminAddress && feePayer === adminAddress) {
    throw domainError(
      'INVALID_INPUT',
      'STELLAR_FEEPAYER_ADDRESS must not match STELLAR_TESTNET_ADMIN_ADDRESS'
    );
  }

  const fixtureSecret = process.env.STELLAR_TESTNET_FIXTURE_SECRET?.trim();
  if (!allowAdminFeePayer && feePayer && fixtureSecret) {
    const fixtureAddress = Keypair.fromSecret(fixtureSecret).publicKey();
    if (feePayer === fixtureAddress) {
      throw domainError(
        'INVALID_INPUT',
        'STELLAR_FEEPAYER_ADDRESS must not match the fixture signer address'
      );
    }
  }

  const maxFeeStrokes = Number(process.env.STELLAR_MAX_FEE_STROKES ?? 500_000);
  if (!Number.isInteger(maxFeeStrokes) || maxFeeStrokes < 1) {
    throw domainError('INVALID_INPUT', 'STELLAR_MAX_FEE_STROKES must be a positive integer');
  }

  const relayerDailyBudget = Number(process.env.STELLAR_RELAYER_DAILY_BUDGET ?? 500);
  if (!Number.isInteger(relayerDailyBudget) || relayerDailyBudget < 1) {
    throw domainError('INVALID_INPUT', 'STELLAR_RELAYER_DAILY_BUDGET must be a positive integer');
  }

  // feePayer presence is intentionally not logged to avoid leaking configuration hints.

  return {
    environment,
    networkPassphrase: stellarNetworkPassphrase,
    rpcUrl: stellarRpcUrl,
    entityRegistryContractId: publicConfig.entityRegistryContractId,
    credentialRegistryContractId: publicConfig.credentialRegistryContractId,
    explorerBase: publicConfig.stellarExplorerBase,
    smartWalletWasmAllowlist: allowlist,
    feePayerAddress: feePayer && feePayer.trim() !== '' ? feePayer.trim() : null,
    feePayerSecret: feePayerSecret && feePayerSecret.trim() !== '' ? feePayerSecret.trim() : null,
    maxFeeStrokes,
    relayerDailyBudget,
  };
}

/**
 * Testnet-only admin signer configuration. Used exclusively by the provisioning
 * service to grant/revoke registrar/issuer/revoker roles and to manage
 * issuer-operator links. Hard-fails on mainnet and demo regardless of env vars.
 */
export interface TestnetAdminSignerConfig {
  adminAddress: string;
  adminSecret: string;
}

export function getTestnetAdminSignerConfig(): TestnetAdminSignerConfig {
  const publicConfig = getPublicConfig();

  if (publicConfig.environment !== 'testnet') {
    throw domainError(
      'INVALID_INPUT',
      `${publicConfig.environment} does not support a server-side testnet admin signer; use a different admin model`
    );
  }

  if (process.env.CULTURAGO_ALLOW_TESTNET_ADMIN_SIGNER !== 'true') {
    throw domainError(
      'UNAUTHORIZED',
      'testnet admin signer requires CULTURAGO_ALLOW_TESTNET_ADMIN_SIGNER=true'
    );
  }

  const adminAddress = process.env.STELLAR_TESTNET_ADMIN_ADDRESS?.trim();
  const adminSecret = process.env.STELLAR_TESTNET_ADMIN_SECRET?.trim();

  if (!adminAddress || !adminSecret) {
    throw domainError(
      'INVALID_INPUT',
      'STELLAR_TESTNET_ADMIN_ADDRESS and STELLAR_TESTNET_ADMIN_SECRET must be set for testnet provisioning'
    );
  }

  const derived = Keypair.fromSecret(adminSecret).publicKey();
  if (derived !== adminAddress) {
    throw domainError(
      'INVALID_INPUT',
      'STELLAR_TESTNET_ADMIN_SECRET does not match STELLAR_TESTNET_ADMIN_ADDRESS'
    );
  }

  return { adminAddress, adminSecret };
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
