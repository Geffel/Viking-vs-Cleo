// Gor spelklara sprites av kallbilderna i source-images/:
//   node tools/prepare-sprites.mjs           - alla lag
//   node tools/prepare-sprites.mjs cleo      - bara ett lag
//
// Kallbilderna ar 1024x1024 med figuren pa olika stallen i rutan. Ritar man dem
// rakt av hoppar figuren omkring mellan bildrutorna. Verktyget:
//   1. hittar figurens verkliga yta via alfakanalen
//   2. rakar ut fotpunkten (mitten av fotterna, underkant) i varje ruta
//   3. lagger alla rutor pa en gemensam duk med fotpunkten pa samma stalle
//   4. speglar de rutor som vetter at fel hall
//   5. skalar ned och skriver en manifest.json som klienten laser

import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';
import { PLAYER } from '../shared/constants.js';

const ROOT = 'C:/Viking-Vs-Cleo';
const SOURCE_ROOT = path.join(ROOT, 'source-images');
const OUT_ROOT = path.join(ROOT, 'public/assets');

const ALPHA_MIN = 16; // lagre an sa raknas som bakgrund
const FEET_BAND = 0.12; // nedersta 12 % av figuren = fotterna
// Hur hog viloposen ar i spelvarldens pixlar. Traffytan ar 44 hog, sa hogre
// varden lagger mer av huvudet utanfor det man faktiskt kan traffa. Samma siffra
// for alla lag, sa att figurerna blir lika stora bredvid varandra.
const IDLE_WORLD_H = 56;
const SUPERSAMPLE = 3; // skriv ut 3x for skarpa pa stora skarmar

// facing: at vilket hall setet vetter nar alla speglingar ar gjorda. Klienten
//         speglar runt fotpunkten nar spelaren vander at andra hallet.
// mirror: kallbilden vetter at fel hall och maste speglas for att matcha de ovriga.
// scale:  kallbildens figur ar ritad i fel storlek och behover kompenseras.
const CHARACTERS = {
  viking: {
    facing: 'left',
    // attack3 ar ritad i en annan stil och tydligt mindre an ovriga rutor. 1.22 ar
    // en ogonmatt-kompensation sa animationen inte hackar - ratt losning ar att
    // generera om rutan i samma stil, storlek och riktning som ruta 1 och 2.
    sources: [
      { key: 'idle', file: 'viking_standard_pose.png', mirror: false, scale: 1 },
      { key: 'attack1', file: 'viking_melee_attack_frame_1.png', mirror: false, scale: 1 },
      { key: 'attack2', file: 'viking_melee_attack_frame_2.png', mirror: false, scale: 1 },
      { key: 'attack3', file: 'viking_melee_attack_frame_3.png', mirror: true, scale: 1.22 },
    ],
  },
  cleo: {
    // Sparken gar at hoger i ruta 1, sa hela setet raknas som hogervant och
    // ruta 2 och 3 speglas dit. Viloposen ar rakt framifran och ser likadan ut
    // at bada hallen.
    facing: 'right',
    sources: [
      { key: 'idle', file: 'cleo_standard_pose.png', mirror: false, scale: 1 },
      { key: 'attack1', file: 'cleo_melee_attack_frame_1.png', mirror: false, scale: 1 },
      { key: 'attack2', file: 'cleo_melee_attack_frame_2.png', mirror: true, scale: 1 },
      { key: 'attack3', file: 'cleo_melee_attack_frame_3.png', mirror: true, scale: 1 },
    ],
  },
};

async function load(src) {
  let img = sharp(path.join(SOURCE_ROOT, src.file)).ensureAlpha();
  if (src.mirror) img = img.flop();

  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;
  const alphaAt = (x, y) => data[(y * w + x) * ch + 3];

  // Figurens ytterkanter
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alphaAt(x, y) < ALPHA_MIN) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error(`${src.file}: bilden ar helt genomskinlig`);

  // Fotpunkt: mittpunkten av de opaka pixlarna i nedersta bandet
  const bandTop = Math.max(y0, Math.round(y1 - (y1 - y0) * FEET_BAND));
  let sum = 0;
  let count = 0;
  for (let y = bandTop; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (alphaAt(x, y) < ALPHA_MIN) continue;
      sum += x;
      count++;
    }
  }

  return {
    ...src,
    buffer: data,
    info,
    box: { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 },
    anchor: { x: count ? sum / count : (x0 + x1) / 2, y: y1 },
  };
}

