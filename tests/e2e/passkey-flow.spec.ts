import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';

const polyfill = readFileSync(path.resolve('tests/e2e/webauthn-polyfill.js'), 'utf8');

interface Seed {
  accountId: string;
  personId: string;
  orgId: string;
  sessionToken: string;
}

function loadSeed(): Seed {
  return JSON.parse(readFileSync(path.resolve('tests/e2e/fixtures/e2e-seed.json'), 'utf8')) as Seed;
}

test('passkey e2e: deploy wallet, register entity, issue and revoke credential', async ({ page, context }) => {
  test.setTimeout(400000);
  const seed = loadSeed();

  // Authenticate via seeded session cookie (login passkey is out of scope here).
  await context.addCookies([
    {
      name: 'culturago_session',
      value: seed.sessionToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: false,
      expires: Math.floor(Date.now() / 1000) + 900,
    },
  ]);

  // Inject a software WebAuthn client so passkey-kit works headlessly.
  await page.addInitScript({ content: polyfill });

  page.on('console', (msg) => {
    console.log(`[browser:${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    console.error(`[browser:pageerror] ${err.message}`, err.stack);
  });
  page.on('response', async (res) => {
    if (res.status() >= 400) {
      let body = '';
      try {
        body = await res.text();
      } catch {
        body = '<unreadable>';
      }
      console.error(`[network] ${res.status()} ${res.url()}\n${body.slice(0, 2000)}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Deploy a smart wallet from the dashboard via passkey.
  // ---------------------------------------------------------------------------
  let deployBody: Record<string, unknown> | null = null;
  page.on('request', (req) => {
    if (req.url().includes('/api/smart-wallet/deploy') && req.method() === 'POST') {
      const data = req.postDataJSON();
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        deployBody = data as Record<string, unknown>;
      }
    }
  });

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /Resumen del Sistema/i })).toBeVisible();
  await expect(page.getByText(/Crear Smart Wallet/i)).toBeVisible();

  let walletAddress: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const button = page.getByRole('button', { name: /Crear Smart Wallet/i });
    await expect(button).toBeEnabled();
    await button.click();

    try {
      await page.getByText(/Smart wallet creada/i).waitFor({ state: 'visible', timeout: 120000 });
      walletAddress = await page.locator('[title^="C"]').first().getAttribute('title');
      expect(walletAddress).toMatch(/^C[0-9A-Z]{55}$/);
      break;
    } catch {
      if (await page.getByText(/Failed to fetch/i).isVisible()) {
        if (attempt === 2) {
          throw new Error('Smart wallet creation failed after 3 attempts: Failed to fetch');
        }
        continue;
      }
      throw new Error('Smart wallet creation did not report success or the expected error');
    }
  }

  await expect(page.getByText(/Wallet lista para firmar operaciones/i)).toBeVisible();
  expect(deployBody).not.toBeNull();
  expect(deployBody).toHaveProperty('signedTx');
  expect(deployBody).toHaveProperty('contractId');
  expect(deployBody).toHaveProperty('keyId');
  expect(deployBody).toHaveProperty('walletWasmHash');

  // Grant on-chain roles and link the seeded issuer to the wallet operator.
  // The link is required by the credential contract's ensure_linked check.
  execFileSync('node', ['--env-file=.env', '--env-file=.env.local', 'scripts/grant-roles.mjs', walletAddress!, seed.orgId], {
    cwd: process.cwd(),
    timeout: 120000,
  });

  // ---------------------------------------------------------------------------
  // 2. Register the seeded person on Stellar.
  // ---------------------------------------------------------------------------
  await page.goto('/dashboard/personas');
  await expect(page.getByRole('heading', { name: /Registro General de Personas/i })).toBeVisible();
  const personRow = page.locator(`tr[data-row-id="${seed.personId}"]`);
  await expect(personRow).toBeVisible();
  await personRow.getByRole('button', { name: 'Registrar en Stellar' }).click();
  await expect(page.getByText(/Registro confirmado en Stellar/i)).toBeVisible({ timeout: 90000 });
  await expect(personRow.getByText(/Registro Stellar Verificado/i)).toBeVisible({ timeout: 90000 });

  // ---------------------------------------------------------------------------
  // 2b. Register the seeded organization (issuer) on Stellar.
  // ---------------------------------------------------------------------------
  await page.goto('/dashboard/organizaciones');
  await expect(page.getByRole('heading', { name: /Registro.*Organizaciones/i })).toBeVisible();
  const orgRow = page.locator(`tr[data-row-id="${seed.orgId}"]`);
  await expect(orgRow).toBeVisible();
  await orgRow.getByRole('button', { name: 'Registrar en Stellar' }).click();
  await expect(page.getByText(/Registro confirmado en Stellar/i)).toBeVisible({ timeout: 90000 });
  await expect(orgRow.getByText(/Registro Stellar Verificado/i)).toBeVisible({ timeout: 90000 });

  // ---------------------------------------------------------------------------
  // 3. Issue a verifiable credential to the seeded person.
  // ---------------------------------------------------------------------------
  const credentialCode = `CRED-E2E-${Date.now()}`;
  await page.goto('/dashboard/credenciales');
  await expect(page.getByRole('heading', { name: /Registro de Credenciales/i })).toBeVisible();
  await page.getByRole('button', { name: 'Emitir Credencial' }).click();

  const credentialDialog = page.getByRole('dialog', { name: /Emitir Credencial Verificable/i });
  await expect(credentialDialog).toBeVisible();
  await credentialDialog.getByLabel(/Emisor de la Credencial/i).selectOption(seed.orgId);
  await credentialDialog.getByLabel(/Destinatario de la Credencial/i).selectOption(seed.personId);
  await credentialDialog.getByLabel(/Código de Credencial/i).fill(credentialCode);
  await credentialDialog.getByRole('button', { name: 'Emitir Credencial Verificable' }).click();
  await expect(credentialDialog).not.toBeVisible();

  const credRow = page.locator(`tr:has-text("${credentialCode}")`);
  await expect(credRow).toBeVisible();
  await credRow.getByRole('button', { name: 'Ver en Stellar' }).click();

  const stellarDialog = page.getByRole('dialog', { name: /Detalles Blockchain Stellar/i });
  await expect(stellarDialog).toBeVisible();
  await stellarDialog.getByRole('button', { name: 'Preparar operación Stellar' }).click();
  await stellarDialog.getByRole('button', { name: 'Firmar y enviar' }).click();
  await expect(stellarDialog.getByRole('link', { name: /Ver en Stellar Explorer/i })).toBeVisible({ timeout: 90000 });
  await expect(page.getByText(/Credencial registrada en Stellar/i)).toBeVisible({ timeout: 90000 });
  await expect(credRow.getByText(/Emitida/i)).toBeVisible();
  await expect(credRow.getByText(/Registro Stellar Verificado/i)).toBeVisible();
  await stellarDialog.getByRole('button', { name: 'Cerrar' }).click();
  await expect(stellarDialog).not.toBeVisible();

  // ---------------------------------------------------------------------------
  // 4. Revoke the credential.
  // ---------------------------------------------------------------------------
  page.on('dialog', (dialog) => dialog.accept('E2E revocation test'));
  await credRow.getByRole('button', { name: 'Revocar' }).click();
  await expect(page.getByText(/Credencial revocada en Stellar/i)).toBeVisible({ timeout: 90000 });
  await expect(credRow.getByText(/Revocada/i)).toBeVisible({ timeout: 90000 });

  // ---------------------------------------------------------------------------
  // 5. Permission readback: public credential page reflects the revoked state.
  // ---------------------------------------------------------------------------
  expect(credentialCode).toMatch(/^CRED-/);
  await page.goto(`/credencial/${credentialCode}`);
  await expect(page.getByRole('heading', { name: /Credencial Revocada/i })).toBeVisible({ timeout: 10000 });
});
