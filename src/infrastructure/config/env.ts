import { domainError } from '../../domain/errors';

export type CulturaGoEnvironment = 'demo' | 'testnet' | 'mainnet';

export interface CulturaGoConfig {
  environment: CulturaGoEnvironment;
  stellarNetworkPassphrase: string | null;
  stellarRpcUrl: string | null;
  entityRegistryContractId: string | null;
  credentialRegistryContractId: string | null;
  stellarExplorerBase: string | null;
}

const VALID_ENVIRONMENTS: readonly CulturaGoEnvironment[] = ['demo', 'testnet', 'mainnet'];

function read(key: string): string | null {
  const value = process.env[key];
  return value && value.trim() !== '' ? value.trim() : null;
}

/**
 * Strict environment loader. No hidden defaults: a missing required variable
 * for the selected environment fails fast with a typed error. Secrets are
 * never read here for the browser: only NEXT_PUBLIC_* values are exposed.
 */
export function getPublicConfig(): CulturaGoConfig {
  const raw = read('NEXT_PUBLIC_CULTURAGO_ENV') ?? 'demo';
  if (!VALID_ENVIRONMENTS.includes(raw as CulturaGoEnvironment)) {
    throw domainError(
      'INVALID_INPUT',
      `NEXT_PUBLIC_CULTURAGO_ENV must be one of ${VALID_ENVIRONMENTS.join('|')}, got "${raw}"`
    );
  }
  const environment = raw as CulturaGoEnvironment;

  const config: CulturaGoConfig = {
    environment,
    stellarNetworkPassphrase: read('NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE'),
    stellarRpcUrl: read('NEXT_PUBLIC_STELLAR_RPC_URL'),
    entityRegistryContractId: read('NEXT_PUBLIC_ENTITY_REGISTRY_CONTRACT_ID'),
    credentialRegistryContractId: read('NEXT_PUBLIC_CREDENTIAL_REGISTRY_CONTRACT_ID'),
    stellarExplorerBase: read('NEXT_PUBLIC_STELLAR_EXPLORER_BASE'),
  };

  if (environment === 'demo') {
    const stellarKeys = [
      'stellarNetworkPassphrase',
      'stellarRpcUrl',
      'entityRegistryContractId',
      'credentialRegistryContractId',
      'stellarExplorerBase',
    ] as const;
    for (const key of stellarKeys) {
      if (config[key] !== null) {
        throw domainError(
          'INVALID_INPUT',
          `demo environment must not define ${key}; network, contract and explorer never mix across environments`
        );
      }
    }
    return config;
  }

  if (!config.stellarNetworkPassphrase || !config.stellarRpcUrl) {
    throw domainError('INVALID_INPUT', `${environment} requires Stellar network passphrase and RPC URL`);
  }

  const expectedPassphrase =
    environment === 'testnet'
      ? 'Test SDF Network ; September 2015'
      : 'Public Global Stellar Network ; September 2015';
  if (config.stellarNetworkPassphrase !== expectedPassphrase) {
    throw domainError(
      'INVALID_INPUT',
      `Network passphrase does not match ${environment}`
    );
  }

  return config;
}

/**
 * Server-only: PostgreSQL connection string. NEVER exposed to the browser,
 * never logged, never prefixed with NEXT_PUBLIC_. In demo mode it may be
 * absent (the app runs on the local mock engine).
 */
export function getDatabaseUrl(): string {
  const url = read('DATABASE_URL');
  if (!url) {
    throw domainError('INVALID_INPUT', 'DATABASE_URL is required for server-side persistence');
  }
  return url;
}

export function isPersistenceConfigured(): boolean {
  return read('DATABASE_URL') !== null;
}

export function explorerUrlForTx(txHash: string): string | null {
  const { environment, stellarExplorerBase } = getPublicConfig();
  if (environment === 'demo' || !stellarExplorerBase) return null;
  return `${stellarExplorerBase}/tx/${txHash}`;
}

export function explorerUrlForContract(contractId: string): string | null {
  const { environment, stellarExplorerBase } = getPublicConfig();
  if (environment === 'demo' || !stellarExplorerBase) return null;
  return `${stellarExplorerBase}/contract/${contractId}`;
}
