#!/usr/bin/env node
// SDK-based smoke exercise against the already-deployed Testnet contracts.
// Captures tx hashes/ledgers, performs on-chain readback, and runs cleanup
// in a finally block so we revoke roles and unlink the operator even on failure.
// Admin (contract admin) grants roles and links the operator; the operator
// performs all entity/credential actions. Deployer is not used at runtime.
import { readFileSync } from 'node:fs';
import https from 'node:https';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import {
  BASE_FEE,
  Keypair,
  Contract,
  TransactionBuilder,
  rpc,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = process.env.TESTNET_MANIFEST_PATH ?? resolve(__dirname, '..', 'docs', 'manifests', 'testnet-manifest.json');

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERT FAIL: ${message}`);
  }
}

function bytes32Hex(input) {
  if (typeof input === 'string') return createHash('sha256').update(input).digest('hex');
  return input.toString('hex');
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
assert(manifest.environment === 'testnet', 'manifest environment must be testnet');
assert(manifest.contracts.cultural_entity_registry.contractId, 'entity contract not deployed; run testnet-smoke --execute first');
assert(manifest.contracts.cultural_credential_registry.contractId, 'credential contract not deployed; run testnet-smoke --execute first');

assert(process.env.CULTURAGO_ALLOW_TESTNET_MUTATIONS === 'true', 'CULTURAGO_ALLOW_TESTNET_MUTATIONS=true is required');
assert(process.env.STELLAR_TESTNET_ADMIN_SECRET, 'STELLAR_TESTNET_ADMIN_SECRET is required');
assert(process.env.STELLAR_TESTNET_ADMIN_ADDRESS, 'STELLAR_TESTNET_ADMIN_ADDRESS is required');

const adminKeypair = Keypair.fromSecret(process.env.STELLAR_TESTNET_ADMIN_SECRET);
const adminAddress = adminKeypair.publicKey();
assert(adminAddress === process.env.STELLAR_TESTNET_ADMIN_ADDRESS, 'admin public key must match STELLAR_TESTNET_ADMIN_ADDRESS');

const operatorSecret = process.env.STELLAR_TESTNET_OPERATOR_SECRET ?? process.env.STELLAR_TESTNET_FIXTURE_SECRET;
assert(operatorSecret, 'STELLAR_TESTNET_OPERATOR_SECRET or STELLAR_TESTNET_FIXTURE_SECRET is required');
const operatorKeypair = Keypair.fromSecret(operatorSecret);
const operatorAddress = operatorKeypair.publicKey();

const operatorEnvAddress = process.env.STELLAR_TESTNET_OPERATOR_ADDRESS ?? process.env.STELLAR_TESTNET_ISSUER_OPERATOR_ADDRESS;
if (operatorEnvAddress) {
  assert(operatorAddress === operatorEnvAddress, 'operator public key must match STELLAR_TESTNET_OPERATOR_ADDRESS or STELLAR_TESTNET_ISSUER_OPERATOR_ADDRESS');
}

assert(adminAddress !== operatorAddress, 'admin and operator must be different accounts');

const networkPassphrase = manifest.network.passphrase;
const rpcUrl = manifest.network.rpcUrl;
const entityContractId = manifest.contracts.cultural_entity_registry.contractId;
const credentialContractId = manifest.contracts.cultural_credential_registry.contractId;
const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });

const MAX_FEE_STROKES = Number(process.env.STELLAR_MAX_FEE_STROKES ?? 500_000);
assert(Number.isInteger(MAX_FEE_STROKES) && MAX_FEE_STROKES >= 1, 'STELLAR_MAX_FEE_STROKES must be a positive integer');

const records = [];

function logStep(step, result) {
  records.push({ step, txHash: result.txHash, ledger: result.ledger });
  console.log(`  ${step}: tx=${result.txHash} ledger=${result.ledger} result=${result.result ?? ''}`);
}

function hexOf(value) {
  if (value == null) return '';
  if (Buffer.isBuffer(value)) return value.toString('hex');
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
  return String(value);
}

function addressArg(value) {
  return nativeToScVal(value, { type: 'address' });
}

function bytes32Arg(hex) {
  return xdr.ScVal.scvBytes(Buffer.from(hex, 'hex'));
}

function u32Arg(value) {
  return nativeToScVal(Number(value), { type: 'u32' });
}

function noneArg() {
  return xdr.ScVal.scvVoid();
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function friendbotFund(address) {
  const url = `https://friendbot.stellar.org/?addr=${address}`;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        const alreadyFunded = data.includes('already exists') || data.includes('already funded to starting balance');
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else if (res.statusCode === 400 && alreadyFunded) resolve(data);
        else reject(new Error(`friendbot ${res.statusCode}: ${data}`));
      });
    }).on('error', reject);
  });
}

