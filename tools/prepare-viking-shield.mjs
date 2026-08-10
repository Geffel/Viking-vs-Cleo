// Gor spelklara rutor av Vikingens skoldsmall (melee-plats m2):
//   node tools/prepare-viking-shield.mjs
//
// Kallbilderna skiljer sig fran ovriga sprites pa tva satt, sa de kan inte koras
// genom prepare-sprites.mjs:
//   1. de saknar alfakanal - figuren star mot en gra bakgrund som maste bort
//   2. figuren ar ritad mindre an i de andra rutorna
// Verktyget tar bort bakgrunden, skalar varje ruta sa hjalmen blir lika bred som
// i viloposen, lagger bada rutorna pa en gemensam duk med fotpunkten pa samma
// stalle och skriver in matten i manifest.json.

import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT = path.join(ROOT, 'source-images');
const OUT_DIR = path.join(ROOT, 'public/assets/viking');

const ALPHA_MIN = 16; // lagre an sa raknas som bakgrund
const FEET_BAND = 0.12; // nedersta 12 % av figuren = fotterna
const HORN_BAND = 0.16; // oversta 16 % av figuren = hjalmen med hornen
// Samma tva tal som prepare-sprites.mjs ritade de ovriga rutorna med. Andras de
// dar maste de andras har, annars byter Vikingen storlek mitt i slaget.
const IDLE_WORLD_H = 56;
const SUPERSAMPLE = 3;

// Bakgrunden ar en jamn gra toning. Flood fill fran ramen: SEED_TOL avgor hur
// langt fran ramens farger en pixel far ligga for att raknas som bakgrund,
// NEIGHBOR_TOL hur stort steg fyllningen far ta. MAX_CHROMA ar det som skyddar
// figuren: hennes gula pals ligger nara bakgrundsgratt i ren avstandsrakning
// men ar kraftigt fargmattad, och bakgrunden ar det aldrig.
const SEED_TOL = 60;
const NEIGHBOR_TOL = 16;
const MAX_CHROMA = 26; // storsta skillnad mellan hogsta och lagsta kanal i bakgrunden

// Hjalmens bredd fran hornspets till hornspets i viloposen. Skoldrutorna skalas
// var for sig till samma bredd, sa huvudet inte andrar storlek under slaget.
const REFERENCE = 'viking_standard_pose.png';

// Hjalmen ar ritad lite grovre i skoldrutorna an i de ovriga, sa en ren
// hjalmnormalisering gor figuren for stor: han blir lika hog i utfallet som han
// ar staende. 0.9 ar en ogonmatt-kompensation - ratt losning ar att generera om
// rutorna i samma stil och storlek som ruta 1 och 2 av yxsvingen.
const FIT_TWEAK = 0.9;

const FRAMES = [
  { key: 'shield1', file: 'viking_melee_shield_frame_1.png' },
  { key: 'shield2', file: 'viking_melee_shield_frame_2.png' },
];

async function readRaw(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, info };
}

const alphaAt = (data, info, x, y) => data[(y * info.width + x) * info.channels + 3];

function boundingBox(data, info) {
  const { width: w, height: h } = info;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alphaAt(data, info, x, y) < ALPHA_MIN) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error('bilden ar helt genomskinlig');
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Fotpunkt: mittpunkten av de opaka pixlarna i figurens nedersta band. */
function feetAnchor(data, info, box) {
  const bandTop = Math.max(box.y0, Math.round(box.y1 - box.h * FEET_BAND));
  let sum = 0;
  let count = 0;
  for (let y = bandTop; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      if (alphaAt(data, info, x, y) < ALPHA_MIN) continue;
      sum += x;
      count++;
    }
  }
  return { x: count ? sum / count : (box.x0 + box.x1) / 2, y: box.y1 };
}

