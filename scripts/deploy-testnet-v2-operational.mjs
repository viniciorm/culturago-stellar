#!/usr/bin/env node
/**
 * Deploys or provisions the operational V2 `CulturalCredentialRegistry` contract
 * on Stellar Testnet using project-controlled signing accounts (never ephemeral
 * random keys).
 *
 * Dry-run by default. To execute on Stellar Testnet:
 *   CULTURAGO_ALLOW_TESTNET_MUTATIONS=true node scripts/deploy-testnet-v2-operational.mjs --execute
 *
 * Required environment variables for --execute:
 *   - CULTURAGO_ALLOW_TESTNET_MUTATIONS=true
 *   - STELLAR_TESTNET_ADMIN_ADDRESS (G...)
 *   - STELLAR_TESTNET_ADMIN_SECRET (S...)
 *   - STELLAR_TESTNET_OPERATOR_ADDRESS (G..., distinct from admin)
 *   - STELLAR_TESTNET_OPERATOR_SECRET (S...)
 * Optional:
 *   - NEXT_PUBLIC_CREDENTIAL_REGISTRY_CONTRACT_ID (if reusing an already-deployed V2 contract)
 *   - D2_SYNTHETIC_ISSUER_ID (defaults to D1/D2 synthetic issuer d1000001-0000-4000-8000-000000000001)
 *
 * Never prints, logs, or saves secret seeds.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ENV_LOCAL_PATH = resolve(ROOT, '.env.local');
const DEPLOY_EVIDENCE_PATH = resolve(
  ROOT,
  'docs/evidence/v2-d2-contract-deployment.json'
);
const WASM_PATH = resolve(
  ROOT,
  'contracts/target/wasm32v1-none/release/cultural_credential_registry.wasm'
);
const EXPECTED_V2_WASM_SHA256 =
  '263e95eec2f6eaacff362267bd2cdd4c1c55bc4584dac044c9049e33b1cb9f21';
const DEFAULT_SYNTHETIC_ISSUER_ID = 'd1000001-0000-4000-8000-000000000001';

function loadDotEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const raw = readFileSync(filePath, 'utf8');
  const parsed = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    parsed[key] = val;
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
  return parsed;
}

function upsertEnvLocal(updates) {
  const existing = existsSync(ENV_LOCAL_PATH)
    ? readFileSync(ENV_LOCAL_PATH, 'utf8').split(/\r?\n/)
    : [
        '# CulturaGO — Configuración local Testnet D2 (gitignored; NUNCA commitear)',
      ];
  const seen = new Set();
  const nextLines = existing.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return line;
    const key = trimmed.slice(0, eq).trim();
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      seen.add(key);
      const val = String(updates[key]);
      return /\s/.test(val) ? `${key}="${val}"` : `${key}=${val}`;
    }
    return line;
  });

  for (const [key, rawVal] of Object.entries(updates)) {
    if (seen.has(key)) continue;
    const val = String(rawVal);
    nextLines.push(/\s/.test(val) ? `${key}="${val}"` : `${key}=${val}`);
  }

  writeFileSync(
    ENV_LOCAL_PATH,
    nextLines.filter((l, idx, arr) => !(idx === arr.length - 1 && l === '')).join('\n') + '\n',
    { mode: 0o600 }
  );
  for (const [k, v] of Object.entries(updates)) {
    process.env[k] = String(v);
  }
}

async function friendbotFund(address) {
  const url = `https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
  const text = await res.text();
  const alreadyFunded =
    text.includes('already exists') ||
    text.includes('already funded to starting balance') ||
    text.includes('createAccountAlreadyExist');
  if (!res.ok && !alreadyFunded) {
    throw new Error(`Friendbot error (${res.status}) for ${address}`);
  }
  return { funded: true, alreadyFunded: !res.ok && alreadyFunded };
}

loadDotEnvFile(ENV_LOCAL_PATH);

const RPC_URL =
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL?.trim() ||
  'https://soroban-testnet.stellar.org';

const PREPARE_ACCOUNTS = process.argv.includes('--prepare-accounts');
const EXECUTE = process.argv.includes('--execute');

function sha256(bufOrStr) {
  return createHash('sha256').update(bufOrStr).digest();
}

function checkRequirements() {
  const missing = [];
  if (process.env.CULTURAGO_ALLOW_TESTNET_MUTATIONS !== 'true') {
    missing.push('CULTURAGO_ALLOW_TESTNET_MUTATIONS=true');
  }
  const adminAddr = process.env.STELLAR_TESTNET_ADMIN_ADDRESS?.trim();
  const adminSec = process.env.STELLAR_TESTNET_ADMIN_SECRET?.trim();
  const opAddr = (
    process.env.STELLAR_TESTNET_OPERATOR_ADDRESS ??
    process.env.STELLAR_TESTNET_ISSUER_OPERATOR_ADDRESS
  )?.trim();
  const opSec = (
    process.env.STELLAR_TESTNET_OPERATOR_SECRET ??
    process.env.STELLAR_TESTNET_FIXTURE_SECRET
  )?.trim();

  if (!adminAddr) missing.push('STELLAR_TESTNET_ADMIN_ADDRESS');
  if (!adminSec) missing.push('STELLAR_TESTNET_ADMIN_SECRET');
  if (!opAddr) missing.push('STELLAR_TESTNET_OPERATOR_ADDRESS');
  if (!opSec) missing.push('STELLAR_TESTNET_OPERATOR_SECRET');

  if (adminSec && adminAddr) {
    try {
      const derived = Keypair.fromSecret(adminSec).publicKey();
      if (derived !== adminAddr) {
        missing.push('STELLAR_TESTNET_ADMIN_SECRET must match STELLAR_TESTNET_ADMIN_ADDRESS');
      }
    } catch {
      missing.push('STELLAR_TESTNET_ADMIN_SECRET (valid S... secret)');
    }
  }

  if (opSec && opAddr) {
    try {
      const derived = Keypair.fromSecret(opSec).publicKey();
      if (derived !== opAddr) {
        missing.push('STELLAR_TESTNET_OPERATOR_SECRET must match STELLAR_TESTNET_OPERATOR_ADDRESS');
      }
    } catch {
      missing.push('STELLAR_TESTNET_OPERATOR_SECRET (valid S... secret)');
    }
  }

  if (adminAddr && opAddr && adminAddr === opAddr) {
    missing.push('STELLAR_TESTNET_OPERATOR_ADDRESS must be distinct from STELLAR_TESTNET_ADMIN_ADDRESS');
  }

  return {
    ready: missing.length === 0,
    missing,
    adminAddress: adminAddr || null,
    operatorAddress: opAddr || null,
    existingContractId:
      process.env.NEXT_PUBLIC_CREDENTIAL_REGISTRY_CONTRACT_ID?.trim() || null,
  };
}

async function inspectOnChainAccount(server, address) {
  if (!address) return null;
  try {
    const acct = await server.getAccount(address);
    let balanceXlm = null;
    try {
      const hRes = await fetch(
        `https://horizon-testnet.stellar.org/accounts/${encodeURIComponent(address)}`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (hRes.ok) {
        const hJson = await hRes.json();
        const native = (hJson.balances || []).find(
          (b) => b.asset_type === 'native'
        );
        balanceXlm = native ? native.balance : null;
      }
    } catch {
      // Horizon balance lookup is informational; Soroban RPC getAccount is authoritative.
    }
    return {
      address,
      existsOnChain: true,
      funded: true,
      sequence: acct.sequenceNumber(),
      balanceXlm,
    };
  } catch {
    return {
      address,
      existsOnChain: false,
      funded: false,
      sequence: null,
      balanceXlm: null,
    };
  }
}

function assertNoSecretsInString(str) {
  if (/S[A-Z2-7]{55}/.test(str)) {
    throw new Error('SECURITY VIOLATION: Refusing to output a Stellar secret seed');
  }
}

if (PREPARE_ACCOUNTS) {
  let adminSec = process.env.STELLAR_TESTNET_ADMIN_SECRET?.trim();
  let opSec = (
    process.env.STELLAR_TESTNET_OPERATOR_SECRET ??
    process.env.STELLAR_TESTNET_FIXTURE_SECRET
  )?.trim();

  const adminKp = adminSec ? Keypair.fromSecret(adminSec) : Keypair.random();
  let opKp = opSec ? Keypair.fromSecret(opSec) : Keypair.random();
  while (opKp.publicKey() === adminKp.publicKey()) {
    opKp = Keypair.random();
  }

  upsertEnvLocal({
    NEXT_PUBLIC_CULTURAGO_ENV: 'testnet',
    NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
    NEXT_PUBLIC_STELLAR_RPC_URL: RPC_URL,
    NEXT_PUBLIC_ENTITY_REGISTRY_CONTRACT_ID:
      process.env.NEXT_PUBLIC_ENTITY_REGISTRY_CONTRACT_ID?.trim() ||
      'CBUUMXY77DF4QG5KY5H37SEV63HOLPIVEUZGP2UEQ4PGBNWC2JYFJQGO',
    CULTURAGO_ALLOW_TESTNET_MUTATIONS: 'true',
    STELLAR_TESTNET_ADMIN_ADDRESS: adminKp.publicKey(),
    STELLAR_TESTNET_ADMIN_SECRET: adminKp.secret(),
    STELLAR_TESTNET_OPERATOR_ADDRESS: opKp.publicKey(),
    STELLAR_TESTNET_OPERATOR_SECRET: opKp.secret(),
  });

  await friendbotFund(adminKp.publicKey());
  await friendbotFund(opKp.publicKey());
}

const status = checkRequirements();
const issuerEntityId =
  process.env.D2_SYNTHETIC_ISSUER_ID?.trim() || DEFAULT_SYNTHETIC_ISSUER_ID;
const issuerIdBytes = sha256(`culturago.entity.v1\0${issuerEntityId}`);
const issuerIdHex = issuerIdBytes.toString('hex');
const server = new rpc.Server(RPC_URL, { timeoutInSeconds: 30 });

const wasm = readFileSync(WASM_PATH);
const wasmSha256 = sha256(wasm).toString('hex');
assert.equal(
  wasmSha256,
  EXPECTED_V2_WASM_SHA256,
  `Local WASM SHA-256 (${wasmSha256}) does not match expected V2 hash (${EXPECTED_V2_WASM_SHA256})`
);

const [adminAccountInfo, operatorAccountInfo] = await Promise.all([
  inspectOnChainAccount(server, status.adminAddress),
  inspectOnChainAccount(server, status.operatorAddress),
]);

const missing = [...status.missing];
if (status.adminAddress && !adminAccountInfo?.funded) {
  missing.push(`Admin account ${status.adminAddress} is not funded on Testnet`);
}
if (status.operatorAddress && !operatorAccountInfo?.funded) {
  missing.push(`Operator account ${status.operatorAddress} is not funded on Testnet`);
}

const preflightReady = missing.length === 0;

if (!EXECUTE) {
  const report = JSON.stringify(
    {
      mode: 'DRY_RUN',
      readyForExecute: preflightReady,
      accountsDistinct:
        Boolean(status.adminAddress && status.operatorAddress) &&
        status.adminAddress !== status.operatorAddress,
      missingRequirements: missing,
      rpcUrl: RPC_URL,
      expectedV2WasmSha256: EXPECTED_V2_WASM_SHA256,
      localWasmSha256: wasmSha256,
      localWasmMatches: wasmSha256 === EXPECTED_V2_WASM_SHA256,
      adminAccount: adminAccountInfo,
      operatorAccount: operatorAccountInfo,
      existingContractId: status.existingContractId,
      issuerEntityId,
      issuerIdHex,
    },
    null,
    2
  );
  assertNoSecretsInString(report);
  console.log(report);
  process.exit(preflightReady ? 0 : 1);
}

if (!preflightReady) {
  console.error(
    'Cannot execute V2 Testnet provisioning; missing required configuration:\n  - ' +
      missing.join('\n  - ')
  );
  process.exit(1);
}

const adminKeypair = Keypair.fromSecret(
  process.env.STELLAR_TESTNET_ADMIN_SECRET.trim()
);
const operatorKeypair = Keypair.fromSecret(
  (
    process.env.STELLAR_TESTNET_OPERATOR_SECRET ??
    process.env.STELLAR_TESTNET_FIXTURE_SECRET
  ).trim()
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const addressScVal = (pubKey) => new Address(pubKey).toScVal();
const bytesScVal = (buf) => xdr.ScVal.scvBytes(buf);

async function submitTx(operation, signer, label) {
  const account = await server.getAccount(signer.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(operation)
    .setTimeout(180)
    .build();

  const sim = await server.simulateTransaction(tx);
  assert(!rpc.Api.isSimulationError(sim), `${label}: ${sim.error ?? 'simulation failed'}`);
  const prepared = rpc.assembleTransaction(tx, sim).build();
  prepared.sign(signer);
  const sent = await server.sendTransaction(prepared);
  assert(['PENDING', 'DUPLICATE'].includes(sent.status), `${label}: submission ${sent.status}`);

  for (let i = 0; i < 90; i++) {
    const result = await server.getTransaction(sent.hash);
    if (result.status === 'SUCCESS') {
      console.log(`${label}: tx=${sent.hash} ledger=${result.ledger}`);
      return { hash: sent.hash, ledger: result.ledger, result };
    }
    assert.notEqual(result.status, 'FAILED', `${label}: transaction failed`);
    await sleep(1000);
  }
  throw new Error(`${label}: confirmation timeout`);
}

async function readContract(contract, method, args) {
  const account = await server.getAccount(operatorKeypair.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();
  const sim = await server.simulateTransaction(tx);
  assert(!rpc.Api.isSimulationError(sim), `${method}: ${sim.error}`);
  return scValToNative(sim.result.retval);
}

let contractId = status.existingContractId;
const transactions = [];

if (!contractId || process.argv.includes('--deploy-new')) {
  const uploadTx = await submitTx(
    Operation.uploadContractWasm({ wasm }),
    adminKeypair,
    'upload-v2-wasm'
  );
  transactions.push({ label: 'upload-v2-wasm', hash: uploadTx.hash, ledger: uploadTx.ledger });

  const deployTx = await submitTx(
    Operation.createCustomContract({
      address: new Address(adminKeypair.publicKey()),
      wasmHash: sha256(wasm),
      salt: randomBytes(32),
      constructorArgs: [
        addressScVal(adminKeypair.publicKey()),
        addressScVal(operatorKeypair.publicKey()),
        addressScVal(operatorKeypair.publicKey()),
        nativeToScVal(2, { type: 'u32' }),
      ],
    }),
    adminKeypair,
    'deploy-v2-contract'
  );
  contractId = scValToNative(deployTx.result.returnValue);
  assert.match(contractId, /^C[A-Z2-7]{55}$/);
  transactions.push({ label: 'deploy-v2-contract', hash: deployTx.hash, ledger: deployTx.ledger });

  if (existsSync(ENV_LOCAL_PATH)) {
    upsertEnvLocal({
      NEXT_PUBLIC_CREDENTIAL_REGISTRY_CONTRACT_ID: contractId,
    });
  }
}

const contract = new Contract(contractId);
const linkTx = await submitTx(
  contract.call(
    'link_issuer_operator',
    bytesScVal(issuerIdBytes),
    addressScVal(operatorKeypair.publicKey())
  ),
  adminKeypair,
  'link-issuer-operator'
);
transactions.push({ label: 'link-issuer-operator', hash: linkTx.hash, ledger: linkTx.ledger });

const isLinked = await readContract(contract, 'is_issuer_operator', [
  bytesScVal(issuerIdBytes),
  addressScVal(operatorKeypair.publicKey()),
]);
assert.equal(isLinked, true, 'is_issuer_operator readback must be true');

// Verify deployed contract WASM hash and instance storage on-chain
const instanceEntries = await server.getLedgerEntries(contract.getFootprint());
assert(
  instanceEntries.entries && instanceEntries.entries.length > 0,
  'Contract instance footprint not found on-chain'
);
const inst = instanceEntries.entries[0].val.contractData().val().instance();
const deployedWasmSha256 = inst.executable().wasmHash().toString('hex');
assert.equal(
  deployedWasmSha256,
  EXPECTED_V2_WASM_SHA256,
  'On-chain deployed WASM hash mismatch'
);

const evidence = {
  environment: 'testnet',
  observedAt: new Date().toISOString(),
  rpcUrl: RPC_URL,
  contractId,
  wasmSha256,
  deployedWasmMatches: deployedWasmSha256 === wasmSha256,
  adminAddress: adminKeypair.publicKey(),
  operatorAddress: operatorKeypair.publicKey(),
  accountsDistinct: adminKeypair.publicKey() !== operatorKeypair.publicKey(),
  issuerEntityId,
  issuerIdHex,
  isIssuerOperatorLinked: isLinked,
  transactions,
};

const serializedEvidence = JSON.stringify(evidence, null, 2) + '\n';
assertNoSecretsInString(serializedEvidence);
mkdirSync(dirname(DEPLOY_EVIDENCE_PATH), { recursive: true });
writeFileSync(DEPLOY_EVIDENCE_PATH, serializedEvidence);
console.log(serializedEvidence);
