import { ABILITY_SLOTS } from '../shared/constants.js';

// Skriver ut en ognapsbild fran servern: node test/peek.mjs
import WebSocket from 'ws';

const ws = new WebSocket(process.env.URL || 'ws://localhost:3000');
ws.on('message', (raw) => {
  const m = JSON.parse(raw);
  if (m.t !== 'state') return;
  console.log('poang:', m.score);
  for (const p of m.players) {
    const cds = ABILITY_SLOTS.map((slot) => `${slot}=${Math.round(p.cd[slot] ?? 0)}`).join(' ');
    console.log(`  #${p.i} ${p.n.padEnd(14)} lag=${p.tm.padEnd(6)} x=${Math.round(p.x)} y=${Math.round(p.y)} hp=${p.hp} cd(${cds})`);
  }
  ws.close();
  process.exit(0);
});