/** Bredaste raden i ovre bandet, dvs hjalmen matt fran hornspets till hornspets. */
function hornSpan(data, info, box) {
  const yEnd = box.y0 + Math.round(box.h * HORN_BAND);
  let best = 0;
  for (let y = box.y0; y <= yEnd; y++) {
    let lo = -1;
    let hi = -1;
    for (let x = box.x0; x <= box.x1; x++) {
      if (alphaAt(data, info, x, y) < ALPHA_MIN) continue;
      if (lo < 0) lo = x;
      hi = x;
    }
    if (lo >= 0 && hi - lo + 1 > best) best = hi - lo + 1;
  }
  return best;
}

/** Gor bakgrunden genomskinlig med flood fill inat fran bildens ram. */
function stripBackground(data, info) {
  const { width: w, height: h, channels: ch } = info;
  const out = Buffer.from(data);
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    const i = y * w + x;
    if (seen[i]) return;
    seen[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  const seeds = stack.map((i) => [data[i * ch], data[i * ch + 1], data[i * ch + 2]]);

  let cleared = 0;
  while (stack.length) {
    const i = stack.pop();
    const r = data[i * ch];
    const g = data[i * ch + 1];
    const b = data[i * ch + 2];
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (chroma > MAX_CHROMA) continue;
    const isBackground = seeds.some(
      ([sr, sg, sb]) => Math.abs(r - sr) <= SEED_TOL && Math.abs(g - sg) <= SEED_TOL && Math.abs(b - sb) <= SEED_TOL,
    );
    if (!isBackground) continue;

    out[i * ch + 3] = 0;
    cleared++;

    const x = i % w;
    const y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (seen[ni]) continue;
      const dr = Math.abs(data[ni * ch] - r);
      const dg = Math.abs(data[ni * ch + 1] - g);
      const db = Math.abs(data[ni * ch + 2] - b);
      if (dr <= NEIGHBOR_TOL && dg <= NEIGHBOR_TOL && db <= NEIGHBOR_TOL) {
        seen[ni] = 1;
        stack.push(ni);
      }
    }
  }
  return { data: out, cleared };
}

// --------------------------------------------------------------- referensmatt

const reference = await readRaw(path.join(SOURCE_ROOT, REFERENCE));
const refBox = boundingBox(reference.data, reference.info);
const refHorn = hornSpan(reference.data, reference.info, refBox);

// Kallpixlar -> utskriftspixlar: viloposen ar IDLE_WORLD_H varldspixlar hog och
// skrivs ut i SUPERSAMPLE gangers storlek. Exakt samma rakning som i
// prepare-sprites.mjs, sa de nya rutorna hamnar i samma skala som de gamla.
const printPerSource = (IDLE_WORLD_H / refBox.h) * SUPERSAMPLE;

const manifestPath = path.join(OUT_DIR, 'manifest.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const idleMeta = await sharp(path.join(OUT_DIR, manifest.idle)).metadata();

console.log(`referens ${REFERENCE}: hojd ${refBox.h} px, hjalm ${refHorn} px  ->  ${printPerSource.toFixed(4)} utskriftspixlar per kallpixel`);

// ------------------------------------------------------------------- rutorna

const prepared = [];
for (const frame of FRAMES) {
  const src = await readRaw(path.join(SOURCE_ROOT, frame.file));
  const { data, cleared } = stripBackground(src.data, src.info);
  const box = boundingBox(data, src.info);
  const anchor = feetAnchor(data, src.info, box);
  const horn = hornSpan(data, src.info, box);

  // Ritad i fel storlek: normalisera pa hjalmbredden, inte pa figurens hojd -
  // poserna ar olika djupa och hojden ar darfor inget mattstock.
  const fit = (refHorn / horn) * FIT_TWEAK;
  const scale = printPerSource * fit;
  const w = Math.max(1, Math.round(box.w * scale));
  const h = Math.max(1, Math.round(box.h * scale));

  const png = await sharp(data, {
    raw: { width: src.info.width, height: src.info.height, channels: src.info.channels },
  })
    .extract({ left: box.x0, top: box.y0, width: box.w, height: box.h })
    .resize(w, h, { kernel: 'lanczos3', fit: 'fill' })
    .png()
    .toBuffer();

  prepared.push({
    ...frame,
    png,
    w,
    h,
    left: (anchor.x - box.x0) * scale, // fotpunktens avstand till rutans vanstra kant
    top: (anchor.y - box.y0) * scale,
    box,
    horn,
    fit,
    cleared,
  });

  console.log(
    `${frame.key.padEnd(8)} kalla ${box.w}x${box.h} @ (${box.x0},${box.y0})  hjalm ${horn} px` +
      `  [skala ${fit.toFixed(3)}]  bakgrund ${(cleared / (src.info.width * src.info.height) * 100).toFixed(1)} %` +
      `  -> ${w}x${h} px`,
  );
}

// Gemensam duk for slaget: bada rutorna far fotpunkten pa samma stalle, och
// duken blir precis sa stor att skolden far plats nar den skjuts fram.
const maxLeft = Math.ceil(Math.max(...prepared.map((p) => p.left)));
const maxTop = Math.ceil(Math.max(...prepared.map((p) => p.top)));
const offX = prepared.map((p) => Math.round(maxLeft - p.left));
const offY = prepared.map((p) => Math.round(maxTop - p.top));
const canvasW = Math.max(...prepared.map((p, i) => offX[i] + p.w));
const canvasH = Math.max(...prepared.map((p, i) => offY[i] + p.h));

for (const [i, p] of prepared.entries()) {
  await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: p.png, left: offX[i], top: offY[i] }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT_DIR, `${p.key}.png`));
  const size = (await fs.stat(path.join(OUT_DIR, `${p.key}.png`))).size;
  console.log(`skrev ${p.key}.png  ${canvasW}x${canvasH}  ${(size / 1024).toFixed(1)} kB`);
}

