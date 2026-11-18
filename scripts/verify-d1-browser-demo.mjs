#!/usr/bin/env node
/**
 * Executes the complete D1 browser demonstration in Chromium (Playwright)
 * against the isolated test PostgreSQL database (`culturago_test` on 127.0.0.1:5433):
 *   1. Iniciar sesión en /login (registro y autenticación WebAuthn passkey con código sintético)
 *   2. Emitir nueva Credencial V2 en /organizer (preservando la credencial histórica anterior)
 *   3. Abrir pasaporte público (/p/camila-danzante-sintetica) y verificar coexistencia con histórica y textos públicos limpios
 *   4. Abrir la nueva credencial pública (/credentials/[publicId]) y verificar fechas YYYY-MM-DD, rol en español y QR de consulta
 *   5. Descargar PDF (/api/credentials/[publicId]/pdf) y verificar "Constancia de participación cultural", tildes/ñ, rol en español y zona horaria (UTC)
 *   6. Comprobar que el QR (/api/credentials/[publicId]/qr) codifica exactamente la URL de la credencial
 *
 * Usage: node scripts/verify-d1-browser-demo.mjs
 */
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import QRCode from 'qrcode';
import { seedD1SyntheticDemo } from './seed-d1-synthetic-demo.mjs';

const PORT = Number(process.env.D1_DEMO_PORT || 3000);
const BASE_URL = `http://localhost:${PORT}`;
const DB_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://postgres:test@127.0.0.1:5433/culturago_test';

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

