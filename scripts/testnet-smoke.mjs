#!/usr/bin/env node
// Testnet smoke dry-run / controlled execution wrapper.
// Reads the manifest, validates the environment, prints the plan, and only
// mutates Testnet when --execute and CULTURAGO_ALLOW_TESTNET_MUTATIONS=true.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import https from 'node:https';
import { Keypair } from '@stellar/stellar-sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));

const EXECUTE = process.argv.includes('--execute');
const RUN_ID = process.env.TESTNET_SMOKE_RUN_ID ?? `smoke-${randomUUID()}`;
const MANIFEST_PATH = process.env.TESTNET_MANIFEST_PATH ?? resolve(__dirname, '..', 'docs', 'manifests', 'testnet-manifest.json');
const REQUIRED = [
  'STELLAR_TESTNET_DEPLOYER_SECRET',
  'STELLAR_TESTNET_ADMIN_ADDRESS',
];

const WASM = {
  entity: resolve(__dirname, '..', 'contracts', 'target', 'wasm32v1-none', 'release', 'cultural_entity_registry.wasm'),
  credential: resolve(__dirname, '..', 'contracts', 'target', 'wasm32v1-none', 'release', 'cultural_credential_registry.wasm'),
};

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

function extractContractId(output) {
  const m = output.match(/C[A-Z2-7]{55}/);
  return m ? m[0] : null;
}

function friendbotFund(address) {
  return new Promise((resolve, reject) => {
    const url = `https://friendbot.stellar.org/?addr=${address}`;
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

async function deployContract({ wasm, name, constructorArgs }) {
  const deployerKeypair = Keypair.fromSecret(process.env.STELLAR_TESTNET_DEPLOYER_SECRET);
  const deployerPublic = deployerKeypair.publicKey();
  const networkPassphrase = manifest.network.passphrase;
  const rpcUrl = manifest.network.rpcUrl;

  const baseArgs = [
    'contract',
    'deploy',
    '--wasm', wasm,
    '--source-account', deployerPublic,
    '--rpc-url', rpcUrl,
    '--network-passphrase', networkPassphrase,
    '--',
  ];

  for (const [k, v] of constructorArgs) {
    baseArgs.push(`--${k}`, v);
  }

  const signEnv = { STELLAR_SIGN_WITH_KEY: process.env.STELLAR_TESTNET_DEPLOYER_SECRET };
  const output = run('stellar', baseArgs, signEnv);
  const contractId = extractContractId(output);
  if (!contractId) {
    console.error(`No contract id found in ${name} deploy output:\n${output}`);
    process.exit(1);
  }
  return { contractId, output };
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
assert(manifest.environment === 'testnet', 'manifest environment must be testnet');

console.log(JSON.stringify({
  runId: RUN_ID,
  manifest: MANIFEST_PATH,
  execute: EXECUTE,
  network: manifest.network.passphrase,
  rpcUrl: manifest.network.rpcUrl,
  contracts: {
    entityWasm: manifest.contracts.cultural_entity_registry.wasmSha256,
    credentialWasm: manifest.contracts.cultural_credential_registry.wasmSha256,
  },
}, null, 2));

if (EXECUTE) {
  assert(process.env.CULTURAGO_ALLOW_TESTNET_MUTATIONS === 'true', 'CULTURAGO_ALLOW_TESTNET_MUTATIONS=true is required to execute');
  for (const key of REQUIRED) {
    assert(process.env[key], `missing required env var: ${key}`);
  }

  const deployerKeypair = Keypair.fromSecret(process.env.STELLAR_TESTNET_DEPLOYER_SECRET);
  const deployerPublic = deployerKeypair.publicKey();
  const admin = process.env.STELLAR_TESTNET_ADMIN_ADDRESS;
  const registrar = process.env.STELLAR_TESTNET_REGISTRAR_ADDRESS ?? admin;
  const issuer = process.env.STELLAR_TESTNET_ISSUER_ADDRESS ?? admin;
  const revoker = process.env.STELLAR_TESTNET_REVOKER_ADDRESS ?? admin;

  console.log(`Deployer public key: ${deployerPublic}`);
  console.log('Funding deployer via friendbot...');
  await friendbotFund(deployerPublic);
  console.log('Fund request sent (or account already exists).');

  console.log('Deploying cultural_entity_registry...');
  const entity = await deployContract({
    name: 'cultural_entity_registry',
    wasm: WASM.entity,
    constructorArgs: [
      ['admin', admin],
      ['registrar', registrar],
      ['hash_schema', '1'],
    ],
  });
  console.log(`cultural_entity_registry deployed: ${entity.contractId}`);

  console.log('Deploying cultural_credential_registry...');
  const credential = await deployContract({
    name: 'cultural_credential_registry',
    wasm: WASM.credential,
    constructorArgs: [
      ['admin', admin],
      ['issuer', issuer],
      ['revoker', revoker],
      ['hash_schema', '1'],
    ],
  });
  console.log(`cultural_credential_registry deployed: ${credential.contractId}`);

  // Update manifest
  manifest.contracts.cultural_entity_registry.contractId = entity.contractId;
  manifest.contracts.cultural_credential_registry.contractId = credential.contractId;
  manifest.generatedAt = new Date().toISOString();
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Manifest updated: ${MANIFEST_PATH}`);

  // Write .env.testnet template
  const envTestnet = resolve(__dirname, '..', '.env.testnet');
  const envLines = [
    '# CulturaGO — Testnet (generado por scripts/testnet-smoke.mjs)',
    'NEXT_PUBLIC_CULTURAGO_ENV=testnet',
    `NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE="${manifest.network.passphrase}"`,
    `NEXT_PUBLIC_STELLAR_RPC_URL=${manifest.network.rpcUrl}`,
    `NEXT_PUBLIC_ENTITY_REGISTRY_CONTRACT_ID=${entity.contractId}`,
    `NEXT_PUBLIC_CREDENTIAL_REGISTRY_CONTRACT_ID=${credential.contractId}`,
    `NEXT_PUBLIC_STELLAR_EXPLORER_BASE=https://stellar.expert/explorer/testnet`,
    `NEXT_PUBLIC_SMART_WALLET_WASM_HASH=`,
    `NEXT_PUBLIC_SMART_WALLET_ACCEPTED_WASM_HASHES=`,
    `WEBAUTHN_RP_ID=`,
    `WEBAUTHN_ORIGINS=`,
    `DATABASE_URL=`,
  ];
  writeFileSync(envTestnet, envLines.join('\n') + '\n');
  console.log(`Testnet env written: ${envTestnet}`);
} else {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  console.log('[DRY-RUN] No mutations performed.');
  console.log('Required env for --execute:');
  for (const key of REQUIRED) {
    console.log(`  ${key}: ${process.env[key] ? 'set' : 'MISSING'}`);
  }
  console.log('Optional (default to ADMIN): STELLAR_TESTNET_REGISTRAR_ADDRESS, STELLAR_TESTNET_ISSUER_ADDRESS, STELLAR_TESTNET_REVOKER_ADDRESS');
  if (missing.length) process.exit(1);
}
