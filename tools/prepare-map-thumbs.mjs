// Bygger sma forhandsbilder av arenorna till kartrostningen.
//
// Utan dem visar lobbyn arenabilderna i full storlek: sex kartor a ~2,5 MB som
// alla laddas samtidigt, for att ritas i en ruta pa nagra hundra pixlar. Samma
// bild i 480x270 vager en brakdel.
//
//   node tools/prepare-map-thumbs.mjs

import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAPS } from '../shared/constants.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');
const outDir = join(publicDir, 'assets', 'thumbs');

const WIDTH = 480;
const HEIGHT = 270;

await mkdir(outDir, { recursive: true });

let built = 0;
for (const map of MAPS) {
  if (!map.asset) {
    console.log(`hoppar over ${map.id} - ingen arenabild`);
    continue;
  }

  const src = join(publicDir, map.asset.replace(/^\//, ''));
  const out = join(outDir, `${map.id}.jpg`);
  const info = await sharp(src)
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(out);

  console.log(`${map.id.padEnd(14)} ${WIDTH}x${HEIGHT}  ${(info.size / 1024).toFixed(0)} kB`);
  built++;
}

console.log(`\n${built} forhandsbilder i public/assets/thumbs/`);
