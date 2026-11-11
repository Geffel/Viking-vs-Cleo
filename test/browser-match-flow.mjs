import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { startTestServer } from './test-server.mjs';

const browserPath = process.env.VVC_BROWSER_PATH || [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find(existsSync);

assert(browserPath, 'Ingen Chromium-baserad browser hittades. Satt VVC_BROWSER_PATH till dess executable.');

function sessionCookie(rawCookie) {
  const [, value = ''] = rawCookie.split('=', 2);
  return decodeURIComponent(value);
}

async function waitForVisible(page, selector, message, timeout = 10_000) {
  await page.locator(selector).waitFor({ state: 'visible', timeout });
  assert.ok(await page.locator(selector).isVisible(), message);
}

let server;
let browser;
try {
  // The accelerated clock keeps the vote visible long enough to click while
  // reducing a full six-minute round to about eighteen seconds.
  server = await startTestServer({ timeScale: 20, authenticatedProfiles: ['Browser Cleo', 'Browser Viking'] });
  browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  const [cleoContext, vikingContext] = await Promise.all([
    browser.newContext({ viewport: { width: 1280, height: 720 } }),
    browser.newContext({ viewport: { width: 1280, height: 720 } }),
  ]);
  await Promise.all([
    cleoContext.addCookies([{ name: 'vvc_session', value: sessionCookie(server.authCookies[0]), url: server.origin }]),
    vikingContext.addCookies([{ name: 'vvc_session', value: sessionCookie(server.authCookies[1]), url: server.origin }]),
  ]);

  const [cleo, viking] = await Promise.all([cleoContext.newPage(), vikingContext.newPage()]);
  await Promise.all([
    cleo.goto(server.origin, { waitUntil: 'domcontentloaded', timeout: 10_000 }),
    viking.goto(server.origin, { waitUntil: 'domcontentloaded', timeout: 10_000 }),
  ]);
  await Promise.all([
    waitForVisible(cleo, '#create-match', 'Cleo ska se den globala lobbyn.'),
    waitForVisible(viking, '#create-match', 'Viking ska se den globala lobbyn.'),
  ]);

  await cleo.locator('#create-match').click();
  await waitForVisible(cleo, '#match-room', 'Varden ska komma till matchlobbyn.');
  await viking.locator('[data-join-match]').click();
  await waitForVisible(viking, '#match-room', 'Gasten ska kunna ansluta till matchlobbyn.');

  await Promise.all([
    cleo.locator('[data-character="cleo"]').click(),
    viking.locator('[data-character="viking"]').click(),
  ]);
  await cleo.locator('#start-match').waitFor({ state: 'visible' });
  await cleo.locator('#start-match').click();

  await Promise.all([
    waitForVisible(cleo, '#map-vote', 'Kartrostningen ska visas for varden.'),
    waitForVisible(viking, '#map-vote', 'Kartrostningen ska visas for gasten.'),
  ]);
  await Promise.all([
    cleo.locator('[data-map-id]').first().click(),
    viking.locator('[data-map-id]').first().click(),
  ]);

  await waitForVisible(cleo, '#round-results', 'Ett avslutat spel ska visa resultatvyn.', 30_000);
  assert.match(await cleo.locator('#round-result-title').textContent(), /round|draw|victorious/i);
  await cleo.locator('#reset-match').click();
  await waitForVisible(cleo, '#character-select', 'Ny runda ska atervanda till karaktarsvalet.');

  await Promise.all([cleoContext.close(), vikingContext.close()]);
  console.log('BROWSER MATCH FLOW TEST OK: lobby, match, map vote, result and new round render in Edge');
} finally {
  await browser?.close();
  await server?.stop();
}
