import { test, expect } from '@playwright/test';

test('loads public home page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/CulturaGO/);
});

test('health endpoint is ok', async ({ request }) => {
  const resp = await request.get('/api/health');
  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  expect(body.status).toBe('ok');
  expect(body.checks.database).toBe('ok');
});

test('public event page no longer returns 500 for unknown event', async ({ page }) => {
  await page.goto('/evento/fdvc-2026');
  await expect(page.getByText('Evento no encontrado')).toBeVisible();
});
