// Gor pizza-powerupen spelklar: trimmar bort den genomskinliga kanten fran
// kallbilden i source-images/ och skalar ned den till en liten sprite som klienten
// hamtar via /assets/pizza.png.
//
//   node tools/prepare-pizza.mjs

import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';

const ROOT = 'C:/Viking-Vs-Cleo';
const SRC = path.join(ROOT, 'source-images/Pizza_powerup.png');
const OUT_DIR = path.join(ROOT, 'public/assets');
const OUT = path.join(OUT_DIR, 'pizza.png');

const SIZE = 256; // rikligt for spelstorleken (~46 varldspixlar), men litet pa disk

await fs.mkdir(OUT_DIR, { recursive: true });

await sharp(SRC)
  .ensureAlpha()
  .trim() // skalar bort den tomma ramen sa pizzan fyller rutan
  .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9 })
  .toFile(OUT);

const size = (await fs.stat(OUT)).size;
console.log(`pizza -> public/assets/pizza.png  ${SIZE}x${SIZE}  ${(size / 1024).toFixed(1)} kB`);
