import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Account, Address, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { POST } from '@/app/api/smart-wallet/deploy/route';
import { deriveSmartWalletContractAddress } from '@/infrastructure/stellar/SmartWalletAllowlist';

const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const CANONICAL_WASM_HASH = 'fdefad64b96837147e1c333e51f537b696eab925e9f147e63d597c04e3c903f0';

function deployXdrForWasmHash(wasmHashHex: string): string {
  const source = Keypair.random();
  const wasmHash = Buffer.from(wasmHashHex, 'hex');
  const op = Operation.createCustomContract({
    address: new Address(source.publicKey()),
    wasmHash,
    salt: Buffer.alloc(32),
  });

  const account = new Account(source.publicKey(), '12345678');
  const tx = new TransactionBuilder(account, {
    fee: '100000',
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(0)
    .build();

  return tx.toXDR();
}

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CULTURAGO_ENV = 'demo';
  process.env.CULTURAGO_TRUSTED_ORIGINS = 'http://localhost:3000';
  process.env.SMART_WALLET_RELAYER_BASE_URL = 'https://relayer.example';
  process.env.SMART_WALLET_RELAYER_API_KEY = 'test-api-key';
});

vi.mock('passkey-kit/server', () => ({
  PasskeyServer: vi.fn(),
}));

vi.mock('@/infrastructure/stellar/networkConfig', () => ({
  getStellarNetworkConfig: vi.fn(),
}));

describe('/api/smart-wallet/deploy route', () => {
  const originalEnv: NodeJS.ProcessEnv = { ...process.env };

  beforeAll(async () => {
    const { getStellarNetworkConfig } = await import('@/infrastructure/stellar/networkConfig');
    vi.mocked(getStellarNetworkConfig).mockReturnValue({
      environment: 'testnet',
      networkPassphrase: TESTNET_PASSPHRASE,
      rpcUrl: 'https://soroban-testnet.stellar.org',
      entityRegistryContractId: 'CBUUMXY77DF4QG5KY5H37SEV63HOLPIVEUZGP2UEQ4PGBNWC2JYFJQGO',
      credentialRegistryContractId: 'CBQPZU6O2HTURYQBMYYZ3DDZBTT67AYCXMT5YUYOSVQU5PUCBW642RJ6',
      smartWalletWasmAllowlist: [CANONICAL_WASM_HASH],
      explorerBase: null,
      feePayerAddress: null,
      feePayerSecret: null,
      maxFeeStrokes: 100_000,
      relayerDailyBudget: 500,
    });
  });

  afterAll(() => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it('rejects a wasm hash outside the allowlist', async () => {
    const signedTx = deployXdrForWasmHash('a'.repeat(64));
    const contractId = deriveSmartWalletContractAddress(signedTx, TESTNET_PASSPHRASE);

    const res = await POST(
      new Request('http://localhost/api/smart-wallet/deploy', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
        body: JSON.stringify({ signedTx, contractId }),
      })
    );

    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toMatch(/allowlist/);
  });

  it('accepts the canonical wasm hash and reaches relayer validation', async () => {
    const signedTx = deployXdrForWasmHash(CANONICAL_WASM_HASH);
    const contractId = deriveSmartWalletContractAddress(signedTx, TESTNET_PASSPHRASE);

    const res = await POST(
      new Request('http://localhost/api/smart-wallet/deploy', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
        body: JSON.stringify({ signedTx, contractId }),
      })
    );

    expect(res.status).not.toBe(400);
    const body = await res.json();
    expect(body.error).not.toMatch(/allowlist/);
    expect(body.error).not.toMatch(/contractId/);
  });
});
