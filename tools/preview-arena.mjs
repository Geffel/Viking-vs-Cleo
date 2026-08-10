// Writes a map tuning preview with the arena image, platform hit surfaces and
// pizza spawn points overlaid in the same 1600x900 world space the game uses.
//
//   node tools/preview-arena.mjs
//   $env:MAP_ID='fjord'; node tools/preview-arena.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { MAPS, POWERUP, WORLD, mapLayoutFor } from '../shared/constants.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MAP_ID = process.env.MAP_ID || 'deep_forest';
const map = MAPS.find((item) => item.id === MAP_ID) ?? MAPS[0];
const imageMap = map.asset ? map : MAPS.find((item) => item.asset);
const layout = mapLayoutFor(map.id);
const ARENA = path.join(ROOT, imageMap.asset.replace(/^\//, 'public/'));
const OUT = path.join(ROOT, `public/assets/_${map.id}-platform-preview.png`);

const platformColor = 'rgba(77,195,255,0.70)';
const platformFill = 'rgba(77,195,255,0.20)';
const groundColor = 'rgba(255,209,102,0.85)';
const spawnColor = 'rgba(123,241,168,0.95)';

await fs.access(ARENA);

let svg = `<svg width="${WORLD.w}" height="${WORLD.h}" viewBox="0 0 ${WORLD.w} ${WORLD.h}" xmlns="http://www.w3.org/2000/svg">
  <style>
    text { font: 18px Arial, sans-serif; fill: white; paint-order: stroke; stroke: rgba(0,0,0,.9); stroke-width: 4px; }
    .grid { stroke: rgba(255,255,255,.22); stroke-width: 1; }
    .platform { fill: ${platformFill}; stroke: ${platformColor}; stroke-width: 4; }
    .ground { fill: rgba(255,209,102,.16); stroke: ${groundColor}; stroke-width: 4; }
    .pizza { fill: none; stroke: ${spawnColor}; stroke-width: 4; }
    .pizzaLine { stroke: ${spawnColor}; stroke-width: 3; }
  </style>`;

for (let x = 0; x <= WORLD.w; x += 100) {
  svg += `<line class="grid" x1="${x}" y1="0" x2="${x}" y2="${WORLD.h}"/><text x="${x + 4}" y="22">${x}</text>`;
}
for (let y = 0; y <= WORLD.h; y += 100) {
  svg += `<line class="grid" x1="0" y1="${y}" x2="${WORLD.w}" y2="${y}"/><text x="4" y="${y + 20}">${y}</text>`;
}

for (const [i, pl] of layout.platforms.entries()) {
  const cls = pl.ground ? 'ground' : 'platform';
  svg += `<rect class="${cls}" x="${pl.x}" y="${pl.y}" width="${pl.w}" height="${pl.h}" rx="${pl.ground ? 0 : 4}"/>`;
  svg += `<text x="${pl.x + 6}" y="${pl.y - 8}">${i}</text>`;
}

for (const [i, pt] of layout.powerupSpawns.entries()) {
  svg += `<line class="pizzaLine" x1="${pt.x}" y1="${pt.y}" x2="${pt.x}" y2="${pt.y + POWERUP.hover}"/>`;
  svg += `<circle class="pizza" cx="${pt.x}" cy="${pt.y}" r="${POWERUP.w / 2}"/>`;
  svg += `<text x="${pt.x + 18}" y="${pt.y - 12}">P${i}</text>`;
}

svg += '</svg>';

await sharp(ARENA)
  .resize(WORLD.w, WORLD.h, { fit: 'fill' })
  .composite([{ input: Buffer.from(svg) }])
  .png()
  .toFile(OUT);

console.log(`wrote ${path.relative(ROOT, OUT).replaceAll('\\', '/')}`);