async function main() {
  // 1. Seed isolated test database (preserving historical D1-SINT-001 credential intact)
  const fixtures = await seedD1SyntheticDemo(DB_URL, {
    preserveIssuedOnParticipation2: false,
  });
  console.log(`[1/6] Isolated test DB seeded (${fixtures.claimCode}); historical D1-SINT-001 preserved`);

  // 2. Start production server on PORT connected to isolated test DB
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
        NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
        NEXT_PUBLIC_STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
        NEXT_PUBLIC_APP_URL: BASE_URL,
        APP_URL: BASE_URL,
        WEBAUTHN_RP_ID: 'localhost',
        WEBAUTHN_ORIGINS: BASE_URL,
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

    // Enable Chromium virtual WebAuthn authenticator via CDP
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

    // Step 1: Iniciar sesión (/login -> claim + register passkey -> redirect to /organizer)
    await page.goto('/login');
    await page.getByRole('button', { name: 'Registrar passkey' }).first().click();
    await page.getByPlaceholder('Juan Pérez').fill('Operador Sintético D1');
    await page.getByPlaceholder('Pegá el código que recibiste').fill(fixtures.claimCode);
    await page.getByRole('button', { name: 'Registrar passkey' }).nth(1).click();

    await page.waitForURL('**/organizer', { timeout: 15000 });
    console.log(`[3/6] Logged in via /login WebAuthn Passkey and redirected to /organizer`);

    // Step 2: Emitir nueva Credencial V2 en /organizer (para D1-SINT-002)
    const v2Heading = page.getByRole('heading', {
      name: 'Emisión Credential V2 — Familia Participant',
    });
    await v2Heading.waitFor({ state: 'visible' });

    const issueButton = page.getByRole('button', {
      name: 'Emitir Credencial V2 (Participant)',
    });
    await issueButton.click();

    const resultBox = page.getByTestId('v2-issuance-result');
    await resultBox.waitFor({ state: 'visible', timeout: 15000 });
    const resultText = await resultBox.textContent();
    assert(resultText.includes('Registro local — sin confirmación Stellar'));
    assert(resultText.includes('Gateway Simulado (simulated_d1'));
    assert(
      resultText.includes(
        'este resultado es una simulación y no constituye confirmación en Stellar'
      )
    );

    const credHref = await page
      .getByRole('link', { name: 'Ver credencial pública V2' })
      .getAttribute('href');
    assert(credHref && credHref.startsWith('/credentials/cg2_'));
    const publicId = credHref.replace('/credentials/', '');
    console.log(`[4/6] Issued new V2 credential from /organizer: ${publicId}`);

    // Step 3: Abrir pasaporte público desde el enlace del resultado
    await page.getByRole('link', { name: 'Ver pasaporte público' }).click();
    await page.waitForURL(`**/p/${fixtures.subjectSlug}`, { timeout: 15000 });
    await page.getByText('Kamila Nur').waitFor({ state: 'visible' });
    await page.getByText(publicId).waitFor({ state: 'visible' });
    const passportContent = await page.textContent('main');
    assert(passportContent.includes('Pasaporte Cultural'));
    assert(passportContent.includes('Código QR de consulta'));
    assert(!passportContent.includes('Pasaporte Cultural Oficial'));
    assert(!passportContent.includes('REPÚBLICA DE CHILE'));
    assert(!passportContent.includes('Verificado FDVC'));
    assert(!passportContent.includes('Validez: Sep 2026'));
    assert(passportContent.includes('Participante'));
    assert(passportContent.includes('Solista'));
    assert(passportContent.includes('Registro local — sin confirmación Stellar'));
    assert(passportContent.includes('cg2_HSHtLAutuMlHh4Cr'), 'Historical credential cg2_HSHtLAutuMlHh4Cr must remain visible');
    assert(!passportContent.includes('Confirmada en Stellar'));
    console.log(`[5/6] Verified new (${publicId}) & historical (cg2_HSHtLAutuMlHh4Cr) V2 credentials on /p/${fixtures.subjectSlug}`);

    // Step 4: Abrir la nueva credencial pública desde la tarjeta del pasaporte
    await page.getByText(publicId).click();
    await page.waitForURL(`**/credentials/${publicId}`, { timeout: 15000 });
    const credPageText = await page.textContent('main');
    assert(credPageText.includes('Registro local — sin confirmación Stellar'));
    assert(credPageText.includes('Camila Danzante Sintética ("Kamila Nur")'));
    assert(credPageText.includes('Bailarina / Intérprete'));
    assert(credPageText.includes('Código QR de consulta'));
    assert(!credPageText.includes('Código QR Oficial'));
    assert(credPageText.includes('"start_date": "2026-11-20"'));
    assert(credPageText.includes('"end_date": "2026-11-21"'));

    // Step 5: Descargar PDF y verificar contenido real
    const pdfHref = await page
      .getByRole('link', { name: 'Descargar Certificado (PDF)' })
      .getAttribute('href');
    assert.equal(pdfHref, `/api/credentials/${publicId}/pdf`);

    const pdfRes = await fetch(`${BASE_URL}${pdfHref}`);
    assert.equal(pdfRes.status, 200);
    assert.equal(pdfRes.headers.get('content-type'), 'application/pdf');
    const pdfBinary = Buffer.from(await pdfRes.arrayBuffer()).toString('binary');
    assert(pdfBinary.startsWith('%PDF-1.4'));
    assert(pdfBinary.includes('/Encoding /WinAnsiEncoding'));
    assert(pdfBinary.includes('Constancia de participaci\\363n cultural'));
    assert(pdfBinary.includes('Bailarina / Int\\351rprete'));
    assert(pdfBinary.includes('\\(UTC\\)'));
    assert(pdfBinary.includes(publicId));
    assert(pdfBinary.includes('Camila Danzante Sint\\351tica'));
    assert(pdfBinary.includes(`${BASE_URL}/credentials/${publicId}`));

    // Step 6: Comprobar que el QR dirige a la URL correcta
    const qrHref = await page
      .getByRole('link', { name: 'Ver Código QR' })
      .getAttribute('href');
    assert.equal(qrHref, `/api/credentials/${publicId}/qr`);

    const qrRes = await fetch(`${BASE_URL}${qrHref}`);
    assert.equal(qrRes.status, 200);
    assert(qrRes.headers.get('content-type')?.includes('image/svg+xml'));
    const qrSvg = await qrRes.text();

    const expectedVerifyUrl = `${BASE_URL}/credentials/${encodeURIComponent(publicId)}`;
    const expectedSvg = await QRCode.toString(expectedVerifyUrl, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
    });
    assert.equal(
      qrSvg.trim(),
      expectedSvg.trim(),
      `QR SVG must encode exact URL ${expectedVerifyUrl}`
    );
    console.log(
      `[6/6] Verified PDF (%PDF-1.4, Constancia de participación cultural, tildes/ñ, rol ES, UTC) & QR SVG encodes ${expectedVerifyUrl}`
    );
  } finally {
    if (browser) await browser.close();
    serverProc.kill();
    // Preserve BOTH the historical D1-SINT-001 credential AND the newly issued D1-SINT-002 credential,
    // while refreshing the operator claim code (D1-SINTETICO-2026) and D1-SINT-003 for manual testing!
    await seedD1SyntheticDemo(DB_URL, {
      preserveIssuedOnParticipation2: true,
    });
  }
}

main().catch((err) => {
  console.error('D1 Browser Demo verification failed:', err);
  process.exit(1);
});
