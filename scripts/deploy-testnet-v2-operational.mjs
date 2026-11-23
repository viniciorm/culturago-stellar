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
import { readFileSync } from 'node:fs';
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
const WASM_PATH = resolve(
  ROOT,
  'contracts/target/wasm32v1-none/release/cultural_credential_registry.wasm'
);
const EXPECTED_V2_WASM_SHA256 =
  '263e95eec2f6eaacff362267bd2cdd4c1c55bc4584dac044c9049e33b1cb9f21';
const DEFAULT_SYNTHETIC_ISSUER_ID = 'd1000001-0000-4000-8000-000000000001';
const RPC_URL =
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL?.trim() ||
  'https://soroban-testnet.stellar.org';

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

const status = checkRequirements();
const issuerEntityId =
  process.env.D2_SYNTHETIC_ISSUER_ID?.trim() || DEFAULT_SYNTHETIC_ISSUER_ID;
const issuerIdBytes = sha256(`culturago.entity.v1\0${issuerEntityId}`);
const issuerIdHex = issuerIdBytes.toString('hex');

if (!EXECUTE) {
  console.log(
    JSON.stringify(
      {
        mode: 'DRY_RUN',
        readyForExecute: status.ready,
        missingRequirements: status.missing,
        rpcUrl: RPC_URL,
        expectedV2WasmSha256: EXPECTED_V2_WASM_SHA256,
        adminAddress: status.adminAddress,
        operatorAddress: status.operatorAddress,
        existingContractId: status.existingContractId,
        issuerEntityId,
        issuerIdHex,
      },
      null,
      2
    )
  );
  process.exit(status.ready ? 0 : 1);
}

if (!status.ready) {
  console.error(
    'Cannot execute V2 Testnet provisioning; missing required configuration:\n  - ' +
      status.missing.join('\n  - ')
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
const server = new rpc.Server(RPC_URL, { timeoutInSeconds: 30 });
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

const wasm = readFileSync(WASM_PATH);
const wasmSha256 = sha256(wasm).toString('hex');
assert.equal(
  wasmSha256,
  EXPECTED_V2_WASM_SHA256,
  `Local WASM SHA-256 (${wasmSha256}) does not match expected V2 hash (${EXPECTED_V2_WASM_SHA256})`
);

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

console.log(
  JSON.stringify(
    {
      environment: 'testnet',
      contractId,
      wasmSha256,
      adminAddress: adminKeypair.publicKey(),
      operatorAddress: operatorKeypair.publicKey(),
      issuerEntityId,
      issuerIdHex,
      isIssuerOperatorLinked: isLinked,
      transactions,
    },
    null,
    2
  )
);