async function waitForTransaction(hash, method) {
  let lastStatus = 'PENDING';
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await server.getTransaction(hash);
    lastStatus = result.status;
    if (result.status === 'SUCCESS') {
      return result;
    }
    if (result.status === 'FAILED') {
      throw new Error(`${method} transaction failed: ${JSON.stringify(result)}`);
    }
    await sleep(1000);
  }
  throw new Error(`${method} transaction ${hash} timed out, last status: ${lastStatus}`);
}

async function submitInvocation(contractId, method, args, signer, sourceAccount = signer.publicKey()) {
  const account = await server.getAccount(sourceAccount);
  const contract = new Contract(contractId);
  const operation = contract.call(method, ...args);
  const tx = new TransactionBuilder(account, {
    fee: String(BASE_FEE),
    networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(180)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`${method} simulation error: ${sim.error}`);
  }
  if (rpc.Api.isSimulationRestore(sim)) {
    throw new Error(`${method} requires a ledger entry restore`);
  }
  if (!rpc.Api.isSimulationSuccess(sim)) {
    throw new Error(`${method} unexpected simulation state: ${JSON.stringify(sim)}`);
  }

  const prepared = rpc.assembleTransaction(tx, sim).build();
  const totalFee = Number(prepared.fee);
  if (Number.isNaN(totalFee) || totalFee > MAX_FEE_STROKES) {
    throw new Error(`${method} assembled fee ${totalFee} exceeds max fee ${MAX_FEE_STROKES}`);
  }
  prepared.sign(signer);

  const sent = await server.sendTransaction(prepared);
  if (sent.status === 'ERROR') {
    throw new Error(`${method} send error: ${JSON.stringify(sent)}`);
  }

  const result = await waitForTransaction(sent.hash, method);
  return {
    txHash: sent.hash,
    ledger: result.ledger,
    result: result.result ? scValToNative(result.result) : undefined,
  };
}

