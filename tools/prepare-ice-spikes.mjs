import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const inputDir = path.join(root, 'source-images');
const outputDir = path.join(root, 'public', 'assets', 'viking', 'ice_spikes');
const files = (await fs.readdir(inputDir)).filter((file) => /^viking_ice_spike_\d+\.png$/i.test(file)).sort();

if (files.length !== 8) throw new Error(`Expected 8 ice spike images, got ${files.length}`);
await fs.mkdir(outputDir, { recursive: true });

for (let i = 0; i < files.length; i++) {
  await sharp(path.join(inputDir, files[i]))
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize({ height: 384, withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true, quality: 92 })
    .toFile(path.join(outputDir, `ice_spike_${i + 1}.png`));
}

console.log(`Prepared ${files.length} optimized ice spike images in ${path.relative(root, outputDir)}.`);
