import 'server-only';
import { Transaction, TransactionBuilder, xdr, hash, StrKey } from '@stellar/stellar-sdk';
import { domainError } from '../../domain/errors';

interface TxEnvelopeValue {
  tx(): { operations(): xdr.Operation[] };
}

interface ContractExecutableWithWasmHash {
  switch(): { value: number };
  wasmHash(): Buffer;
}

interface CreateContractArgsWithExecutable {
  executable(): xdr.ContractExecutable;
}

interface InvokeHostFunctionOpWithHostFunction {
  hostFunction(): xdr.HostFunction;
}

function wasmHashFromExecutable(executable: xdr.ContractExecutable): string | null {
  if (executable.switch().value !== 0) return null;
  try {
    const wasmHash = (executable as ContractExecutableWithWasmHash).wasmHash();
    if (!wasmHash) return null;
    return Buffer.from(wasmHash).toString('hex');
  } catch {
    return null;
  }
}

function extractWasmHashFromHostFunction(func: xdr.HostFunction): string | null {
  const hostFnType = func.switch().value;
  // 1 = create contract (v1), 2 = create contract (v1 deprecated in some protocols),
  // 3 = create contract v2 (constructor args).
  if (hostFnType !== 1 && hostFnType !== 2 && hostFnType !== 3) return null;

  try {
    const createArgs = func.value() as CreateContractArgsWithExecutable;
    if (!createArgs) return null;
    const exec = createArgs.executable();
    return wasmHashFromExecutable(exec);
  } catch {
    return null;
  }
}

function extractWasmHashesFromOperation(op: xdr.Operation): string[] {
  const body = op.body();
  if (!/invoke.?host.?function/i.test(body.switch().name)) return [];

  try {
    const hostFn = body.invokeHostFunctionOp() as unknown as InvokeHostFunctionOpWithHostFunction;
    const func = hostFn.hostFunction();
    const hash = extractWasmHashFromHostFunction(func);
    return hash ? [hash] : [];
  } catch {
    return [];
  }
}

function getInnerTransaction(
  tx: Transaction | { innerTransaction?: Transaction }
): Transaction {
  if ('innerTransaction' in tx && tx.innerTransaction) {
    return tx.innerTransaction;
  }
  return tx as Transaction;
}

/**
 * Extract all WASM hashes used in create-contract host functions from a signed
 * Stellar transaction. Returns an empty array if the XDR cannot be parsed.
 */
export function extractCreateContractWasmHashes(
  signedTxXdr: string,
  networkPassphrase: string
): string[] {
  try {
    const parsed = TransactionBuilder.fromXDR(signedTxXdr, networkPassphrase) as
      | Transaction
      | { innerTransaction?: Transaction };
    const tx = getInnerTransaction(parsed);
    const envelope = tx.toEnvelope();
    const envelopeType = envelope.switch().name;

    if (
      envelopeType !== 'envelopeTypeTx' &&
      envelopeType !== 'envelopeTypeTxV0'
    ) {
      return [];
    }

    const value = envelope.value() as TxEnvelopeValue;
    const txInner = value.tx();
    const operations = txInner.operations();

    const hashes: string[] = [];
    for (const op of operations) {
      const hash = extractWasmHashesFromOperation(op);
      hashes.push(...hash);
    }
    return hashes;
  } catch {
    return [];
  }
}

interface CreateContractArgsWithPreimage {
  contractIdPreimage(): xdr.ContractIdPreimage;
}

function extractContractIdPreimage(func: xdr.HostFunction): xdr.ContractIdPreimage | null {
  const hostFnType = func.switch().value;
  // create contract v1/v2 host function types
  if (hostFnType !== 1 && hostFnType !== 2 && hostFnType !== 3) return null;

  try {
    const createArgs = func.value() as unknown as CreateContractArgsWithPreimage;
    if (!createArgs) return null;
    return createArgs.contractIdPreimage();
  } catch {
    return null;
  }
}

