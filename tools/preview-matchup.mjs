// Ogongranskning av sprite-setten at bada hallen: node tools/preview-matchup.mjs
//
// Ritar varje lags alla bildrutor at bada blickriktningarna med exakt samma
// rakning som Renderer.drawSprite i public/js/render.js. Ar manifestets facing
// eller nagon spegling fel syns det direkt: figuren tittar at fel hall, eller
// glider i sidled mellan rutorna i stallet for att sta stadigt.
//
// Speglingen i canvas gors runt fotpunkten cx. Rutan [cx - anchorX*dw, +dw]
// avbildas da pa [cx - (1-anchorX)*dw, cx + anchorX*dw] - det ar den formeln
// som anvands har, tillsammans med en flop av sjalva bilden.

import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PLAYER } from '../shared/constants.js';

// Utgar fran verktygets egen plats, sa vyn gar att bygga var projektet an ligger.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'public/assets');
const OUT = path.join(ASSETS, '_matchup-preview.png');

const TEAMS = ['cleo', 'viking'];
const Z = 3; // forstoring, sa pixlarna gar att se
const CELL_W = 120 * Z;
const CELL_H = 80 * Z;
const FEET_Y = 70 * Z; // marknivan i varje ruta
const PAD = 6 * Z;

const rect = (w, h, color) => ({
  create: { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)), channels: 4, background: color },
});

const rows = [];
for (const team of TEAMS) {
  const manifest = JSON.parse(await fs.readFile(path.join(ASSETS, team, 'manifest.json'), 'utf8'));
  // attack ar antingen en lista med rutor eller en uppslagning per melee-plats,
  // och en plats kan i sin tur ha egna matt for sina rutor. Alla rutor med i
  // vyn, var och en med de matt renderaren faktiskt ritar den med.
  const spec = manifest.attack;
  const slots = Array.isArray(spec) ? [spec] : Object.values(spec ?? {});
  const keys = [{ file: manifest.idle, meta: manifest }];
  for (const slot of slots) {
    const files = Array.isArray(slot) ? slot : slot.files;
    const meta = Array.isArray(slot) ? manifest : { ...manifest, ...slot };
    for (const file of files) keys.push({ file, meta });
  }
  for (const f of [1, -1]) rows.push({ team, manifest, keys, f });
}

const cols = Math.max(...rows.map((r) => r.keys.length));
const sheetW = PAD + cols * CELL_W + PAD;
const sheetH = PAD + rows.length * CELL_H + PAD;

const parts = [];
for (const [row, r] of rows.entries()) {
  const rowTop = PAD + row * CELL_H;

  for (const [col, { file, meta: m }] of r.keys.entries()) {
    // Samma villkor som drawSprite: grafiken vetter at ett hall, spegla nar
    // spelaren tittar at det andra.
    const flip = (m.facing === 'left') === (r.f > 0);
    const cellX = PAD + col * CELL_W;
    const cx = cellX + CELL_W / 2;
    const feetY = rowTop + FEET_Y;

    const dw = m.worldWidth * Z;
    const dh = m.worldHeight * Z;
    const top = feetY - m.anchorY * dh;
    const left = flip ? cx - (1 - m.anchorX) * dw : cx - m.anchorX * dw;

    let img = sharp(path.join(ASSETS, r.team, file)).resize(Math.round(dw), Math.round(dh), { fit: 'fill' });
    if (flip) img = img.flop();

    // Marklinje och traffyta, sa att fotterna och kroppen gar att jamfora
    parts.push({ input: rect(CELL_W - 4, 2, { r: 74, g: 58, b: 92, alpha: 1 }), left: Math.round(cellX + 2), top: Math.round(feetY) });
    const hw = PLAYER.w * Z;
    const hh = PLAYER.h * Z;
    for (const [bx, by, bw, bh] of [
      [cx - hw / 2, feetY - hh, hw, 1],
      [cx - hw / 2, feetY - hh, 1, hh],
      [cx + hw / 2, feetY - hh, 1, hh],
    ]) {
      parts.push({ input: rect(bw, bh, { r: 255, g: 90, b: 90, alpha: 1 }), left: Math.round(bx), top: Math.round(by) });
    }

    parts.push({ input: await img.png().toBuffer(), left: Math.round(left), top: Math.round(top) });
  }
}

await sharp({ create: { width: sheetW, height: sheetH, channels: 4, background: { r: 27, g: 16, b: 48, alpha: 1 } } })
  .composite(parts)
  .png()
  .toFile(OUT);

console.log(`rader (uppifran): ${rows.map((r) => `${r.team} f=${r.f}`).join(', ')}`);
console.log(`skrev public/assets/_matchup-preview.png  ${sheetW}x${sheetH}`);
