// Criterio: lore/credenciales-v2-soroban.md — unicidad, historial y evidencia V2.
// Isolated synthetic Testnet proof. Keys exist in memory only, never logged or saved.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { Address, BASE_FEE, Contract, Keypair, Networks, Operation, TransactionBuilder, nativeToScVal, scValToNative, rpc, xdr } from '@stellar/stellar-sdk';

assert.equal(process.env.CULTURAGO_ALLOW_TESTNET_MUTATIONS, 'true', 'Explicit Testnet mutation flag required');
const root = resolve(import.meta.dirname, '..');
const compiled = join(tmpdir(), 'culturago-v2-canary-domain');
for (const file of ['src/domain/errors.ts', 'src/infrastructure/hashing/canonicalize.ts', 'src/domain/credentials/v2.ts']) {
  const target = join(compiled, file.replace(/\.ts$/, '.js'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, ts.transpileModule(readFileSync(join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
}
const require = createRequire(import.meta.url);
const { buildCanonicalPayloadV2, canonicalizePayloadV2, computePayloadDigestV2 } = require(join(compiled, 'src/domain/credentials/v2.js'));
const server = new rpc.Server('https://soroban-testnet.stellar.org', { timeoutInSeconds: 30 });
const admin = Keypair.random();
const operator = Keypair.random();
const hash = (value) => createHash('sha256').update(value).digest();
const bytes = (value) => xdr.ScVal.scvBytes(value);
const address = (key) => new Address(key.publicKey()).toScVal();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evidence = { environment: 'testnet', synthetic: true, observedAt: new Date().toISOString(), admin: admin.publicKey(), operator: operator.publicKey(), transactions: [], credentials: [] };
async function submit(operation, signer, label) {
  console.log(`Preparing ${label}`);
  const tx = new TransactionBuilder(await server.getAccount(signer.publicKey()), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET }).addOperation(operation).setTimeout(180).build();
  const sim = await server.simulateTransaction(tx);
  assert(!rpc.Api.isSimulationError(sim), `${label}: ${sim.error ?? 'simulation failed'}`);
  const prepared = rpc.assembleTransaction(tx, sim).build();
  prepared.sign(signer);
  const sent = await server.sendTransaction(prepared);
  assert(['PENDING', 'DUPLICATE'].includes(sent.status), `${label}: submission ${sent.status}`);
  for (let i = 0; i < 90; i++) {
    const result = await server.getTransaction(sent.hash);
    if (result.status === 'SUCCESS') {
      const item = { label, hash: sent.hash, ledger: result.ledger, envelopeXdr: result.envelopeXdr.toXDR('base64') };
      evidence.transactions.push(item);
      console.log(`${label}: ${sent.hash} ledger=${result.ledger}`);
      return { result, item };
    }
    assert.notEqual(result.status, 'FAILED', `${label}: failed`);
    await sleep(1000);
  }
  throw new Error(`${label}: confirmation timeout`);
}
async function read(contract, method, args) {
  const tx = new TransactionBuilder(await server.getAccount(operator.publicKey()), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET }).addOperation(contract.call(method, ...args)).setTimeout(60).build();
  const sim = await server.simulateTransaction(tx);
  assert(!rpc.Api.isSimulationError(sim), `${method}: ${sim.error}`);
  return scValToNative(sim.result.retval);
}
for (const key of [admin, operator]) {
  console.log(`Funding ephemeral Testnet account ${key.publicKey()}`);
  const response = await fetch(`https://friendbot.stellar.org/?addr=${key.publicKey()}`, { signal: AbortSignal.timeout(45000) });
  assert(response.ok, `Friendbot: ${response.status}`);
}
const wasm = readFileSync(join(root, 'contracts/target/wasm32v1-none/release/cultural_credential_registry.wasm'));
evidence.wasmSha256 = hash(wasm).toString('hex');
await submit(Operation.uploadContractWasm({ wasm }), admin, 'upload');
const deployment = await submit(Operation.createCustomContract({ address: new Address(admin.publicKey()), wasmHash: hash(wasm), salt: randomBytes(32), constructorArgs: [address(admin), address(operator), address(operator), nativeToScVal(2, { type: 'u32' })] }), admin, 'deploy');
const contractId = scValToNative(deployment.result.returnValue);
assert.match(contractId, /^C[A-Z2-7]{55}$/);
evidence.contractId = contractId;
const contract = new Contract(contractId);
const issuerId = hash('culturago.entity.v1\0synthetic-canary-issuer');
await submit(contract.call('link_issuer_operator', bytes(issuerId), address(operator)), admin, 'link-operator');
for (const index of [1, 2]) {
  const participationId = `00000000-0000-4000-8000-00000000000${index}`;
  const payload = buildCanonicalPayloadV2({ publicId: `cg2_canary000000000${index}`, credentialFamily: 'participant', participationMode: 'solo', issuer: { id: 'synthetic-canary-issuer', display_name: 'Synthetic test issuer', kind: 'organization' }, subject: { id: 'synthetic-canary-subject', display_name: 'Synthetic test participant', kind: 'person' }, event: { id: 'synthetic-canary-event', name: 'Synthetic test event' }, displayLabel: 'Test credential', displaySubtitle: 'Not a real participation', roles: ['dancer'], evidences: [{ source_type: 'participation', source_id: participationId, evidence_role: 'dancer' }], issuedAt: '2026-11-09T00:00:00.000Z' });
  const canonical = canonicalizePayloadV2(payload);
  const digest = computePayloadDigestV2(payload);
  const independentDigest = createHash('sha256').update(Buffer.from('CULTURAGO\0culturago.credential.v2\0', 'utf8')).update(Buffer.from(canonical, 'utf8')).digest('hex');
  assert.equal(digest, independentDigest);
  const id = hash(`culturago.credential.v2.id\0${payload.public_id}`);
  const scope = hash(`culturago.participation.v2\0${participationId}`);
  const args = [address(operator), bytes(id), bytes(issuerId), bytes(hash('culturago.entity.v1\0synthetic-canary-subject')), bytes(hash('culturago.entity.v1\0synthetic-canary-event')), nativeToScVal(101, { type: 'u32' }), bytes(scope), bytes(Buffer.from(digest, 'hex'))];
  const issued = await submit(contract.call('issue_credential_v2', ...args), operator, `issue-${index}`);
  const decodedArgs = issued.result.envelopeXdr.v1().tx().operations()[0].body().invokeHostFunctionOp().hostFunction().invokeContract().args().map(scValToNative);
  assert.equal(Buffer.from(decodedArgs[7]).toString('hex'), digest);
  assert.equal(Buffer.from(decodedArgs[6]).toString('hex'), scope.toString('hex'));
  const record = await read(contract, 'get_credential', [bytes(id)]);
  assert.equal(Buffer.from(record.metadata_hash).toString('hex'), digest);
  assert.equal(record.hash_schema, 2);
  assert.equal(Buffer.from(await read(contract, 'get_v2_scope', [bytes(id)])).toString('hex'), scope.toString('hex'));
  assert.equal(record.issued_ledger, issued.result.ledger);
  assert.equal(record.revoked, false);
  assert.equal(await read(contract, 'verify_credential', [bytes(id), bytes(Buffer.from(digest, 'hex')), nativeToScVal(2, { type: 'u32' })]), true);
  evidence.credentials.push({ publicId: payload.public_id, payload, canonical, digest, independentDigest, credentialId: id.toString('hex'), scopeId: scope.toString('hex'), familyCode: 101, hashSchema: 2, transactionHash: issued.item.hash, ledger: issued.item.ledger, readback: { digest: Buffer.from(record.metadata_hash).toString('hex'), issuedLedger: record.issued_ledger, revoked: record.revoked, tokenId: record.token_id.toString() }, verified: true });
}
const output = join(root, 'docs/evidence/v2-canary.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
console.log('PASS: two synthetic V2 participations, decoded arguments, confirmed ledgers and independent digest match. No product issuance or adoption claim.');
