import 'server-only';
import { domainError } from '../../domain/errors';

export interface SmartWalletConfig {
  /** WASM hash used to deploy new smart wallets. */
  walletWasmHash: string;
  /** Accepted hashes when connecting to an existing wallet (upgrades). */
  acceptedWasmHashes: string[];
  /** Relayer base URL (server-only). */
  relayerBaseUrl: string | null;
  /** Relayer API key (server-only). */
  relayerApiKey: string | null;
}

/** Load smart wallet config from environment; fail closed if required fields are missing. */
export function getSmartWalletConfig(environment: 'demo' | 'testnet' | 'mainnet'): SmartWalletConfig {
  const walletWasmHash = process.env.SMART_WALLET_WASM_HASH ?? null;
  const accepted = process.env.SMART_WALLET_ACCEPTED_WASM_HASHES
    ? process.env.SMART_WALLET_ACCEPTED_WASM_HASHES.split(',').map((h) => h.trim())
    : walletWasmHash
      ? [walletWasmHash]
      : [];

  if (environment !== 'demo' && (!walletWasmHash || accepted.length === 0)) {
    throw domainError(
      'INVALID_INPUT',
      `Smart wallet WASM hash allowlist is required for ${environment}`
    );
  }

  return {
    walletWasmHash: walletWasmHash ?? '0000000000000000000000000000000000000000000000000000000000000000',
    acceptedWasmHashes: accepted,
    relayerBaseUrl: process.env.SMART_WALLET_RELAYER_BASE_URL ?? null,
    relayerApiKey: process.env.SMART_WALLET_RELAYER_API_KEY ?? null,
  };
}