function deriveContractAddressFromPreimage(
  preimage: xdr.ContractIdPreimage,
  networkPassphrase: string
): string | null {
  if (preimage.switch().name.toLowerCase() !== 'contractidpreimagefromaddress') return null;

  try {
    const fromAddress = preimage.fromAddress();
    const networkId = hash(Buffer.from(networkPassphrase));
    const contractIdPreimage = xdr.ContractIdPreimage.contractIdPreimageFromAddress(
      new xdr.ContractIdPreimageFromAddress({
        address: fromAddress.address(),
        salt: fromAddress.salt(),
      })
    );
    const idPreimage = xdr.HashIdPreimage.envelopeTypeContractId(
      new xdr.HashIdPreimageContractId({
        networkId,
        contractIdPreimage,
      })
    );
    return StrKey.encodeContract(hash(idPreimage.toXDR()));
  } catch {
    return null;
  }
}

function deriveContractAddressFromOperation(
  op: xdr.Operation,
  networkPassphrase: string
): string | null {
  const body = op.body();
  if (!/invoke.?host.?function/i.test(body.switch().name)) return null;

  try {
    const hostFn = body.invokeHostFunctionOp() as unknown as InvokeHostFunctionOpWithHostFunction;
    const func = hostFn.hostFunction();
    const preimage = extractContractIdPreimage(func);
    if (!preimage) return null;
    return deriveContractAddressFromPreimage(preimage, networkPassphrase);
  } catch {
    return null;
  }
}

/**
 * Derive the deterministic smart-wallet contract address from the signed deploy
 * transaction's create-contract preimage. Returns null when the XDR cannot be
 * parsed or does not contain a create-contract operation.
 */
export function deriveSmartWalletContractAddress(
  signedTxXdr: string,
  networkPassphrase: string
): string | null {
  try {
    const parsed = TransactionBuilder.fromXDR(signedTxXdr, networkPassphrase) as
      | Transaction
      | { innerTransaction?: Transaction };
    const tx = getInnerTransaction(parsed);
    const envelope = tx.toEnvelope();
    const envelopeType = envelope.switch().name;

    if (
      envelopeType !== 'envelopeTypeTx' &&
      envelopeType !== 'envelopeTypeTxV0'
    ) {
      return null;
    }

    const value = envelope.value() as TxEnvelopeValue;
    const txInner = value.tx();
    const operations = txInner.operations();

    for (const op of operations) {
      const addr = deriveContractAddressFromOperation(op, networkPassphrase);
      if (addr) return addr;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Verify that the client-provided contractId is the deterministic address
 * derived from the signed deploy transaction.
 */
export function assertSmartWalletContractAddress(
  signedTxXdr: string,
  networkPassphrase: string,
  expectedContractId: string
): string {
  const derived = deriveSmartWalletContractAddress(signedTxXdr, networkPassphrase);
  if (!derived) {
    throw domainError('INVALID_INPUT', 'could not derive contract address from deploy XDR');
  }
  if (derived !== expectedContractId) {
    throw domainError('INVALID_INPUT', 'contractId does not match derived deploy address');
  }
  return derived;
}

/**
 * Validate that a smart-wallet deployment XDR only creates contracts from an
 * approved WASM hash allowlist. Fails closed: if the allowlist is empty or no
 * WASM hash is present, the deployment is rejected.
 */
export function assertSmartWalletWasmAllowlist(
  signedTxXdr: string,
  networkPassphrase: string,
  allowlist: readonly string[]
): string[] {
  if (allowlist.length === 0) {
    throw domainError(
      'UNAUTHORIZED',
      'smart wallet WASM allowlist is empty; configure SMART_WALLET_WASM_ALLOWLIST before deploying'
    );
  }

  const normalizedAllowlist = allowlist.map((h) => h.toLowerCase().replace(/^0x/, ''));
  const hashes = extractCreateContractWasmHashes(signedTxXdr, networkPassphrase);

  if (hashes.length === 0) {
    throw domainError(
      'UNAUTHORIZED',
      'signed transaction does not contain a create-contract WASM hash'
    );
  }

  const invalid = hashes.filter((h) => !normalizedAllowlist.includes(h.toLowerCase()));
  if (invalid.length > 0) {
    throw domainError(
      'UNAUTHORIZED',
      `smart wallet WASM hash ${invalid[0]} is not in the allowlist`
    );
  }

  return hashes;
}
