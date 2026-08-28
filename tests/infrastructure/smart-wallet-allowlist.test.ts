import { beforeAll, describe, expect, it, afterAll } from 'vitest';
import { Account, Address, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import {
  assertSmartWalletWasmAllowlist,
  assertSmartWalletContractAddress,
  deriveSmartWalletContractAddress,
  extractCreateContractWasmHashes,
} from '@/infrastructure/stellar/SmartWalletAllowlist';
import { getStellarNetworkConfig } from '@/infrastructure/stellar/networkConfig';

const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

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

describe('SmartWalletAllowlist', () => {
  it('extracts wasm hash from createCustomContract operation', () => {
    const wasmHash = 'a'.repeat(64);
    const xdr = deployXdrForWasmHash(wasmHash);
    const hashes = extractCreateContractWasmHashes(xdr, TESTNET_PASSPHRASE);
    expect(hashes).toContain(wasmHash);
  });

  it('rejects unknown wasm hash', () => {
    const wasmHash = 'b'.repeat(64);
    const xdr = deployXdrForWasmHash(wasmHash);
    expect(() =>
      assertSmartWalletWasmAllowlist(xdr, TESTNET_PASSPHRASE, ['a'.repeat(64)])
    ).toThrow('not in the allowlist');
  });

  it('accepts known wasm hash', () => {
    const wasmHash = 'c'.repeat(64);
    const xdr = deployXdrForWasmHash(wasmHash);
    const hashes = assertSmartWalletWasmAllowlist(xdr, TESTNET_PASSPHRASE, [wasmHash]);
    expect(hashes).toContain(wasmHash);
  });

  it('accepts the canonical passkey-kit v1 wasm hash from the manifest', () => {
    const canonicalHash = 'fdefad64b96837147e1c333e51f537b696eab925e9f147e63d597c04e3c903f0';
    const xdr = deployXdrForWasmHash(canonicalHash);
    const hashes = assertSmartWalletWasmAllowlist(xdr, TESTNET_PASSPHRASE, [canonicalHash]);
    expect(hashes).toContain(canonicalHash);
  });

  it('fails closed when the allowlist is empty', () => {
    const xdr = deployXdrForWasmHash('a'.repeat(64));
    expect(() => assertSmartWalletWasmAllowlist(xdr, TESTNET_PASSPHRASE, [])).toThrow(
      'smart wallet WASM allowlist is empty'
    );
  });

  it('rejects a JSON fake payload outside demo', () => {
    expect(() =>
      assertSmartWalletWasmAllowlist('{"mode":"signed"}', TESTNET_PASSPHRASE, ['a'.repeat(64)])
    ).toThrow('signed transaction does not contain a create-contract WASM hash');
  });

  it('derives the deterministic contract address from a deploy XDR', () => {
    const xdr = deployXdrForWasmHash('a'.repeat(64));
    const derived = deriveSmartWalletContractAddress(xdr, TESTNET_PASSPHRASE);
    expect(derived).toMatch(/^C[A-Z2-7]{55}$/);
  });

  it('assertSmartWalletContractAddress accepts the derived contract id', () => {
    const xdr = deployXdrForWasmHash('a'.repeat(64));
    const derived = deriveSmartWalletContractAddress(xdr, TESTNET_PASSPHRASE);
    expect(assertSmartWalletContractAddress(xdr, TESTNET_PASSPHRASE, derived!)).toBe(derived);
  });

  it('rejects a client-provided contract id that does not match the derived address', () => {
    const xdr = deployXdrForWasmHash('a'.repeat(64));
    expect(() =>
      assertSmartWalletContractAddress(xdr, TESTNET_PASSPHRASE, 'CINVALIDINVALIDINVALIDINVALIDINVALIDINVALIDINVALIDIN')
    ).toThrow('contractId does not match derived deploy address');
  });
});

describe('getStellarNetworkConfig smart-wallet allowlist', () => {
  const originalEnv = { ...process.env };

  beforeAll(() => {
    process.env.NEXT_PUBLIC_CULTURAGO_ENV = 'testnet';
    process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE = TESTNET_PASSPHRASE;
    process.env.NEXT_PUBLIC_STELLAR_RPC_URL = 'https://soroban-testnet.stellar.org';
    process.env.NEXT_PUBLIC_ENTITY_REGISTRY_CONTRACT_ID = 'CBUUMXY77DF4QG5KY5H37SEV63HOLPIVEUZGP2UEQ4PGBNWC2JYFJQGO';
    process.env.NEXT_PUBLIC_CREDENTIAL_REGISTRY_CONTRACT_ID = 'CBQPZU6O2HTURYQBMYYZ3DDZBTT67AYCXMT5YUYOSVQU5PUCBW642RJ6';
    process.env.STELLAR_SMART_WALLET_WASM_ALLOWLIST = '';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('falls back to the manifest allowlist when the env allowlist is empty', () => {
    const config = getStellarNetworkConfig();
    expect(config.smartWalletWasmAllowlist).toContain(
      'fdefad64b96837147e1c333e51f537b696eab925e9f147e63d597c04e3c903f0'
    );
  });
});
