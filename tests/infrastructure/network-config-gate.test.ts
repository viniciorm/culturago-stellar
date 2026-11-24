import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { getPublicConfig } from '@/infrastructure/config/env';
import {
  getStellarNetworkConfig,
  getTestnetOperatorSignerConfig,
  inspectTestnetV2SigningReadiness,
} from '@/infrastructure/stellar/networkConfig';

describe('public secret gate', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_CULTURAGO_ENV', 'demo');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects NEXT_PUBLIC_* variables with SECRET in the name', () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_SECRET', 'not-a-secret-value');
    expect(() => getPublicConfig()).toThrow(/public environment variable must not reference secrets/);
  });

  it('rejects NEXT_PUBLIC_* values that contain a Stellar secret seed', () => {
    const secret = Keypair.random().secret();
    vi.stubEnv('NEXT_PUBLIC_STELLAR_RPC_URL', secret);
    expect(() => getPublicConfig()).toThrow(/public environment variable .* appears to contain a Stellar secret/);
  });

  it('allows harmless NEXT_PUBLIC_ variables', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com');
    expect(() => getPublicConfig()).not.toThrow();
  });

  it('rejects NEXT_PUBLIC_CULTURAGO_ENV="development" with descriptive DomainError', () => {
    vi.stubEnv('NEXT_PUBLIC_CULTURAGO_ENV', 'development');
    expect(() => getPublicConfig()).toThrow(
      /NEXT_PUBLIC_CULTURAGO_ENV must be one of demo\|testnet\|mainnet, got "development"/
    );
  });

  it('accepts dev deployment with NEXT_PUBLIC_ENVIRONMENT="development" and NEXT_PUBLIC_CULTURAGO_ENV="testnet"', () => {
    vi.stubEnv('NEXT_PUBLIC_ENVIRONMENT', 'development');
    vi.stubEnv('NEXT_PUBLIC_CULTURAGO_ENV', 'testnet');
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE', 'Test SDF Network ; September 2015');
    vi.stubEnv('NEXT_PUBLIC_STELLAR_RPC_URL', 'https://soroban-testnet.stellar.org');
    const config = getPublicConfig();
    expect(config.environment).toBe('testnet');
  });
});

