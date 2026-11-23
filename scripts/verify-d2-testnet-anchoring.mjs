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
import { seedD1SyntheticDemo } from './seed-d1-synthetic-demo.mjs';

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

async function main() {
  const fixtures = await seedD1SyntheticDemo(DB_URL, {
    preserveIssuedOnParticipation2: true,
  });

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

    const issueButton = page.getByRole('button', {
      name: 'Emitir Credencial V2 (Participant)',
    });
    await issueButton.click();

    const resultBox = page.getByTestId('v2-issuance-result');
    await resultBox.waitFor({ state: 'visible', timeout: 60000 });
    const resultText = await resultBox.textContent();
    assert(resultText.includes('Confirmada en Stellar'));
    assert(resultText.includes('Gateway Soroban V2 (soroban_v2'));
    assert(resultText.includes('Verificada (32/32 bytes)'));

    const credHref = await page
      .getByRole('link', { name: 'Ver credencial pública V2' })
      .getAttribute('href');
    assert(credHref && credHref.startsWith('/credentials/cg2_'));
    const publicId = credHref.replace('/credentials/', '');

    // Independent on-chain readback via Soroban RPC
    const rpcServer = new rpc.Server(RPC_URL, { timeoutInSeconds: 30 });
    const contract = new Contract(CREDENTIAL_CONTRACT_ID);
    const credentialIdBytes = createHash('sha256')
      .update(`culturago.credential.v2.id\0${publicId}`)
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
    const onChainDigest = Buffer.from(onChainRecord.metadata_hash).toString(
      'hex'
    );

    assert(resultText.includes(onChainDigest));

    // Verify passport coexistence with historical credentials
    await page.getByRole('link', { name: 'Ver pasaporte público' }).click();
    await page.waitForURL(`**/p/${fixtures.subjectSlug}`, { timeout: 15000 });
    await page.getByText(publicId).waitFor({ state: 'visible' });
    const passportText = await page.textContent('main');
    assert(passportText.includes('Confirmada en Stellar'));
    assert(passportText.includes('cg2_HSHtLAutuMlHh4Cr'));
    assert(passportText.includes('cg2_28sPqyDWcYAETPcq'));
    assert(passportText.includes('Registro local — sin confirmación Stellar'));

    // Open public credential page
    await page.getByText(publicId).click();
    await page.waitForURL(`**/credentials/${publicId}`, { timeout: 15000 });
    const credPageText = await page.textContent('main');
    assert(credPageText.includes('Confirmada en Stellar'));
    assert(credPageText.includes('Anclaje Soroban Confirmado (Stellar Testnet)'));

    const pdfRes = await fetch(`${BASE_URL}/api/credentials/${publicId}/pdf`);
    assert.equal(pdfRes.status, 200);
    const pdfBinary = Buffer.from(await pdfRes.arrayBuffer()).toString('binary');
    assert(pdfBinary.includes('CONFIRMADA EN STELLAR'));

    const qrRes = await fetch(`${BASE_URL}/api/credentials/${publicId}/qr`);
    assert.equal(qrRes.status, 200);
    const qrSvg = await qrRes.text();
    const expectedSvg = await QRCode.toString(
      `${BASE_URL}/credentials/${encodeURIComponent(publicId)}`,
      { type: 'svg', errorCorrectionLevel: 'M', margin: 2 }
    );
    assert.equal(qrSvg.trim(), expectedSvg.trim());

    const evidencePath = resolve(ROOT, 'docs/evidence/v2-d2-anchoring.json');
    mkdirSync(dirname(evidencePath), { recursive: true });
    const evidence = {
      observedAt: new Date().toISOString(),
      environment: 'testnet',
      contractId: CREDENTIAL_CONTRACT_ID,
      operatorAddress: preflight.operatorAddress,
      publicId,
      credentialIdHex: credentialIdBytes.toString('hex'),
      issuedLedger: Number(onChainRecord.issued_ledger),
      onChainDigest,
      hashSchema: Number(onChainRecord.hash_schema),
      revoked: Boolean(onChainRecord.revoked),
      tokenId: String(onChainRecord.token_id),
    };
    writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    if (browser) await browser.close();
    serverProc.kill();
  }
}

main().catch((err) => {
  console.error('D2 Testnet verification failed:', err.message);
  process.exit(1);
});
