#!/usr/bin/env node
/**
 * Executes the complete Week 3 (D3) end-to-end verification on DEV
 * (`https://dev.culturago.cl`) connected to Stellar Testnet:
 *
 *   1. Authenticates on `/login` via real WebAuthn Passkey registration
 *      (virtual CTAP2 authenticator) using a one-time synthetic operator claim
 *      code, redirecting to `/organizer`.
 *   2. Emits a brand-new synthetic `participant` Credential V2 (`D3-SINT-001`)
 *      from `/organizer`, anchoring it on Stellar Testnet via `issue_credential_v2`.
 *   3. Independently queries Soroban Testnet RPC (`getTransaction`,
 *      `get_credential`, `get_v2_scope`) without signing keys to verify
 *      transaction confirmation, ledger, scope, schema, and 32-byte digest.
 *   4. Opens a clean, unauthenticated browser context (zero cookies / no session)
 *      and verifies on DEV:
 *        - Historical D2 reference (`/credentials/cg2_5bjYVuqiWWw0JEWP`)
 *        - Caso 1 (Coincidencia): `/credentials/<newPublicId>`
 *        - Caso 2 (Discrepancia): `/credentials/<newPublicId>?demo=mismatch`
 *        - Caso 3 (Indisponibilidad): `/credentials/<newPublicId>?demo=unavailable`
 *        - Post-Caso-3 repeatability check of Caso 1: `/credentials/<newPublicId>`
 *
 * Never prints, logs, or writes secret keys.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import {
  Account,
  Contract,
  Networks,
  StrKey,
  TransactionBuilder,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const DEV_BASE_URL = process.env.D3_DEV_BASE_URL || 'https://dev.culturago.cl';
const RPC_URL =
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL ||
  'https://soroban-testnet.stellar.org';
const CONTRACT_ID =
  process.env.D3_CONTRACT_ID ||
  'CBKX6WIZ25IKKPHIDSTEPLLLMQMRK3DFO5UD3H5YZVXJZ452JNIYHYW6';
const PARTICIPATION_ID =
  process.env.D3_PARTICIPATION_ID || 'd3000002-0000-4000-8000-000000000002';
const CLAIM_CODE = process.env.D3_CLAIM_CODE || 'D3-SINTETICO-2026';
const D2_PUBLIC_ID = 'cg2_5bjYVuqiWWw0JEWP';
const SUBJECT_SLUG = 'camila-danzante-sintetica';
const EVIDENCE_SCREENSHOT_DIR =
  process.env.D3_SCREENSHOT_DIR ||
  resolve(ROOT, 'scratch', 'd3-dev-screenshots');

mkdirSync(EVIDENCE_SCREENSHOT_DIR, { recursive: true });

async function launchChromium() {
  try {
    return await chromium.launch({ headless: true, channel: 'chrome' });
  } catch {
    try {
      return await chromium.launch({ headless: true, channel: 'msedge' });
    } catch {
      return await chromium.launch({ headless: true });
    }
  }
}

async function querySorobanReadOnly(publicId, expectedParticipationId) {
  const credentialIdBytes = createHash('sha256')
    .update(`culturago.credential.v2.id\0${publicId}`)
    .digest();
  const expectedScopeBytes = createHash('sha256')
    .update(`culturago.participation.v2\0${expectedParticipationId}`)
    .digest();

  const server = new rpc.Server(RPC_URL, { timeoutInSeconds: 30 });
  const readonlyPubKey = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 0));
  const contract = new Contract(CONTRACT_ID);

  const credTx = new TransactionBuilder(new Account(readonlyPubKey, '0'), {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      contract.call('get_credential', xdr.ScVal.scvBytes(credentialIdBytes))
    )
    .setTimeout(60)
    .build();
  const credSim = await server.simulateTransaction(credTx);
  assert(!rpc.Api.isSimulationError(credSim), `get_credential sim error: ${credSim.error}`);
  const record = scValToNative(credSim.result.retval);
  assert(record && typeof record === 'object', 'Expected on-chain CredentialRecord');

  const scopeTx = new TransactionBuilder(new Account(readonlyPubKey, '0'), {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      contract.call('get_v2_scope', xdr.ScVal.scvBytes(credentialIdBytes))
    )
    .setTimeout(60)
    .build();
  const scopeSim = await server.simulateTransaction(scopeTx);
  assert(!rpc.Api.isSimulationError(scopeSim), `get_v2_scope sim error: ${scopeSim.error}`);
  const scopeVal = scValToNative(scopeSim.result.retval);
  const scopeHex = Buffer.from(scopeVal).toString('hex');
  assert.equal(scopeHex, expectedScopeBytes.toString('hex'), 'On-chain V2 scope mismatch');

  return {
    credentialIdHex: credentialIdBytes.toString('hex'),
    scopeIdHex: scopeHex,
    metadataHashHex: Buffer.from(record.metadata_hash).toString('hex'),
    hashSchema: Number(record.hash_schema),
    familyCode: Number(record.credential_type),
    issuedLedger: Number(record.issued_ledger),
    revoked: Boolean(record.revoked),
    tokenId: String(record.token_id),
    issuedBy: String(record.issued_by),
  };
}

async function queryRpcTransaction(txHash) {
  const resp = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTransaction',
      params: { hash: txHash },
    }),
  }).then((r) => r.json());

  assert.equal(
    resp.result?.status,
    'SUCCESS',
    `Expected RPC tx status SUCCESS, got ${JSON.stringify(resp)}`
  );
  return {
    status: resp.result.status,
    ledger: Number(resp.result.ledger),
    latestLedger: Number(resp.result.latestLedger),
  };
}

async function main() {
  const browser = await launchChromium();

  try {
    // =========================================================================
    // PHASE 1: Authenticated Organizer Issuance on DEV via Real WebAuthn Passkey
    // =========================================================================
    const operatorContext = await browser.newContext({
      baseURL: DEV_BASE_URL,
      viewport: { width: 1280, height: 960 },
      recordVideo: {
        dir: EVIDENCE_SCREENSHOT_DIR,
        size: { width: 1280, height: 960 },
      },
    });
    const opPage = await operatorContext.newPage();

    const cdp = await operatorContext.newCDPSession(opPage);
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

    await opPage.goto('/login', { waitUntil: 'networkidle' });
    await opPage
      .getByRole('button', { name: 'Registrar passkey' })
      .first()
      .click();
    await opPage.getByPlaceholder('Juan Pérez').fill('Operador Sintético D3');
    await opPage
      .getByPlaceholder('Pegá el código que recibiste')
      .fill(CLAIM_CODE);
    await opPage
      .getByRole('button', { name: 'Registrar passkey' })
      .nth(1)
      .click();

    await opPage.waitForURL('**/organizer', { timeout: 25000 });
    console.log('[1/6] Authenticated via WebAuthn Passkey and redirected to /organizer');

    await opPage
      .locator('#v2-participation-select')
      .selectOption(PARTICIPATION_ID);
    await opPage
      .getByRole('button', { name: 'Emitir Credencial V2 (Participant)' })
      .click();

    const resultBox = opPage.getByTestId('v2-issuance-result');
    await resultBox.waitFor({ state: 'visible', timeout: 120000 });
    const organizerResultText = (await resultBox.textContent()) ?? '';
    assert(
      organizerResultText.includes('Confirmada en Stellar'),
      `Expected 'Confirmada en Stellar' in Organizer, got: ${organizerResultText}`
    );
    assert(
      organizerResultText.includes('Verificada (32/32 bytes)'),
      `Expected 'Verificada (32/32 bytes)' in Organizer, got: ${organizerResultText}`
    );

    const credHref = await opPage
      .getByRole('link', { name: 'Ver credencial pública V2' })
      .getAttribute('href');
    assert(credHref && credHref.startsWith('/credentials/cg2_'));
    const newPublicId = credHref.replace('/credentials/', '');

    const txMatch = /Tx Hash:\s*([0-9a-f]{64})/i.exec(organizerResultText);
    const ledgerMatch = /Ledger:\s*(\d+)/i.exec(organizerResultText);
    assert(txMatch, `Could not extract 64-hex Tx Hash from: ${organizerResultText}`);
    assert(ledgerMatch, `Could not extract Ledger from: ${organizerResultText}`);
    const issuedTxHash = txMatch[1].toLowerCase();
    const issuedLedger = Number(ledgerMatch[1]);

    const organizerScreenshot = resolve(
      EVIDENCE_SCREENSHOT_DIR,
      '01-organizer-issuance-confirmed.png'
    );
    await opPage.screenshot({ path: organizerScreenshot, fullPage: true });
    await operatorContext.close();
    console.log(
      `[2/6] Issued from DEV /organizer: publicId=${newPublicId} tx=${issuedTxHash} ledger=${issuedLedger}`
    );

    // Independent Soroban Testnet RPC verification (keyless)
    const txRpc = await queryRpcTransaction(issuedTxHash);
    assert.equal(txRpc.ledger, issuedLedger);
    const chainReadback = await querySorobanReadOnly(
      newPublicId,
      PARTICIPATION_ID
    );
    assert.equal(chainReadback.issuedLedger, issuedLedger);
    assert.equal(chainReadback.hashSchema, 2);
    assert.equal(chainReadback.familyCode, 101);
    assert.equal(chainReadback.revoked, false);
    console.log(
      `[3/6] Independent Soroban RPC readback verified: digest=${chainReadback.metadataHashHex}`
    );

    // =========================================================================
    // PHASE 2: Private / Unauthenticated Browser Context (Zero Cookies / Session)
    // =========================================================================
    const publicContext = await browser.newContext({
      baseURL: DEV_BASE_URL,
      viewport: { width: 1280, height: 960 },
      recordVideo: {
        dir: EVIDENCE_SCREENSHOT_DIR,
        size: { width: 1280, height: 960 },
      },
    });
    const pubPage = await publicContext.newPage();

    // Verify zero session in this private context
    const meRes = await pubPage.request.get(`${DEV_BASE_URL}/api/auth/me`);
    assert(
      meRes.status() === 401 || !(await meRes.json()).authenticated,
      'Public context must be strictly unauthenticated'
    );
    assert.equal((await publicContext.cookies()).length, 0);

    // Check D2 reference credential in DEV without session
    await pubPage.goto(`/credentials/${D2_PUBLIC_ID}`, {
      waitUntil: 'networkidle',
    });
    const d2Status = (
      await pubPage.getByTestId('public-verification-status').textContent()
    )?.trim();
    assert.equal(d2Status, 'Integridad confirmada en Stellar Testnet');
    const d2Details = pubPage.locator('details').first();
    if (!(await d2Details.evaluate((el) => el.hasAttribute('open')))) {
      await d2Details.locator('summary').click();
      await pubPage.evaluate(() => window.scrollTo(0, 0));
    }
    const d2Recomputed = (
      await pubPage.getByTestId('recomputed-digest').textContent()
    )?.trim();
    const d2Contract = (
      await pubPage.getByTestId('contract-readback-digest').textContent()
    )?.trim();
    assert.equal(d2Recomputed, d2Contract);
    const d2Screenshot = resolve(
      EVIDENCE_SCREENSHOT_DIR,
      '00-d2-reference-credential.png'
    );
    await pubPage.screenshot({ path: d2Screenshot, fullPage: true });

    // Check public passport without session
    await pubPage.goto(`/p/${SUBJECT_SLUG}`, { waitUntil: 'networkidle' });
    await pubPage.getByText(newPublicId).waitFor({ state: 'visible' });
    const passportScreenshot = resolve(
      EVIDENCE_SCREENSHOT_DIR,
      '02-public-passport.png'
    );
    await pubPage.screenshot({ path: passportScreenshot, fullPage: true });

    // --- CASO 1: Coincidencia (sin sesión) ---
    const case1Url = `${DEV_BASE_URL}/credentials/${newPublicId}`;
    await pubPage.goto(case1Url, { waitUntil: 'networkidle' });
    const case1Status = (
      await pubPage.getByTestId('public-verification-status').textContent()
    )?.trim();
    assert.equal(case1Status, 'Integridad confirmada en Stellar Testnet');

    const detailsEl = pubPage.locator('details').first();
    if (!(await detailsEl.evaluate((el) => el.hasAttribute('open')))) {
      await detailsEl.locator('summary').click();
      await pubPage.evaluate(() => window.scrollTo(0, 0));
    }
    const case1Subtitle = (
      await pubPage.getByTestId('presented-display-subtitle').textContent()
    )?.trim();
    const case1Recomputed = (
      await pubPage.getByTestId('recomputed-digest').textContent()
    )?.trim();
    const case1Contract = (
      await pubPage.getByTestId('contract-readback-digest').textContent()
    )?.trim();
    const case1Persisted = (
      await pubPage.getByTestId('persisted-audit-digest').textContent()
    )?.trim();
    assert.equal(case1Recomputed, chainReadback.metadataHashHex);
    assert.equal(case1Contract, chainReadback.metadataHashHex);
    assert.equal(case1Persisted, chainReadback.metadataHashHex);
    assert.equal(
      Buffer.compare(
        Buffer.from(case1Recomputed, 'hex'),
        Buffer.from(case1Contract, 'hex')
      ),
      0
    );

    const case1Screenshot = resolve(
      EVIDENCE_SCREENSHOT_DIR,
      '03-case1-confirmed-match.png'
    );
    await pubPage.screenshot({ path: case1Screenshot, fullPage: true });
    console.log(`[4/6] Caso 1 verified without session: ${case1Url}`);

    // --- CASO 2: Discrepancia (sin sesión) ---
    const case2Url = `${DEV_BASE_URL}/credentials/${newPublicId}?demo=mismatch`;
    await pubPage.goto(case2Url, { waitUntil: 'networkidle' });
    const case2Status = (
      await pubPage.getByTestId('public-verification-status').textContent()
    )?.trim();
    assert.equal(
      case2Status,
      'El contenido no coincide con el registro en Stellar'
    );
    const case2Subtitle = (
      await pubPage.getByTestId('presented-display-subtitle').textContent()
    )?.trim();
    assert(case2Subtitle?.includes('Variante sintética alterada (D3)'));
    const case2Recomputed = (
      await pubPage.getByTestId('recomputed-digest').textContent()
    )?.trim();
    const case2Contract = (
      await pubPage.getByTestId('contract-readback-digest').textContent()
    )?.trim();
    const case2Persisted = (
      await pubPage.getByTestId('persisted-audit-digest').textContent()
    )?.trim();
    assert.equal(case2Contract, chainReadback.metadataHashHex);
    assert.equal(case2Persisted, chainReadback.metadataHashHex);
    assert.notEqual(case2Recomputed, case2Contract);

    const case2Screenshot = resolve(
      EVIDENCE_SCREENSHOT_DIR,
      '04-case2-mismatch.png'
    );
    await pubPage.screenshot({ path: case2Screenshot, fullPage: true });
    console.log(
      `[5/6] Caso 2 verified without session: recomputed=${case2Recomputed} vs contract=${case2Contract}`
    );

    // --- CASO 3: Indisponibilidad (sin sesión) + Comprobación posterior Caso 1 ---
    const case3Url = `${DEV_BASE_URL}/credentials/${newPublicId}?demo=unavailable`;
    await pubPage.goto(case3Url, { waitUntil: 'networkidle' });
    const case3Status = (
      await pubPage.getByTestId('public-verification-status').textContent()
    )?.trim();
    assert.equal(
      case3Status,
      'No fue posible consultar Stellar; intenta nuevamente'
    );
    const case3Recomputed = (
      await pubPage.getByTestId('recomputed-digest').textContent()
    )?.trim();
    assert.equal(case3Recomputed, chainReadback.metadataHashHex);

    const case3Screenshot = resolve(
      EVIDENCE_SCREENSHOT_DIR,
      '05-case3-unavailable.png'
    );
    await pubPage.screenshot({ path: case3Screenshot, fullPage: true });

    // Immediate repeatability check of Caso 1 without session
    await pubPage.goto(case1Url, { waitUntil: 'networkidle' });
    const case1RepeatStatus = (
      await pubPage.getByTestId('public-verification-status').textContent()
    )?.trim();
    assert.equal(
      case1RepeatStatus,
      'Integridad confirmada en Stellar Testnet'
    );
    const case1RepeatScreenshot = resolve(
      EVIDENCE_SCREENSHOT_DIR,
      '06-case1-post-unavailable-repeatcheck.png'
    );
    await pubPage.screenshot({ path: case1RepeatScreenshot, fullPage: true });
    await publicContext.close();
    console.log(`[6/6] Caso 3 and post-Caso-3 Caso 1 repeatability verified without session`);

    const evidence = {
      observedAt: new Date().toISOString(),
      environment: 'testnet',
      devBaseUrl: DEV_BASE_URL,
      synthetic: true,
      contractId: CONTRACT_ID,
      rpcUrl: RPC_URL,
      organizerIssuance: {
        participationId: PARTICIPATION_ID,
        presentationCode: 'D3-SINT-001',
        eventName: 'Muestra Sintética D3 Verificación Pública 2026',
        issuerDisplayName: 'Agrupación Danza Viva Sintética',
        subjectDisplayName: 'Camila Danzante Sintética',
        subjectArtisticName: 'Kamila Nur',
        passportUrl: `${DEV_BASE_URL}/p/${SUBJECT_SLUG}`,
        publicId: newPublicId,
        credentialIdHex: chainReadback.credentialIdHex,
        scopeIdHex: chainReadback.scopeIdHex,
        transactionHash: issuedTxHash,
        ledger: issuedLedger,
        operatorAddress: chainReadback.issuedBy,
        tokenId: chainReadback.tokenId,
        hashSchema: chainReadback.hashSchema,
        familyCode: chainReadback.familyCode,
        revoked: chainReadback.revoked,
        contractReadbackDigest: chainReadback.metadataHashHex,
      },
      d2ReferenceCheckOnDev: {
        url: `${DEV_BASE_URL}/credentials/${D2_PUBLIC_ID}`,
        publicId: D2_PUBLIC_ID,
        statusLabel: d2Status,
        recomputedDigest: d2Recomputed,
        contractReadbackDigest: d2Contract,
        digestsMatch32Bytes: d2Recomputed === d2Contract,
      },
      publicDemoCasesWithoutSession: {
        case1Match: {
          url: case1Url,
          sessionAuthenticated: false,
          statusLabel: case1Status,
          presentedSubtitle: case1Subtitle,
          recomputedDigest: case1Recomputed,
          contractReadbackDigest: case1Contract,
          persistedAuditDigest: case1Persisted,
          digestsMatchByteForByte: case1Recomputed === case1Contract,
          ledger: issuedLedger,
          transactionHash: issuedTxHash,
          contractId: CONTRACT_ID,
        },
        case2Mismatch: {
          url: case2Url,
          sessionAuthenticated: false,
          statusLabel: case2Status,
          alteredField: 'claim.display_subtitle',
          originalValue: case1Subtitle,
          alteredValue: case2Subtitle,
          recomputedDigest: case2Recomputed,
          contractReadbackDigest: case2Contract,
          persistedAuditDigest: case2Persisted,
          digestsMatchByteForByte: false,
          referenceCredentialPreserved: true,
        },
        case3Unavailable: {
          url: case3Url,
          sessionAuthenticated: false,
          statusLabel: case3Status,
          recomputedDigest: case3Recomputed,
          scopedFaultOnly: true,
          case1NormalAfterFaultStatusLabel: case1RepeatStatus,
        },
      },
    };

    const serialized = JSON.stringify(evidence, null, 2) + '\n';
    if (/S[A-Z2-7]{55}/.test(serialized)) {
      throw new Error('SECURITY VIOLATION: Refusing to write secret seed to evidence');
    }
    const evidenceJsonPath = resolve(
      ROOT,
      'docs/evidence/v2-d3-public-verification.json'
    );
    writeFileSync(evidenceJsonPath, serialized);
    console.log(serialized);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('D3 DEV Testnet verification failed:', err);
  process.exit(1);
});
