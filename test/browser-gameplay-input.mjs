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

let server;
let browser;
try {
  server = await startTestServer({ authenticatedProfiles: ['BrowserFighter'] });
  browser = await chromium.launch({ executablePath: browserPath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addCookies([{ name: 'vvc_session', value: sessionCookie(server.authCookies[0]), url: server.origin }]);
  const page = await context.newPage();
  await page.addInitScript(() => {
    const nativeSend = WebSocket.prototype.send;
    window.__browserTestSocketFrames = [];
    WebSocket.prototype.send = function patchedSend(payload) {
      window.__browserTestSocketFrames.push(String(payload));
      return nativeSend.call(this, payload);
    };
  });

  await page.goto(server.origin, { waitUntil: 'domcontentloaded', timeout: 10_000 });
  await page.locator('#training-mode').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('#training-mode').click();
  await page.locator('#match-room').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('[data-character="cleo"]').click();
  // Training starts map selection immediately when a fighter is chosen.
  await page.locator('#map-vote').waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('[data-map-id]').first().click();
  await page.locator('#hud').waitFor({ state: 'visible', timeout: 10_000 });
  // The game view is entered through a short transition before input activates.
  await page.waitForTimeout(1_500);

  // A physical key must leave the browser and become an authoritative move.
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(120);
  await page.keyboard.up('ArrowRight');
  await page.waitForFunction(() => window.__browserTestSocketFrames.some((raw) => {
    const message = JSON.parse(raw);
    return message.t === 'move' && message.r === true;
  }));

  // Ability input is verified both at the socket boundary and in the live HUD.
  await page.keyboard.press('Digit1');
  await page.waitForFunction(() => window.__browserTestSocketFrames.some((raw) => {
    const message = JSON.parse(raw);
    return message.t === 'act' && message.a === 'a1';
  }));
  await page.locator('.ability[data-slot="a1"].cooling').waitFor({ state: 'visible', timeout: 5_000 });

  await context.close();
  console.log('BROWSER GAMEPLAY INPUT TEST OK: keyboard movement and ability reach server and update HUD');
} finally {
  await browser?.close();
  await server?.stop();
}
