import 'server-only';
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

  const feePayer =
    process.env.STELLAR_FEEPAYER_ADDRESS ??
    process.env.STELLAR_TESTNET_ADMIN_ADDRESS ??
    null;
  const feePayerSecret =
    process.env.STELLAR_FEEPAYER_SECRET ??
    process.env.STELLAR_TESTNET_DEPLOYER_SECRET ??
    null;

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
