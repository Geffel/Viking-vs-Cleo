import fs from 'node:fs';

const path = new URL('../public/assets/instruction-video.mp4', import.meta.url);
const input = fs.readFileSync(path);

function atoms(buffer) {
  const list = [];
  for (let offset = 0; offset < buffer.length;) {
    const size = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (size < 8 || offset + size > buffer.length) throw new Error(`Invalid ${type} atom`);
    list.push({ type, offset, size });
    offset += size;
  }
  return list;
}

const top = atoms(input);
if (top.map(({ type }) => type).join(',') === 'ftyp,moov,mdat') {
  console.log('Instruction video already has fast-start metadata.');
  process.exit(0);
}
if (top.map(({ type }) => type).join(',') !== 'ftyp,mdat,moov') {
  throw new Error(`Unexpected atom order: ${top.map(({ type }) => type).join(',')}`);
}

const [ftyp, mdat, moovInfo] = top;
const moov = Buffer.from(input.subarray(moovInfo.offset, moovInfo.offset + moovInfo.size));
let adjusted = 0;
for (let i = 4; i < moov.length - 12; i++) {
  const type = moov.toString('ascii', i, i + 4);
  if (type !== 'stco' && type !== 'co64') continue;
  const size = moov.readUInt32BE(i - 4);
  const count = moov.readUInt32BE(i + 8);
  const step = type === 'stco' ? 4 : 8;
  if (size !== 16 + count * step || i - 4 + size > moov.length) continue;
  for (let n = 0; n < count; n++) {
    const pos = i + 12 + n * step;
    const original = type === 'stco' ? BigInt(moov.readUInt32BE(pos)) : moov.readBigUInt64BE(pos);
    if (original < BigInt(mdat.offset + 8) || original >= BigInt(mdat.offset + mdat.size)) {
      throw new Error(`Chunk offset outside mdat: ${original}`);
    }
    if (type === 'stco') moov.writeUInt32BE(Number(original) + moov.length, pos);
    else moov.writeBigUInt64BE(original + BigInt(moov.length), pos);
    adjusted++;
  }
}
if (!adjusted) throw new Error('No chunk offsets found');

const output = Buffer.concat([
  input.subarray(ftyp.offset, ftyp.offset + ftyp.size),
  moov,
  input.subarray(mdat.offset, mdat.offset + mdat.size),
]);
if (output.length !== input.length || atoms(output).map(({ type }) => type).join(',') !== 'ftyp,moov,mdat') {
  throw new Error('Fast-start validation failed');
}
fs.writeFileSync(path, output);
console.log(`Moved moov before mdat; adjusted ${adjusted} chunk offsets.`);