const meta = {
  files: prepared.map((p) => `${p.key}.png`),
  worldWidth: +(canvasW / SUPERSAMPLE).toFixed(2),
  worldHeight: +(canvasH / SUPERSAMPLE).toFixed(2),
  anchorX: +(maxLeft / canvasW).toFixed(4),
  anchorY: +(maxTop / canvasH).toFixed(4),
  facing: 'left',
};

// attack ar antingen en lista (bara ett slag) eller en uppslagning per
// melee-plats. Skoldsmallen ar plats m2; yxan ligger kvar som default.
if (Array.isArray(manifest.attack)) manifest.attack = { default: manifest.attack };
manifest.attack.m2 = meta;
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('\nmanifest.attack.m2:', JSON.stringify(meta));

// Kontaktkarta: viloposen bredvid slagets rutor, alla med fotlinje och
// mittlinje. Star figurerna lika hoga pa den roda linjen ar skalan ratt.
const PAD = 10;
const cells = [
  { file: path.join(OUT_DIR, manifest.idle), w: idleMeta.width, h: idleMeta.height, ax: manifest.anchorX, ay: manifest.anchorY },
  ...prepared.map((p) => ({ file: path.join(OUT_DIR, `${p.key}.png`), w: canvasW, h: canvasH, ax: meta.anchorX, ay: meta.anchorY })),
];
const sheetH = Math.max(...cells.map((c) => c.h)) + PAD * 2;
const footY = PAD + Math.round(Math.max(...cells.map((c) => c.ay * c.h)));
const parts = [];
let x = PAD;
for (const c of cells) {
  const top = footY - Math.round(c.ay * c.h);
  parts.push({ input: c.file, left: x, top });
  parts.push({
    input: { create: { width: c.w, height: 1, channels: 4, background: { r: 255, g: 60, b: 60, alpha: 1 } } },
    left: x,
    top: footY,
  });
  parts.push({
    input: { create: { width: 1, height: c.h, channels: 4, background: { r: 60, g: 200, b: 255, alpha: 1 } } },
    left: x + Math.round(c.ax * c.w),
    top,
  });
  x += c.w + PAD;
}

await sharp({ create: { width: x, height: sheetH, channels: 4, background: { r: 24, g: 22, b: 38, alpha: 1 } } })
  .composite(parts)
  .png()
  .toFile(path.join(OUT_DIR, '_preview_shield.png'));

console.log('kontaktkarta: public/assets/viking/_preview_shield.png (rod linje = fotter, bla = mittlinje)');
