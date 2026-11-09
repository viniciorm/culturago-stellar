// Independent read-only verification of the saved synthetic Testnet proof.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Contract, Networks, TransactionBuilder, nativeToScVal, scValToNative, rpc, xdr } from '@stellar/stellar-sdk';

const evidence = JSON.parse(readFileSync(new URL('../docs/evidence/v2-canary.json', import.meta.url), 'utf8'));
const server = new rpc.Server('https://soroban-testnet.stellar.org', { timeoutInSeconds: 30 });
const contract = new Contract(evidence.contractId);
const instance = await server.getLedgerEntries(contract.getFootprint());
const wasmSha256 = instance.entries[0].val.contractData().val().instance().executable().wasmHash().toString('hex');
assert.equal(wasmSha256, evidence.wasmSha256, 'Deployed WASM differs from the recorded build');
// Separate serializer, deliberately independent of application imports.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const results = [];
for (const cred of evidence.credentials) {
  const json = canonical(cred.payload);
  const digest = createHash('sha256').update('CULTURAGO\0culturago.credential.v2\0').update(json).digest('hex');
  assert.equal(json, cred.canonical);
  assert.equal(digest, cred.digest);
  const tx = await server.getTransaction(cred.transactionHash);
  assert.equal(tx.status, 'SUCCESS');
  assert.equal(tx.ledger, cred.ledger);
  const invocation = tx.envelopeXdr.v1().tx().operations()[0].body().invokeHostFunctionOp().hostFunction().invokeContract();
  assert.equal(invocation.functionName().toString(), 'issue_credential_v2');
  const args = invocation.args().map(scValToNative);
  assert.equal(Buffer.from(args[1]).toString('hex'), cred.credentialId);
  assert.equal(Buffer.from(args[6]).toString('hex'), cred.scopeId);
  assert.equal(Buffer.from(args[7]).toString('hex'), digest);
  async function read(method, params) {
    const request = new TransactionBuilder(await server.getAccount(evidence.operator), { fee: '100', networkPassphrase: Networks.TESTNET })
      .addOperation(contract.call(method, ...params)).setTimeout(60).build();
    const response = await server.simulateTransaction(request);
    assert(!rpc.Api.isSimulationError(response), response.error);
    return scValToNative(response.result.retval);
  }
  const idArg = xdr.ScVal.scvBytes(Buffer.from(cred.credentialId, 'hex'));
  const record = await read('get_credential', [idArg]);
  assert.equal(Buffer.from(record.metadata_hash).toString('hex'), digest);
  assert.equal(record.hash_schema, 2);
  assert.equal(record.issued_ledger, cred.ledger);
  assert.equal(record.revoked, false);
  assert.equal(Buffer.from(await read('get_v2_scope', [idArg])).toString('hex'), cred.scopeId);
  const wrongDigest = Buffer.alloc(32, 255);
  assert.equal(await read('verify_credential', [idArg, xdr.ScVal.scvBytes(wrongDigest), nativeToScVal(2, { type: 'u32' })]), false);
  results.push({ publicId: cred.publicId, transaction: cred.transactionHash, ledger: tx.ledger, digest, readbackMatch: true, scopeMatch: true, alteredDigestRejected: true });
  console.log(`Verified ${cred.publicId}: transaction, canonical digest, scope, read-back and mismatch rejection`);
}
writeFileSync(new URL('../docs/evidence/v2-canary-verification.json', import.meta.url), JSON.stringify({ verifiedAt: new Date().toISOString(), environment: 'testnet', contractId: evidence.contractId, wasmSha256, deployedWasmMatches: true, method: 'RPC confirmed transactions and read-only simulations; independent serializer/hash', results }, null, 2) + '\n');
