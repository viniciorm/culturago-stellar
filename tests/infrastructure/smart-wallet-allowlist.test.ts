import { describe, expect, it } from 'vitest';
import { Account, Address, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import {
  assertSmartWalletWasmAllowlist,
  extractCreateContractWasmHashes,
} from '@/infrastructure/stellar/SmartWalletAllowlist';

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
});