async function build(team, config) {
  const outDir = path.join(OUT_ROOT, team);
  console.log(`\n=== ${team} ===`);

  const frames = [];
  for (const src of config.sources) frames.push(await load(src));

  // Beskar till figurens yta och kompenserar for rutor ritade i fel storlek.
  // Fotpunktens avstand till kanterna skalas med, sa den foljer med.
  const prepared = [];
  for (const f of frames) {
    const s = f.scale ?? 1;
    const w = Math.max(1, Math.round(f.box.w * s));
    const h = Math.max(1, Math.round(f.box.h * s));

    let img = sharp(f.buffer, { raw: { width: f.info.width, height: f.info.height, channels: f.info.channels } })
      .extract({ left: f.box.x0, top: f.box.y0, width: f.box.w, height: f.box.h });
    if (s !== 1) img = img.resize(w, h, { kernel: 'lanczos3', fit: 'fill' });

    prepared.push({
      key: f.key,
      mirror: f.mirror,
      scale: s,
      box: f.box,
      anchor: f.anchor,
      png: await img.png().toBuffer(),
      w,
      h,
      left: (f.anchor.x - f.box.x0) * s,
      top: (f.anchor.y - f.box.y0) * s,
    });
  }

  // Gemensam duk: figurens raddvidd fran fotpunkten at varje hall
  const maxLeft = Math.ceil(Math.max(...prepared.map((p) => p.left)));
  const maxTop = Math.ceil(Math.max(...prepared.map((p) => p.top)));

  // Placera varje ruta sa att fotpunkterna hamnar pa (maxLeft, maxTop), och lat
  // duken bli precis sa stor att den bredaste rutan far plats.
  const offX = prepared.map((p) => Math.round(maxLeft - p.left));
  const offY = prepared.map((p) => Math.round(maxTop - p.top));
  const canvasW = Math.max(...prepared.map((p, i) => offX[i] + p.w));
  const canvasH = Math.max(...prepared.map((p, i) => offY[i] + p.h));

  // Skala: viloposens hojd bestammer hur stor figuren blir i spelet
  const idle = prepared.find((p) => p.key === 'idle');
  const worldScale = IDLE_WORLD_H / idle.h;
  const outW = Math.round(canvasW * worldScale * SUPERSAMPLE);
  const outH = Math.round(canvasH * worldScale * SUPERSAMPLE);

  console.log(`gemensam duk ${canvasW}x${canvasH}px  ->  ${outW}x${outH}px utskrift`);
  console.log(`spelstorlek ${(canvasW * worldScale).toFixed(1)}x${(canvasH * worldScale).toFixed(1)} varldspixlar\n`);

  await fs.mkdir(outDir, { recursive: true });

  for (const [i, p] of prepared.entries()) {
    // Sharp kor alltid resize fore composite i samma pipeline, sa placeringen
    // maste bli klar i ett eget steg innan nedskalningen.
    const placed = await sharp({
      create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: p.png, left: offX[i], top: offY[i] }])
      .png()
      .toBuffer();

    await sharp(placed)
      .resize(outW, outH, { kernel: 'lanczos3', fit: 'fill' })
      .png({ compressionLevel: 9 })
      .toFile(path.join(outDir, `${p.key}.png`));

    const size = (await fs.stat(path.join(outDir, `${p.key}.png`))).size;
    const flags = [p.mirror ? 'speglad' : null, p.scale !== 1 ? `skala ${p.scale}` : null].filter(Boolean);
    console.log(
      `${p.key.padEnd(8)} kalla ${p.box.w}x${p.box.h} @ (${p.box.x0},${p.box.y0})` +
        `  fot (${p.anchor.x.toFixed(0)},${p.anchor.y})` +
        `${flags.length ? `  [${flags.join(', ')}]` : ''}  -> ${(size / 1024).toFixed(1)} kB`,
    );
  }

  const manifest = {
    // Figurens storlek i spelvarldens pixlar
    worldWidth: +(canvasW * worldScale).toFixed(2),
    worldHeight: +(canvasH * worldScale).toFixed(2),
    // Fotpunktens plats i bildrutan, 0..1. Ritas mot spelarens fotter.
    anchorX: +(maxLeft / canvasW).toFixed(4),
    anchorY: +(maxTop / canvasH).toFixed(4),
    facing: config.facing,
    idle: 'idle.png',
    attack: prepared.filter((p) => p.key !== 'idle').map((p) => `${p.key}.png`),
  };

  await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('\nmanifest.json:', JSON.stringify(manifest));

  await writePreviews(team, outDir, prepared, manifest, outW, outH);
}