describe('stellar key role separation', () => {
  const fee = Keypair.random();
  const admin = Keypair.random();
  const fixture = Keypair.random();

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_CULTURAGO_ENV', 'testnet');
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE', 'Test SDF Network ; September 2015');
    vi.stubEnv('NEXT_PUBLIC_STELLAR_RPC_URL', 'https://soroban-testnet.stellar.org');
    vi.stubEnv('NEXT_PUBLIC_ENTITY_REGISTRY_CONTRACT_ID', 'CBUUMXY77DF4QG5KY5H37SEV63HOLPIVEUZGP2UEQ4PGBNWC2JYFJQGO');
    vi.stubEnv('NEXT_PUBLIC_CREDENTIAL_REGISTRY_CONTRACT_ID', 'CBQPZU6O2HTURYQBMYYZ3DDZBTT67AYCXMT5YUYOSVQU5PUCBW642RJ6');
    vi.stubEnv('CULTURAGO_ALLOW_TESTNET_MUTATIONS', 'false');
    vi.stubEnv('CULTURAGO_ALLOW_TESTNET_FIXTURE_SIGNER', 'false');
    vi.stubEnv('STELLAR_TESTNET_ADMIN_ADDRESS', '');
    vi.stubEnv('STELLAR_TESTNET_OPERATOR_ADDRESS', '');
    vi.stubEnv('STELLAR_TESTNET_OPERATOR_SECRET', '');
    vi.stubEnv('STELLAR_TESTNET_FIXTURE_SECRET', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects a fee payer secret that does not match the configured address', () => {
    vi.stubEnv('STELLAR_FEEPAYER_ADDRESS', fee.publicKey());
    vi.stubEnv('STELLAR_FEEPAYER_SECRET', admin.secret());
    expect(() => getStellarNetworkConfig()).toThrow(/STELLAR_FEEPAYER_SECRET does not match/);
  });

  it('rejects fee payer address that matches the testnet admin address', () => {
    vi.stubEnv('STELLAR_FEEPAYER_ADDRESS', admin.publicKey());
    vi.stubEnv('STELLAR_FEEPAYER_SECRET', admin.secret());
    vi.stubEnv('STELLAR_TESTNET_ADMIN_ADDRESS', admin.publicKey());
    expect(() => getStellarNetworkConfig()).toThrow(/STELLAR_FEEPAYER_ADDRESS must not match STELLAR_TESTNET_ADMIN_ADDRESS/);
  });

  it('rejects fee payer address that matches the fixture signer address', () => {
    vi.stubEnv('STELLAR_FEEPAYER_ADDRESS', fixture.publicKey());
    vi.stubEnv('STELLAR_FEEPAYER_SECRET', fixture.secret());
    vi.stubEnv('STELLAR_TESTNET_FIXTURE_SECRET', fixture.secret());
    expect(() => getStellarNetworkConfig()).toThrow(/STELLAR_FEEPAYER_ADDRESS must not match the fixture signer address/);
  });

  it('exposes max fee and relayer budget in network config', () => {
    vi.stubEnv('STELLAR_FEEPAYER_ADDRESS', fee.publicKey());
    vi.stubEnv('STELLAR_FEEPAYER_SECRET', fee.secret());
    vi.stubEnv('STELLAR_MAX_FEE_STROKES', '10000');
    vi.stubEnv('STELLAR_RELAYER_DAILY_BUDGET', '50');
    const config = getStellarNetworkConfig();
    expect(config.maxFeeStrokes).toBe(10000);
    expect(config.relayerDailyBudget).toBe(50);
  });

  it('rejects invalid numeric fee and budget env values', () => {
    vi.stubEnv('STELLAR_FEEPAYER_ADDRESS', fee.publicKey());
    vi.stubEnv('STELLAR_FEEPAYER_SECRET', fee.secret());
    vi.stubEnv('STELLAR_MAX_FEE_STROKES', 'not-a-number');
    expect(() => getStellarNetworkConfig()).toThrow(/STELLAR_MAX_FEE_STROKES must be a positive integer/);
  });

  it('validates project-controlled Testnet operator signer and enforces role separation from admin', () => {
    const operator = Keypair.random();
    vi.stubEnv('CULTURAGO_ALLOW_TESTNET_MUTATIONS', 'true');
    vi.stubEnv('STELLAR_TESTNET_OPERATOR_SECRET', operator.secret());
    vi.stubEnv('STELLAR_TESTNET_OPERATOR_ADDRESS', operator.publicKey());
    vi.stubEnv('STELLAR_TESTNET_ADMIN_ADDRESS', admin.publicKey());

    const cfg = getTestnetOperatorSignerConfig();
    expect(cfg.operatorAddress).toBe(operator.publicKey());

    const readiness = inspectTestnetV2SigningReadiness();
    expect(readiness.ready).toBe(true);
    expect(readiness.missingRequirements).toEqual([]);
    expect(readiness.operatorAddress).toBe(operator.publicKey());

    // Operator address must never equal admin address
    vi.stubEnv('STELLAR_TESTNET_ADMIN_ADDRESS', operator.publicKey());
    expect(() => getTestnetOperatorSignerConfig()).toThrow(
      /STELLAR_TESTNET_OPERATOR_ADDRESS must be distinct from STELLAR_TESTNET_ADMIN_ADDRESS/
    );
  });

  it('reports exact missing requirements when Testnet operator signer is not configured', () => {
    vi.stubEnv('CULTURAGO_ALLOW_TESTNET_MUTATIONS', 'false');
    vi.stubEnv('STELLAR_TESTNET_OPERATOR_SECRET', '');
    vi.stubEnv('NEXT_PUBLIC_CREDENTIAL_REGISTRY_CONTRACT_ID', '');

    const readiness = inspectTestnetV2SigningReadiness();
    expect(readiness.ready).toBe(false);
    expect(readiness.missingRequirements).toContain('NEXT_PUBLIC_CREDENTIAL_REGISTRY_CONTRACT_ID');
    expect(readiness.missingRequirements).toContain('CULTURAGO_ALLOW_TESTNET_MUTATIONS=true');
    expect(readiness.missingRequirements).toContain('STELLAR_TESTNET_OPERATOR_SECRET');
  });
});
