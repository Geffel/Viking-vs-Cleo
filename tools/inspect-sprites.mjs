// Diagnostik: vad innehaller kallbilderna egentligen?
import sharp from 'sharp';
import path from 'node:path';

const SOURCE_ROOT = 'C:/Viking-Vs-Cleo/source-images';

const files = [
  'viking_standard_pose.png',
  'viking_melee_attack_frame_1.png',
  'viking_melee_attack_frame_2.png',
  'viking_melee_attack_frame_3.png',
  'cleo_standard_pose.png',
  'cleo_melee_attack_frame_1.png',
  'cleo_melee_attack_frame_2.png',
  'cleo_melee_attack_frame_3.png',
];

for (const file of files) {
  const img = sharp(path.join(SOURCE_ROOT, file));
  const meta = await img.metadata();
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;

  const px = (x, y) => {
    const i = (y * w + x) * ch;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };

  const corners = {
    tl: px(2, 2),
    tr: px(w - 3, 2),
    bl: px(2, h - 3),
    br: px(w - 3, h - 3),
    mid_left: px(2, h >> 1),
  };

  let minA = 255;
  for (let i = 3; i < data.length; i += ch) if (data[i] < minA) minA = data[i];

  console.log(`\n${file}`);
  console.log(`  ${meta.width}x${meta.height}  kanaler=${ch}  hasAlpha=${meta.hasAlpha}  lagsta alpha=${minA}`);
  for (const [k, v] of Object.entries(corners)) console.log(`  ${k.padEnd(9)} rgba(${v.join(', ')})`);
}