// Kontaktkarta for ogongranskning: alla rutor sida vid sida med fotlinje och
// fotpunktsmarkering. Ar allt ratt star figuren stadigt pa den roda linjen.
async function writePreviews(team, outDir, prepared, manifest, outW, outH) {
  const PAD = 10;
  const sheetW = (outW + PAD) * prepared.length + PAD;
  const sheetH = outH + PAD * 2 + 14;
  const footY = PAD + Math.round(manifest.anchorY * outH);

  const marks = [];
  for (let i = 0; i < prepared.length; i++) {
    const x = PAD + i * (outW + PAD);
    marks.push({
      input: { create: { width: outW, height: 1, channels: 4, background: { r: 255, g: 60, b: 60, alpha: 1 } } },
      left: x,
      top: footY,
    });
    marks.push({
      input: { create: { width: 1, height: outH, channels: 4, background: { r: 60, g: 200, b: 255, alpha: 1 } } },
      left: x + Math.round(manifest.anchorX * outW),
      top: PAD,
    });
  }

  await sharp({ create: { width: sheetW, height: sheetH, channels: 4, background: { r: 24, g: 22, b: 38, alpha: 1 } } })
    .composite([
      ...prepared.map((p, i) => ({ input: path.join(outDir, `${p.key}.png`), left: PAD + i * (outW + PAD), top: PAD })),
      ...marks,
    ])
    .png()
    .toFile(path.join(outDir, '_preview.png'));

  console.log(`kontaktkarta: public/assets/${team}/_preview.png (rod linje = fotter, bla = mittlinje)`);

  // Andra forhandsvyn: figuren i sin verkliga spelstorlek mot traffytan, sa det
  // gar att se om hon eller han ar lagom stor jamfort med plattformarna.
  const Z = 3; // utskriftsrutorna ar redan 3x spelstorlek
  const hitW = Math.round(PLAYER.w * Z);
  const hitH = Math.round(PLAYER.h * Z);
  const groundH = 44 * Z * 0.3;
  const cellW = outW + 24;
  const gameW = cellW * prepared.length + 24;
  const gameH = outH + 40 + groundH;
  const feetLine = 20 + Math.round(manifest.anchorY * outH);

  const gameParts = [];
  for (let i = 0; i < prepared.length; i++) {
    const x = 24 + i * cellW;
    const anchorPx = x + Math.round(manifest.anchorX * outW);
    gameParts.push({ input: path.join(outDir, `${prepared[i].key}.png`), left: x, top: 20 });
    // Traffytan: bara ramen, sa figuren syns igenom
    for (const [bx, by, bw, bh] of [
      [anchorPx - hitW / 2, feetLine - hitH, hitW, 2],
      [anchorPx - hitW / 2, feetLine - 2, hitW, 2],
      [anchorPx - hitW / 2, feetLine - hitH, 2, hitH],
      [anchorPx + hitW / 2 - 2, feetLine - hitH, 2, hitH],
    ]) {
      gameParts.push({
        input: {
          create: { width: Math.round(bw), height: Math.round(bh), channels: 4, background: { r: 255, g: 90, b: 90, alpha: 1 } },
        },
        left: Math.round(bx),
        top: Math.round(by),
      });
    }
  }
  // Plattform under fotterna, i spelets faktiska farg
  gameParts.push({
    input: { create: { width: gameW, height: Math.round(groundH), channels: 4, background: { r: 74, g: 58, b: 92, alpha: 1 } } },
    left: 0,
    top: feetLine,
  });

  await sharp({ create: { width: gameW, height: Math.round(gameH), channels: 4, background: { r: 27, g: 16, b: 48, alpha: 1 } } })
    .composite(gameParts)
    .png()
    .toFile(path.join(outDir, '_ingame.png'));

  console.log(
    `spelvy:       public/assets/${team}/_ingame.png (rod ram = traffytan ${PLAYER.w}x${PLAYER.h}, allt i ${Z}x spelstorlek)`,
  );
}

const wanted = process.argv.slice(2);
for (const name of wanted) {
  if (!CHARACTERS[name]) {
    console.error(`Okant lag: ${name}. Valj bland: ${Object.keys(CHARACTERS).join(', ')}`);
    process.exit(1);
  }
}

for (const team of wanted.length ? wanted : Object.keys(CHARACTERS)) {
  await build(team, CHARACTERS[team]);
}
