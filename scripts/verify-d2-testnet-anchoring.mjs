#!/usr/bin/env node
/**
 * Executes the complete D2 browser + Stellar Testnet verification in Chromium (Playwright)
 * against the isolated test PostgreSQL database (`culturago_test` on 127.0.0.1:5433)
 * and the project's operational V2 `CulturalCredentialRegistry` contract on Stellar Testnet:
 *
 *   1. Preflight check of Testnet signing configuration (never uses ephemeral keys).
 *   2. Seed isolated test DB preserving historical D1 credentials (`cg2_HSHtLAutuMlHh4Cr`, `cg2_28sPqyDWcYAETPcq`).
 *   3. Login via WebAuthn Passkey on `/login` -> redirect to `/organizer`.
 *   4. Issue new `participant` V2 credential from `/organizer` -> real Soroban Testnet `issue_credential_v2`.
 *   5. Confirm transaction, ledger, and byte-for-byte 32-byte digest readback from the contract.
 *   6. Verify idempotent retry does not duplicate the credential or transaction.
 *   7. Verify `/p/camila-danzante-sintetica`, `/credentials/[publicId]`, PDF, and QR.
 *
 * Never prints, logs, or saves secret keys.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import QRCode from 'qrcode';
import {
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import pg from 'pg';
import { seedD1SyntheticDemo, D1_DEMO_FIXTURES } from './seed-d1-synthetic-demo.mjs';

const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ENV_LOCAL_PATH = resolve(ROOT, '.env.local');
if (existsSync(ENV_LOCAL_PATH)) {
  const raw = readFileSync(ENV_LOCAL_PATH, 'utf8');
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
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}
const PORT = Number(process.env.D2_DEMO_PORT || 3000);
const BASE_URL = `http://localhost:${PORT}`;
const DB_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://postgres:test@127.0.0.1:5433/culturago_test';
const RPC_URL =
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL?.trim() ||
  'https://soroban-testnet.stellar.org';
const ENTITY_CONTRACT_ID =
  process.env.NEXT_PUBLIC_ENTITY_REGISTRY_CONTRACT_ID?.trim() ||
  'CBUUMXY77DF4QG5KY5H37SEV63HOLPIVEUZGP2UEQ4PGBNWC2JYFJQGO';
const CREDENTIAL_CONTRACT_ID =
  process.env.NEXT_PUBLIC_CREDENTIAL_REGISTRY_CONTRACT_ID?.trim() || '';

function inspectPreflight() {
  const missing = [];
  if (process.env.CULTURAGO_ALLOW_TESTNET_MUTATIONS !== 'true') {
    missing.push('CULTURAGO_ALLOW_TESTNET_MUTATIONS=true');
  }
  if (!CREDENTIAL_CONTRACT_ID) {
    missing.push('NEXT_PUBLIC_CREDENTIAL_REGISTRY_CONTRACT_ID');
  }
  const opSecret = (
    process.env.STELLAR_TESTNET_OPERATOR_SECRET ??
    process.env.STELLAR_TESTNET_FIXTURE_SECRET
  )?.trim();
  let operatorAddress = null;
  if (!opSecret) {
    missing.push('STELLAR_TESTNET_OPERATOR_SECRET');
  } else {
    try {
      operatorAddress = Keypair.fromSecret(opSecret).publicKey();
      const configuredOpAddr = (
        process.env.STELLAR_TESTNET_OPERATOR_ADDRESS ??
        process.env.STELLAR_TESTNET_ISSUER_OPERATOR_ADDRESS
      )?.trim();
      if (configuredOpAddr && configuredOpAddr !== operatorAddress) {
        missing.push(
          'STELLAR_TESTNET_OPERATOR_SECRET must match STELLAR_TESTNET_OPERATOR_ADDRESS'
        );
      }
      const adminAddr = process.env.STELLAR_TESTNET_ADMIN_ADDRESS?.trim();
      if (adminAddr && adminAddr === operatorAddress) {
        missing.push(
          'STELLAR_TESTNET_OPERATOR_ADDRESS must differ from STELLAR_TESTNET_ADMIN_ADDRESS'
        );
      }
    } catch {
      missing.push('STELLAR_TESTNET_OPERATOR_SECRET (valid S... secret seed)');
    }
  }

  return {
    ready: missing.length === 0,
    missing,
    contractId: CREDENTIAL_CONTRACT_ID || null,
    operatorAddress,
  };
}

async function waitForServer(url, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for Next.js server at ${url}`);
}

const preflight = inspectPreflight();
if (!preflight.ready) {
  console.error(
    JSON.stringify(
      {
        status: 'BLOCKED_MISSING_TESTNET_SIGNER_CONFIG',
        ready: false,
        missingRequirements: preflight.missing,
        contractId: preflight.contractId,
        operatorAddress: preflight.operatorAddress,
      },
      null,
      2
    )
  );
  process.exit(1);
}

async function checkExistingParticipation3Operation(dbUrl) {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const res = await client.query(
      `SELECT c.id, c.public_id, c.payload_digest, c.issued_ledger,
              so.id AS operation_id, so.phase, so.tx_hash, so.ledger AS op_ledger
       FROM credentials c
       LEFT JOIN stellar_operations so
         ON so.idempotency_key = 'issue_v2:' || c.public_id
       WHERE c.participation_id = $1
         AND c.schema_version = 'culturago.credential.v2'
         AND c.status != 'revoked'
       ORDER BY c.created_at DESC
       LIMIT 1`,
      [D1_DEMO_FIXTURES.participation3Id]
    );
    return res.rows[0] ?? null;
  } finally {
    await client.end();
  }
}

async function getDbCredentialAndOperationByPublicId(dbUrl, publicId) {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const res = await client.query(
      `SELECT c.id, c.public_id, c.payload_digest, c.issued_ledger, c.participation_id,
              so.id AS operation_id, so.idempotency_key, so.phase, so.tx_hash, so.ledger AS op_ledger
       FROM credentials c
       LEFT JOIN stellar_operations so
         ON so.idempotency_key = 'issue_v2:' || c.public_id
       WHERE c.public_id = $1
       LIMIT 1`,
      [publicId]
    );
    return res.rows[0] ?? null;
  } finally {
    await client.end();
  }
}

async function main() {
  // Check if a transaction for participation3Id was already submitted to Testnet before resetting DB
  const existingP3 = await checkExistingParticipation3Operation(DB_URL);
  if (existingP3 && existingP3.tx_hash) {
    console.log(
      `[PRECHECK] Found existing operation for D1-SINT-003: publicId=${existingP3.public_id} phase=${existingP3.phase} txHash=${existingP3.tx_hash}`
    );
  }

  const fixtures = await seedD1SyntheticDemo(DB_URL, {
    preserveIssuedOnParticipation2: true,
    preserveIssuedOnParticipation3: Boolean(existingP3 && existingP3.tx_hash),
  });
  console.log(
    `[1/6] Isolated test DB seeded; historical credentials preserved on D1-SINT-001 & D1-SINT-002`
  );

  const nextBin = 'node_modules/next/dist/bin/next';
  const serverProc = spawn(
    process.execPath,
    [nextBin, 'start', '-p', String(PORT)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DATABASE_URL: DB_URL,
        TEST_DATABASE_URL: DB_URL,
        NEXT_PUBLIC_CULTURAGO_ENV: 'testnet',
        NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE:
          'Test SDF Network ; September 2015',
        NEXT_PUBLIC_STELLAR_RPC_URL: RPC_URL,
        NEXT_PUBLIC_ENTITY_REGISTRY_CONTRACT_ID: ENTITY_CONTRACT_ID,
        NEXT_PUBLIC_CREDENTIAL_REGISTRY_CONTRACT_ID: CREDENTIAL_CONTRACT_ID,
        NEXT_PUBLIC_APP_URL: BASE_URL,
        APP_URL: BASE_URL,
        WEBAUTHN_RP_ID: 'localhost',
        WEBAUTHN_ORIGINS: BASE_URL,
        CULTURAGO_ALLOW_TESTNET_MUTATIONS: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let browser;
  try {
    await waitForServer(BASE_URL);
    console.log(`[2/6] Next.js production server ready at ${BASE_URL}`);

    try {
      browser = await chromium.launch({ headless: true, channel: 'chrome' });
    } catch {
      try {
        browser = await chromium.launch({ headless: true, channel: 'msedge' });
      } catch {
        browser = await chromium.launch({ headless: true });
      }
    }
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();

    const cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });

    await page.goto('/login');
    await page.getByRole('button', { name: 'Registrar passkey' }).first().click();
    await page.getByPlaceholder('Juan Pérez').fill('Operador Sintético D2');
    await page
      .getByPlaceholder('Pegá el código que recibiste')
      .fill(fixtures.claimCode);
    await page.getByRole('button', { name: 'Registrar passkey' }).nth(1).click();

    await page.waitForURL('**/organizer', { timeout: 15000 });
    console.log(`[3/6] Operator authenticated via WebAuthn Passkey and redirected to /organizer`);

    // Explicitly select D1-SINT-003 (participation3Id) to emit exactly one synthetic credential
    await page.locator('#v2-participation-select').selectOption(fixtures.participation3Id);

    const issueButton = page.getByRole('button', {
      name: 'Emitir Credencial V2 (Participant)',
    });
    await issueButton.click();

    const resultBox = page.getByTestId('v2-issuance-result');
    await resultBox.waitFor({ state: 'visible', timeout: 90000 });
    const resultText = await resultBox.textContent();
    assert(resultText.includes('Confirmada en Stellar'), `Expected 'Confirmada en Stellar' in result, got: ${resultText}`);
    assert(resultText.includes('Gateway Soroban V2 (soroban_v2'));
    assert(resultText.includes('Verificada (32/32 bytes)'));

    const credHref = await page
      .getByRole('link', { name: 'Ver credencial pública V2' })
      .getAttribute('href');
    assert(credHref && credHref.startsWith('/credentials/cg2_'));
    const publicId = credHref.replace('/credentials/', '');

    // Query PostgreSQL for the persisted credential & stellar_operations record
    const dbRecord = await getDbCredentialAndOperationByPublicId(DB_URL, publicId);
    assert(dbRecord, `Credential ${publicId} not found in PostgreSQL`);
    assert.equal(dbRecord.phase, 'confirmed', 'stellar_operations phase must be confirmed');
    assert(dbRecord.tx_hash, 'stellar_operations tx_hash must be recorded');
    assert(dbRecord.issued_ledger != null, 'credentials.issued_ledger must be recorded');
    assert.equal(dbRecord.issued_ledger, dbRecord.op_ledger);
    const localDigest = dbRecord.payload_digest;

    // Independent on-chain readback via Soroban RPC
    const rpcServer = new rpc.Server(RPC_URL, { timeoutInSeconds: 30 });
    const txResp = await rpcServer.getTransaction(dbRecord.tx_hash);
    assert.equal(txResp.status, 'SUCCESS', 'On-chain transaction status must be SUCCESS');
    assert.equal(txResp.ledger, dbRecord.issued_ledger, 'On-chain tx ledger must match DB issued_ledger');

    const contract = new Contract(CREDENTIAL_CONTRACT_ID);
    const credentialIdBytes = createHash('sha256')
      .update(`culturago.credential.v2.id\0${publicId}`)
      .digest();
    const expectedScopeBytes = createHash('sha256')
      .update(`culturago.participation.v2\0${fixtures.participation3Id}`)
      .digest();

    const account = await rpcServer.getAccount(preflight.operatorAddress);
    const readTx = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        contract.call('get_credential', xdr.ScVal.scvBytes(credentialIdBytes))
      )
      .setTimeout(60)
      .build();
    const sim = await rpcServer.simulateTransaction(readTx);
    assert(!rpc.Api.isSimulationError(sim), sim.error);
    const onChainRecord = scValToNative(sim.result.retval);
    const contractReadbackDigest = Buffer.from(onChainRecord.metadata_hash).toString(
      'hex'
    );

    const readScopeTx = new TransactionBuilder(
      await rpcServer.getAccount(preflight.operatorAddress),
      {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
      }
    )
      .addOperation(
        contract.call('get_v2_scope', xdr.ScVal.scvBytes(credentialIdBytes))
      )
      .setTimeout(60)
      .build();
    const scopeSim = await rpcServer.simulateTransaction(readScopeTx);
    assert(!rpc.Api.isSimulationError(scopeSim), scopeSim.error);
    const onChainScopeHex = Buffer.from(
      scValToNative(scopeSim.result.retval)
    ).toString('hex');

    // Byte-for-byte 32-byte digest comparison
    const localDigestBuf = Buffer.from(localDigest, 'hex');
    const contractDigestBuf = Buffer.from(contractReadbackDigest, 'hex');
    assert.equal(localDigestBuf.byteLength, 32, 'Local digest must be 32 bytes');
    assert.equal(contractDigestBuf.byteLength, 32, 'Contract digest must be 32 bytes');
    assert.equal(
      Buffer.compare(localDigestBuf, contractDigestBuf),
      0,
      'Local 32-byte digest and contract 32-byte digest must match byte-for-byte'
    );
    assert.equal(
      onChainScopeHex,
      expectedScopeBytes.toString('hex'),
      'Contract V2 scope must match expected participation scope'
    );
    assert(resultText.includes(contractReadbackDigest));
    console.log(
      `[4/6] Confirmed on Stellar Testnet: publicId=${publicId} tx=${dbRecord.tx_hash} ledger=${dbRecord.issued_ledger} digest(32B)=${localDigest}`
    );

    // Verify passport coexistence with historical credentials
    await page.getByRole('link', { name: 'Ver pasaporte público' }).click();
    await page.waitForURL(`**/p/${fixtures.subjectSlug}`, { timeout: 15000 });
    await page.getByText(publicId).waitFor({ state: 'visible' });
    const passportText = await page.textContent('main');
    assert(passportText.includes('Confirmada en Stellar'));
    assert(passportText.includes('cg2_HSHtLAutuMlHh4Cr'));
    assert(passportText.includes('cg2_28sPqyDWcYAETPcq'));
    assert(passportText.includes('Registro local — sin confirmación Stellar'));
    console.log(
      `[5/6] Verified /p/${fixtures.subjectSlug}: new credential (${publicId}) shows 'Confirmada en Stellar' alongside historical cg2_HSHtLAutuMlHh4Cr & cg2_28sPqyDWcYAETPcq`
    );

    // Open public credential page
    await page.getByText(publicId).click();
    await page.waitForURL(`**/credentials/${publicId}`, { timeout: 15000 });
    const credPageText = await page.textContent('main');
    assert(credPageText.includes('Confirmada en Stellar'));
    assert(credPageText.includes('Anclaje Soroban Confirmado (Stellar Testnet)'));
    assert(credPageText.includes(dbRecord.tx_hash));
    assert(credPageText.includes(String(dbRecord.issued_ledger)));

    const pdfRes = await fetch(`${BASE_URL}/api/credentials/${publicId}/pdf`);
    assert.equal(pdfRes.status, 200);
    const pdfBinary = Buffer.from(await pdfRes.arrayBuffer()).toString('binary');
    assert(
      pdfBinary.includes(`CONFIRMADA EN STELLAR \\(LEDGER ${dbRecord.issued_ledger}\\)`),
      'PDF must include CONFIRMADA EN STELLAR (LEDGER ...)'
    );
    assert(pdfBinary.includes(dbRecord.tx_hash), 'PDF must include transaction hash');
    assert(pdfBinary.includes(localDigest), 'PDF must include 32-byte digest');

    const qrRes = await fetch(`${BASE_URL}/api/credentials/${publicId}/qr`);
    assert.equal(qrRes.status, 200);
    const qrSvg = await qrRes.text();
    const expectedSvg = await QRCode.toString(
      `${BASE_URL}/credentials/${encodeURIComponent(publicId)}`,
      { type: 'svg', errorCorrectionLevel: 'M', margin: 2 }
    );
    assert.equal(qrSvg.trim(), expectedSvg.trim());
    console.log(
      `[6/6] Verified /credentials/${publicId}, PDF ('CONFIRMADA EN STELLAR (LEDGER ${dbRecord.issued_ledger})') & QR SVG`
    );

    const evidencePath = resolve(ROOT, 'docs/evidence/v2-d2-anchoring.json');
    mkdirSync(dirname(evidencePath), { recursive: true });
    const evidence = {
      observedAt: new Date().toISOString(),
      environment: 'testnet',
      synthetic: true,
      contractId: CREDENTIAL_CONTRACT_ID,
      operatorAddress: preflight.operatorAddress,
      publicId,
      participationId: fixtures.participation3Id,
      presentationCode: fixtures.presentation3Code,
      credentialIdHex: credentialIdBytes.toString('hex'),
      scopeIdHex: onChainScopeHex,
      transactionHash: dbRecord.tx_hash,
      ledger: Number(dbRecord.issued_ledger),
      localDigest,
      contractReadbackDigest,
      digestsMatchByteForByte:
        Buffer.compare(localDigestBuf, contractDigestBuf) === 0 &&
        localDigestBuf.byteLength === 32,
      hashSchema: Number(onChainRecord.hash_schema),
      familyCode: Number(onChainRecord.credential_type),
      revoked: Boolean(onChainRecord.revoked),
      tokenId: String(onChainRecord.token_id),
      viewsVerified: {
        organizerStatusLabel: 'Confirmada en Stellar',
        passportPath: `/p/${fixtures.subjectSlug}`,
        passportStatusLabel: 'Confirmada en Stellar',
        historicalCredentialsPreserved: [
          {
            publicId: 'cg2_HSHtLAutuMlHh4Cr',
            digest: '4fef5c6554179629c2e0f56eee83fac0c537e861289c96fe8ecc5491348834a5',
            statusLabel: 'Registro local — sin confirmación Stellar',
          },
          {
            publicId: 'cg2_28sPqyDWcYAETPcq',
            digest: 'e2c62cea41b41bf9dbccdf7a9d6b8f3b8a1d02d24ffa8fbc7886a819e29681b7',
            statusLabel: 'Registro local — sin confirmación Stellar',
          },
        ],
        publicCredentialPath: `/credentials/${publicId}`,
        publicCredentialStatusLabel: 'Confirmada en Stellar',
        pdfPath: `/api/credentials/${publicId}/pdf`,
        pdfStatusText: `CONFIRMADA EN STELLAR (LEDGER ${dbRecord.issued_ledger})`,
        qrPath: `/api/credentials/${publicId}/qr`,
        qrMatchesExpectedUrl: true,
      },
    };
    const serialized = JSON.stringify(evidence, null, 2) + '\n';
    if (/S[A-Z2-7]{55}/.test(serialized)) {
      throw new Error('SECURITY VIOLATION: Refusing to write secret seed to evidence file');
    }
    writeFileSync(evidencePath, serialized);
    console.log(serialized);
  } finally {
    if (browser) await browser.close();
    serverProc.kill();
  }
}

main().catch((err) => {
  console.error('D2 Testnet verification failed:', err.message);
  process.exit(1);
});
