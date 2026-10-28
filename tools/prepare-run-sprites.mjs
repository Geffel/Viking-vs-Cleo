// Bygger en springanimation av atta kallbilder i source-images/:
//   node tools/prepare-run-sprites.mjs cleo
//   node tools/prepare-run-sprites.mjs viking
//
// Rutorna har olika yttermatt och figuren ligger pa olika hojd i dem. Vi kan
// darfor inte rita kallbilderna direkt: marknivan skulle hoppa och kroppen
// glida i sidled. Verktyget beskär alfakonturen, linjerar nederkanten och
// använder kroppens mittparti som stabil rotpunkt. Resultatet skrivs i samma
// 3x-upplosning som de ovriga spelarspritarna.

import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = path.join(ROOT, 'source-images');
const TEAM = process.argv[2] || 'cleo';
const CONFIG = {
  cleo: { facing: 'right' },
  viking: { facing: 'right' },
}[TEAM];
if (!CONFIG) throw new Error(`Okant lag: ${TEAM}. Valj cleo eller viking.`);

const OUT_DIR = path.join(ROOT, 'public', 'assets', TEAM);
const MANIFEST_PATH = path.join(OUT_DIR, 'manifest.json');

const FRAME_COUNT = 8;
const ALPHA_MIN = 16;
const ROOT_BAND = { from: 0.46, to: 0.68 };
// Kappan fyller vanstra halvan av mittbandet. Medianen skulle darfor lagga
// ankaret bakom kroppen; 65:e percentilen traffar hoft/balte genom hela cykeln.
const ROOT_QUANTILE = 0.65;
const FIGURE_WORLD_HEIGHT = 56;
const SUPERSAMPLE = 3;

function sourceName(index) {
  return `${TEAM}_run_${String(index).padStart(2, '0')}.png`;
}

function outputName(index) {
  return `run${index}.png`;
}

async function inspectFrame(index) {
  const file = sourceName(index);
  const sourcePath = path.join(SOURCE_DIR, file);
  const { data, info } = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(y * info.width + x) * info.channels + 3];

  let x0 = info.width;
  let y0 = info.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (alphaAt(x, y) < ALPHA_MIN) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) throw new Error(`${file}: bilden ar helt genomskinlig`);

  const figureHeight = y1 - y0 + 1;
  const bandTop = Math.round(y0 + figureHeight * ROOT_BAND.from);
  const bandBottom = Math.round(y0 + figureHeight * ROOT_BAND.to);
  const bandPixelsX = [];
  for (let y = bandTop; y <= Math.min(y1, bandBottom); y++) {
    for (let x = x0; x <= x1; x++) {
      const alpha = alphaAt(x, y);
      if (alpha >= 128) bandPixelsX.push(x);
    }
  }
  bandPixelsX.sort((a, b) => a - b);
  const rootIndex = Math.floor((bandPixelsX.length - 1) * ROOT_QUANTILE);

  return {
    index,
    file,
    sourcePath,
    box: { x0, y0, x1, y1, width: x1 - x0 + 1, height: figureHeight },
    rootX: bandPixelsX.length ? bandPixelsX[rootIndex] : (x0 + x1) / 2,
  };
}

const frames = await Promise.all(Array.from({ length: FRAME_COUNT }, (_, i) => inspectFrame(i + 1)));

// Alla rotpunkter hamnar pa samma x och alla nederkanter pa samma marklinje.
const leftReach = Math.ceil(Math.max(...frames.map((frame) => frame.rootX - frame.box.x0)));
const rightReach = Math.ceil(Math.max(...frames.map((frame) => frame.box.x1 - frame.rootX + 1)));
const canvasWidth = leftReach + rightReach;
const canvasHeight = Math.max(...frames.map((frame) => frame.box.height));
const outputHeight = Math.round(FIGURE_WORLD_HEIGHT * SUPERSAMPLE);
const outputWidth = Math.round((canvasWidth / canvasHeight) * outputHeight);
const worldWidth = +(canvasWidth / canvasHeight * FIGURE_WORLD_HEIGHT).toFixed(2);
const anchorX = +(leftReach / canvasWidth).toFixed(4);

await fs.mkdir(OUT_DIR, { recursive: true });

for (const frame of frames) {
  const cropped = await sharp(frame.sourcePath)
    .ensureAlpha()
    .extract({ left: frame.box.x0, top: frame.box.y0, width: frame.box.width, height: frame.box.height })
    .png()
    .toBuffer();
  const left = Math.round(leftReach - (frame.rootX - frame.box.x0));
  const top = canvasHeight - frame.box.height;
  const placed = await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: cropped, left, top }])
    .png()
    .toBuffer();

  await sharp(placed)
    .resize(outputWidth, outputHeight, { fit: 'fill', kernel: 'nearest' })
    .png({ compressionLevel: 9, palette: true })
    .toFile(path.join(OUT_DIR, outputName(frame.index)));

  console.log(
    `${frame.file}: figur ${frame.box.width}x${frame.box.height}, ` +
      `mark y=${frame.box.y1}, rot x=${frame.rootX.toFixed(1)}, placering (${left},${top})`,
  );
}

const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
manifest.run = {
  files: frames.map((frame) => outputName(frame.index)),
  worldWidth,
  worldHeight: FIGURE_WORLD_HEIGHT,
  anchorX,
  anchorY: 1,
  facing: CONFIG.facing,
};
await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

await writePreview();

console.log(
  `\nSpringanimation: ${outputWidth}x${outputHeight}px per ruta, ` +
    `${worldWidth}x${FIGURE_WORLD_HEIGHT} varldspixlar, ankare (${anchorX}, 1)`,
);
console.log(`Forhandsvy: public/assets/${TEAM}/_preview_run.png`);

async function writePreview() {
  const pad = 10;
  const labelHeight = 18;
  const cellWidth = outputWidth + pad;
  const sheetWidth = pad + cellWidth * frames.length;
  const sheetHeight = pad * 2 + outputHeight + labelHeight;
  const footY = pad + outputHeight - 1;
  const anchorPx = Math.round(anchorX * outputWidth);
  const parts = [];

  for (const frame of frames) {
    const left = pad + (frame.index - 1) * cellWidth;
    parts.push({ input: path.join(OUT_DIR, outputName(frame.index)), left, top: pad });
    parts.push({
      input: { create: { width: outputWidth, height: 1, channels: 4, background: { r: 255, g: 70, b: 70, alpha: 1 } } },
      left,
      top: footY,
    });
    parts.push({
      input: { create: { width: 1, height: outputHeight, channels: 4, background: { r: 70, g: 205, b: 255, alpha: 0.82 } } },
      left: left + anchorPx,
      top: pad,
    });
  }

  await sharp({
    create: { width: sheetWidth, height: sheetHeight, channels: 4, background: { r: 24, g: 22, b: 38, alpha: 1 } },
  })
    .composite(parts)
    .png()
    .toFile(path.join(OUT_DIR, '_preview_run.png'));
}
