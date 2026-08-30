#!/usr/bin/env node
// scripts/grant-roles.mjs — grants entity registrar and credential issuer/revoker
// roles to a smart wallet contract on Testnet. Intended for the E2E harness.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const walletAddress = process.argv[2];
const issuerEntityId = process.argv[3];

if (!walletAddress) {
  console.error('Usage: node grant-roles.mjs <WALLET_ADDRESS> [ISSUER_ENTITY_ID]');
  process.exit(1);
}

const adminSecret = process.env.STELLAR_TESTNET_ADMIN_SECRET;
if (!adminSecret) {
  throw new Error('STELLAR_TESTNET_ADMIN_SECRET is not configured');
}

const adminAddress = process.env.STELLAR_TESTNET_ADMIN_ADDRESS;
if (!adminAddress) {
  throw new Error('STELLAR_TESTNET_ADMIN_ADDRESS is not configured');
}

const rpcUrl = process.env.NEXT_PUBLIC_STELLAR_RPC_URL;
const networkPassphrase = process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE;

const manifest = JSON.parse(readFileSync(resolve('docs/manifests/testnet-manifest.json'), 'utf8'));
const entityRegistry = manifest.contracts.cultural_entity_registry.contractId;
const credentialRegistry = manifest.contracts.cultural_credential_registry.contractId;

if (!entityRegistry || !credentialRegistry) {
  throw new Error('Testnet manifest is missing contract ids');
}

function canonicalizeJson(value, seen = new Set()) {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new Error('Non-finite numbers cannot be canonicalized');
      return JSON.stringify(value);
    case 'string':
      return JSON.stringify(value);
    case 'object': {
      if (seen.has(value)) throw new Error('Cyclic structures cannot be canonicalized');
      seen.add(value);
      try {
        if (Array.isArray(value)) {
          return `[${value.map((item) => canonicalizeJson(item, seen)).join(',')}]`;
        }
        const record = value;
        const keys = Object.keys(record).sort();
        const entries = keys.map((key) => {
          const v = record[key];
          if (v === undefined || typeof v === 'function' || typeof v === 'symbol') {
            throw new Error(`Property "${key}" is not canonicalizable`);
          }
          return `${JSON.stringify(key)}:${canonicalizeJson(v, seen)}`;
        });
        return `{${entries.join(',')}}`;
      } finally {
        seen.delete(value);
      }
    }
    default:
      throw new Error(`Type ${typeof value} cannot be canonicalized`);
  }
}

function hashDocument(schemaId, document) {
  const canonical = canonicalizeJson(document);
  const input = `CULTURAGO${String.fromCharCode(0)}${schemaId}${String.fromCharCode(0)}${canonical}`;
  return createHash('sha256').update(Buffer.from(input, 'utf8')).digest('hex');
}

function invoke(contractId, fnName, args) {
  const argTokens = args.flatMap(([k, v]) => [`--${k}`, v]);
  const cmd = [
    'contract',
    'invoke',
    '--id',
    contractId,
    '--source',
    adminSecret,
    '--rpc-url',
    rpcUrl,
    '--network-passphrase',
    networkPassphrase,
    '--',
    fnName,
    ...argTokens,
  ];
  console.log(`\n$ stellar ${cmd.join(' ')}`);
  return execFileSync('stellar', cmd, { stdio: 'inherit', env: process.env });
}

console.log(`Granting on-chain roles to ${walletAddress} (admin: ${adminAddress})`);

invoke(entityRegistry, 'grant_registrar', [
  ['caller', adminAddress],
  ['account', walletAddress],
]);

invoke(credentialRegistry, 'grant_issuer', [
  ['caller', adminAddress],
  ['account', walletAddress],
]);

invoke(credentialRegistry, 'grant_revoker', [
  ['caller', adminAddress],
  ['account', walletAddress],
]);

if (issuerEntityId) {
  const issuerHash = hashDocument('culturago.entity.v1', issuerEntityId);
  console.log(`\nLinking issuer ${issuerEntityId} -> ${issuerHash} to operator ${walletAddress}`);
  invoke(credentialRegistry, 'link_issuer_operator', [
    ['issuer_id', issuerHash],
    ['operator', walletAddress],
  ]);
}

console.log('\nAll roles and issuer-operator link granted successfully');
