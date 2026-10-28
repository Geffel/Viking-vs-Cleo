import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

for (const team of ['cleo', 'viking']) await validateRunAnimation(team);

async function validateRunAnimation(team) {
  const assetDir = path.resolve('public/assets', team);
  const manifest = JSON.parse(await fs.readFile(path.join(assetDir, 'manifest.json'), 'utf8'));
  const run = manifest.run;

  assert.ok(run && Array.isArray(run.files), `${team} ska ha en manifeststyrd springanimation`);
  assert.equal(run.files.length, 8, `${team}: springanimationen ska ha atta rutor`);
  assert.ok(run.worldWidth > 0 && run.worldHeight > 0, `${team}: springrutorna ska ha spelvarldsmatt`);
  assert.ok(
    run.anchorX > 0 && run.anchorX < 1 && run.anchorY === 1,
    `${team}: springrutorna ska ha ett giltigt markankare`,
  );

  const inspected = await Promise.all(run.files.map((file) => inspect(path.join(assetDir, file))));
  const [{ width, height }] = inspected;
  for (const [index, frame] of inspected.entries()) {
    assert.deepEqual(
      [frame.width, frame.height],
      [width, height],
      `${team}/${run.files[index]} ska ha samma yttermatt som resten av springcykeln`,
    );
    assert.equal(frame.bottom, height - 1, `${team}/${run.files[index]} ska sta pa den gemensamma marklinjen`);
  }

  const anchorPx = run.anchorX * width;
  const rootDrift = Math.max(...inspected.map((frame) => Math.abs(frame.rootX - anchorPx)));
  assert.ok(rootDrift <= 2, `${team}: springrutornas rotpunkt glider ${rootDrift.toFixed(2)} px (max 2 px)`);

  console.log(
    `${team}: ${run.files.length} springrutor, ${width}x${height}px, max rotglidning ${rootDrift.toFixed(2)}px`,
  );
}

async function inspect(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(y * info.width + x) * info.channels + 3];
  let x0 = info.width;
  let y0 = info.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (alphaAt(x, y) < 16) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }

  const figureHeight = y1 - y0 + 1;
  const xs = [];
  const bandTop = Math.round(y0 + figureHeight * 0.46);
  const bandBottom = Math.round(y0 + figureHeight * 0.68);
  for (let y = bandTop; y <= Math.min(y1, bandBottom); y++) {
    for (let x = x0; x <= x1; x++) {
      if (alphaAt(x, y) >= 128) xs.push(x);
    }
  }
  xs.sort((a, b) => a - b);

  return {
    width: info.width,
    height: info.height,
    bottom: y1,
    rootX: xs[Math.floor((xs.length - 1) * 0.65)],
  };
}
