import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { startTestServer } from './test-server.mjs';

const browserPath = process.env.VVC_BROWSER_PATH || [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find(existsSync);
assert(browserPath, 'No Chromium browser found');

let server;
let browser;
try {
  const names = Array.from({ length: 32 }, (_, index) => `AdminPlayer ${String(index + 1).padStart(2, '0')}`);
  server = await startTestServer({
    authenticatedProfiles: names, legacyProfiles: ['Legacy Wait'],
    env: { VVC_BOOTSTRAP_ADMIN: names[0] },
  });
  browser = await chromium.launch({ executablePath: browserPath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const token = decodeURIComponent(server.authCookies[0].split('=', 2)[1]);
  await context.addCookies([{ name: 'vvc_session', value: token, url: server.origin }]);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${server.origin}/admin`);
  await page.locator('#users tr').first().waitFor();
  assert.equal(await page.locator('#users tr').count(), 25, 'first page is limited to 25 players');
  assert.match(await page.locator('#page-label').textContent(), /Sida 1 av 2/);

  await page.locator('#search').fill('Player 30');
  await page.waitForTimeout(350);
  assert.equal(await page.locator('#users tr').count(), 1, 'search filters the server-side player list');
  await page.locator('#users tr').click();
  await page.locator('#player-drawer[aria-hidden="false"]').waitFor();
  assert.match(await page.locator('#drawer-title').textContent(), /Player 30/);
  await page.getByRole('button', { name: 'Statistik', exact: true }).click();
  await page.locator('.stat-group').first().waitFor();
  await page.getByRole('button', { name: 'Konto', exact: true }).click();
  await page.locator('.role-picker').waitFor();

  await page.locator('#close-drawer').click();
  await page.locator('#search').fill('');
  await page.locator('#migration-filter').selectOption('pending');
  await page.locator('#users tr').first().waitFor();
  assert.equal(await page.locator('#users tr').count(), 1, 'pending legacy profiles have their own filter');
  assert.match(await page.locator('#users tr').textContent(), /Väntar på migrering/);
  await page.locator('#users tr').click();
  await page.getByRole('button', { name: 'Konto', exact: true }).click();
  assert.match(await page.locator('#drawer-content').textContent(), /ännu inget konto/);
  assert.equal(await page.locator('[data-password]').count(), 0, 'an unclaimed legacy profile has no account actions');
  assert.deepEqual(pageErrors, [], `admin UI has browser errors: ${pageErrors.join(', ')}`);

  if (process.env.VVC_ADMIN_SCREENSHOT) await page.screenshot({ path: process.env.VVC_ADMIN_SCREENSHOT, fullPage: true });
  console.log('ADMIN UI BROWSER TEST OK: pagination, search, drawer and tabs render without browser errors');
} finally {
  await browser?.close();
  await server?.stop();
}
