// Gor powerup-bilderna spelklara: trimmar bort den genomskinliga kanten fran
// kallbilderna i source-images/ och skalar ned dem till sma sprites som klienten
// hamtar via /assets/<namn>.png.
//
//   node tools/prepare-powerups.mjs

import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public/assets');

const SIZE = 256; // rikligt for spelstorleken (~46 varldspixlar), men litet pa disk

const ITEMS = [
  { src: 'source-images/Pizza_powerup.png', out: 'pizza.png' },
  { src: 'source-images/Kebab_powerup.png', out: 'kebab.png' },
];

await fs.mkdir(OUT_DIR, { recursive: true });

for (const item of ITEMS) {
  const out = path.join(OUT_DIR, item.out);
  await sharp(path.join(ROOT, item.src))
    .ensureAlpha()
    .trim() // skalar bort den tomma ramen sa motivet fyller rutan
    .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(out);

  const size = (await fs.stat(out)).size;
  console.log(`${item.src} -> public/assets/${item.out}  ${SIZE}x${SIZE}  ${(size / 1024).toFixed(1)} kB`);
}