async function query(contractId, method, args, sourceAccount = operatorAddress) {
  const account = await server.getAccount(sourceAccount);
  const contract = new Contract(contractId);
  const operation = contract.call(method, ...args);
  const tx = new TransactionBuilder(account, {
    fee: String(BASE_FEE),
    networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(180)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) {
    throw new Error(`${method} readback simulation failed: ${JSON.stringify(sim)}`);
  }

  return scValToNative(sim.result.retval);
}

async function readbackEntity(entityId, expectedLedger) {
  const head = await query(entityContractId, 'get_entity', [bytes32Arg(entityId)]);
  assert(head && head.active === true, 'entity readback returned inactive or missing head');
  assert(head.updated_ledger === expectedLedger, `entity readback ledger mismatch: ${head.updated_ledger} !== ${expectedLedger}`);
}

async function readbackCredential(credentialId, expected, kind) {
  const record = await query(credentialContractId, 'get_credential', [bytes32Arg(credentialId)]);
  assert(record, `credential readback returned no record for ${kind}`);

  if (kind === 'issued') {
    assert(record.revoked === false, 'credential should not be revoked right after issue');
    assert(record.issued_ledger === expected.ledger, `credential issued_ledger mismatch: ${record.issued_ledger} !== ${expected.ledger}`);
    assert(hexOf(record.credential_id) === credentialId, 'credential_id mismatch');
    assert(hexOf(record.issuer_id) === expected.issuer_id, 'issuer_id mismatch');
    assert(hexOf(record.subject_id) === expected.subject_id, 'subject_id mismatch');
    assert(hexOf(record.event_id) === expected.event_id, 'event_id mismatch');
    assert(hexOf(record.metadata_hash) === expected.metadata_hash, 'metadata_hash mismatch');
    assert(record.hash_schema === expected.hash_schema, 'hash_schema mismatch');
    assert(record.credential_type === expected.credential_type, 'credential_type mismatch');
  }

  if (kind === 'revoked') {
    assert(record.revoked === true, 'credential should be revoked after revoke');
    assert(record.revoked_ledger === expected.ledger, `credential revoked_ledger mismatch: ${record.revoked_ledger} !== ${expected.ledger}`);
  }
}

async function cleanupStep(contractId, method, args, signer) {
  const result = await submitInvocation(contractId, method, args, signer);
  logStep(`cleanup ${method}`, result);
}

async function main() {
  const entity_id = bytes32Hex(randomBytes(32));
  const metadata_hash = bytes32Hex(randomBytes(32));
  const issuer_id = bytes32Hex(randomBytes(32));
  const subject_id = bytes32Hex(randomBytes(32));
  const event_id = bytes32Hex(randomBytes(32));
  const credential_id = bytes32Hex(randomBytes(32));

  console.log(`Admin: ${adminAddress}`);
  console.log(`Operator: ${operatorAddress}`);
  console.log(`Entity contract: ${entityContractId}`);
  console.log(`Credential contract: ${credentialContractId}`);

  console.log('\nFunding accounts via friendbot...');
  await friendbotFund(adminAddress);
  await friendbotFund(operatorAddress);

  let credentialIssued = false;
  let issuerLinked = false;
  let mainError = null;

  try {
    console.log('\n1. grant_registrar to operator');
    const grantReg = await submitInvocation(entityContractId, 'grant_registrar', [
      addressArg(adminAddress),
      addressArg(operatorAddress),
    ], adminKeypair, adminAddress);
    logStep('grant_registrar', grantReg);

    console.log('\n2. grant_issuer to operator');
    const grantIssuer = await submitInvocation(credentialContractId, 'grant_issuer', [
      addressArg(adminAddress),
      addressArg(operatorAddress),
    ], adminKeypair, adminAddress);
    logStep('grant_issuer', grantIssuer);

    console.log('\n3. grant_revoker to operator');
    const grantRevoker = await submitInvocation(credentialContractId, 'grant_revoker', [
      addressArg(adminAddress),
      addressArg(operatorAddress),
    ], adminKeypair, adminAddress);
    logStep('grant_revoker', grantRevoker);

    console.log('\n4. link_issuer_operator');
    const link = await submitInvocation(credentialContractId, 'link_issuer_operator', [
      bytes32Arg(issuer_id),
      addressArg(operatorAddress),
    ], adminKeypair, adminAddress);
    logStep('link_issuer_operator', link);
    issuerLinked = true;

    console.log('\n5. register_entity (operator)');
    const reg = await submitInvocation(entityContractId, 'register_entity', [
      addressArg(operatorAddress),
      bytes32Arg(entity_id),
      bytes32Arg(metadata_hash),
      u32Arg(1),
    ], operatorKeypair, operatorAddress);
    logStep('register_entity', reg);
    await readbackEntity(entity_id, reg.ledger);

    console.log('\n6. issue_credential (operator)');
    const issue = await submitInvocation(credentialContractId, 'issue_credential', [
      addressArg(operatorAddress),
      bytes32Arg(credential_id),
      bytes32Arg(issuer_id),
      bytes32Arg(subject_id),
      bytes32Arg(event_id),
      u32Arg(1),
      bytes32Arg(metadata_hash),
      u32Arg(1),
    ], operatorKeypair, operatorAddress);
    logStep('issue_credential', issue);
    credentialIssued = true;
    await readbackCredential(credential_id, {
      issuer_id,
      subject_id,
      event_id,
      metadata_hash,
      hash_schema: 1,
      credential_type: 1,
      ledger: issue.ledger,
    }, 'issued');

    console.log('\n7. revoke_credential (operator)');
    const revoke = await submitInvocation(credentialContractId, 'revoke_credential', [
      addressArg(operatorAddress),
      bytes32Arg(credential_id),
      noneArg(),
    ], operatorKeypair, operatorAddress);
    logStep('revoke_credential', revoke);
    await readbackCredential(credential_id, { ledger: revoke.ledger }, 'revoked');
  } catch (error) {
    mainError = error;
    console.error('E2E main flow failed:', error.message);
  } finally {
    console.log('\n-- cleanup --');
    if (credentialIssued) {
      await cleanupStep(credentialContractId, 'revoke_credential', [addressArg(operatorAddress), bytes32Arg(credential_id), noneArg()], operatorKeypair);
    }
    if (issuerLinked) {
      await cleanupStep(credentialContractId, 'unlink_issuer_operator', [bytes32Arg(issuer_id), addressArg(operatorAddress)], adminKeypair);
    }
    await cleanupStep(credentialContractId, 'revoke_issuer', [addressArg(adminAddress), addressArg(operatorAddress)], adminKeypair);
    await cleanupStep(credentialContractId, 'revoke_revoker', [addressArg(adminAddress), addressArg(operatorAddress)], adminKeypair);
    await cleanupStep(entityContractId, 'revoke_registrar', [addressArg(adminAddress), addressArg(operatorAddress)], adminKeypair);
  }

  if (mainError) {
    throw mainError;
  }

  console.log('\nE2E exercise complete.');
  console.log(JSON.stringify({ records }, null, 2));
}

main().catch((error) => {
  console.error('E2E exercise failed:', error.message);
  process.exit(1);
});
