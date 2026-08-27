import 'server-only';
import { domainError } from '../../domain/errors';
import { getPublicConfig } from '../config/env';
import manifestJson from '../../../docs/manifests/testnet-manifest.json';

interface TestnetManifest {
  environment: string;
  network: {
    passphrase: string;
    rpcUrl: string;
  };
  contracts: Record<
    string,
    {
      contractId: string;
      wasmSha256: string;
    }
  >;
}

const manifest = manifestJson as TestnetManifest;

function headerValue(request: Request, name: string): string | null {
  const value = request.headers.get(name);
  if (!value) return null;
  return value.trim();
}

/**
 * Server-only guard for Testnet harness endpoints (sign, smart-wallet deploy,
 * grant-roles). Fails closed: every condition must be satisfied.
 *
 * Checks:
 *  - environment is testnet;
 *  - CULTURAGO_ALLOW_TESTNET_MUTATIONS is true;
 *  - optional token header matches the configured server-only token;
 *  - manifest contract IDs and passphrase match the public config.
 */
export async function assertTestnetHarnessAllowed(
  request: Request,
  options: {
    /** Token env var to compare against the header. If omitted, no token is required. */
    tokenEnvVar?: 'CULTURAGO_TESTNET_HARNESS_TOKEN' | 'CULTURAGO_TESTNET_ADMIN_TOKEN';
    /** Header name carrying the token. */
    tokenHeader?: string;
  } = {}
): Promise<void> {
  const publicConfig = getPublicConfig();
  if (publicConfig.environment !== 'testnet') {
    throw domainError('UNAUTHORIZED', 'harness endpoints are only allowed on testnet');
  }

  if (process.env.CULTURAGO_ALLOW_TESTNET_MUTATIONS !== 'true') {
    throw domainError('UNAUTHORIZED', 'testnet mutations are disabled (CULTURAGO_ALLOW_TESTNET_MUTATIONS)');
  }

  if (options.tokenEnvVar) {
    const tokenHeader = options.tokenHeader ?? 'x-culturago-testnet-harness-token';
    const expected = process.env[options.tokenEnvVar]?.trim();
    if (expected) {
      const provided = headerValue(request, tokenHeader);
      if (provided !== expected) {
        throw domainError('UNAUTHORIZED', 'invalid or missing testnet harness token');
      }
    }
  }

  assertTestnetManifestMatches();
}

export function assertTestnetManifestMatches(): void {
  const publicConfig = getPublicConfig();

  if (manifest.environment !== 'testnet') {
    throw domainError('UNAUTHORIZED', 'manifest is not for testnet');
  }

  if (manifest.network.passphrase !== publicConfig.stellarNetworkPassphrase) {
    throw domainError(
      'UNAUTHORIZED',
      'manifest network passphrase does not match public configuration'
    );
  }

  const entity = manifest.contracts.cultural_entity_registry;
  const credential = manifest.contracts.cultural_credential_registry;

  if (
    !entity ||
    !credential ||
    entity.contractId !== publicConfig.entityRegistryContractId ||
    credential.contractId !== publicConfig.credentialRegistryContractId
  ) {
    throw domainError(
      'UNAUTHORIZED',
      'manifest contract IDs do not match public configuration'
    );
  }
}
