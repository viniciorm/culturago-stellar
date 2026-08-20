#!/usr/bin/env node
// Smoke exercise against the already-deployed Testnet contracts.
// Requires manifest contract IDs and a funded admin/deployer.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = process.env.TESTNET_MANIFEST_PATH ?? resolve(__dirname, '..', 'docs', 'manifests', 'testnet-manifest.json');

function assert(condition, message) {
  if (!condition) {
    console.error(`ASSERT FAIL: ${message}`);
    process.exit(1);
  }
}

function run(cmd, args, env = {}) {
  return execFileSync(cmd, args, {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
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
assert(process.env.STELLAR_TESTNET_DEPLOYER_SECRET, 'STELLAR_TESTNET_DEPLOYER_SECRET is required');
assert(process.env.STELLAR_TESTNET_ADMIN_ADDRESS, 'STELLAR_TESTNET_ADMIN_ADDRESS is required');

const deployerKeypair = Keypair.fromSecret(process.env.STELLAR_TESTNET_DEPLOYER_SECRET);
const source = deployerKeypair.publicKey();
const signEnv = { STELLAR_SIGN_WITH_KEY: process.env.STELLAR_TESTNET_DEPLOYER_SECRET };
const networkPassphrase = manifest.network.passphrase;
const rpcUrl = manifest.network.rpcUrl;
const entityId = manifest.contracts.cultural_entity_registry.contractId;
const credentialId = manifest.contracts.cultural_credential_registry.contractId;

const baseInvoke = (contract, fn, args) => {
  const callArgs = ['contract', 'invoke', '--id', contract, '--source-account', source, '--rpc-url', rpcUrl, '--network-passphrase', networkPassphrase, '--', fn, ...args];
  return run('stellar', callArgs, signEnv);
};

const entity_id = bytes32Hex('entity-1');
const metadata_hash = bytes32Hex('metadata-1');
const issuer_id = bytes32Hex('issuer-1');
const subject_id = bytes32Hex('subject-1');
const event_id = bytes32Hex('event-1');

console.log(`Source: ${source}`);
console.log(`Entity contract: ${entityId}`);
console.log(`Credential contract: ${credentialId}`);

console.log('\n1. register_entity');
console.log(baseInvoke(entityId, 'register_entity', ['--operator', source, '--entity_id', entity_id, '--metadata_hash', metadata_hash, '--hash_schema', '1']));

console.log('\n2. link_issuer_operator');
console.log(baseInvoke(credentialId, 'link_issuer_operator', ['--issuer_id', issuer_id, '--operator', source]));

console.log('\n3. issue_credential');
console.log(baseInvoke(credentialId, 'issue_credential', [
  '--operator', source,
  '--credential_id', bytes32Hex(randomBytes(32)),
  '--issuer_id', issuer_id,
  '--subject_id', subject_id,
  '--event_id', event_id,
  '--credential_type', '1',
  '--metadata_hash', metadata_hash,
  '--hash_schema', '1',
]));

console.log('\nSmoke exercise complete.');
