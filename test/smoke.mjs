// Rokttest mot en korande server: node test/smoke.mjs
// Ansluter tva riktiga WebSocket-klienter och kor igenom hela spelloopen.
import WebSocket from 'ws';

const URL = process.env.URL || 'ws://localhost:3000';

function client(name, team) {
  const ws = new WebSocket(URL);
  const c = { ws, name, team, id: 0, me: null, state: null, feed: [], fx: [] };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'joined') c.id = m.id;
    else if (m.t === 'state') {
      c.state = m;
      c.me = m.players.find((p) => p.i === c.id) ?? null;
      if (m.feed.length) c.feed.push(...m.feed);
      if (m.fx.length) c.fx.push(...m.fx);
    }
  });
  c.ready = new Promise((res) =>
    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'join', name, team }));
      res();
    }),
  );
  c.send = (o) => ws.send(JSON.stringify(o));
  return c;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 4000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return true;
    await wait(20);
  }
  return false;
};

const fails = [];
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'OK  ' : 'FEL '} ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) fails.push(label);
};

const a = client('Katten', 'cleo');
const b = client('Bjorn', 'viking');
await Promise.all([a.ready, b.ready]);
await until(() => a.me && b.me);

check('bada spelarna finns i state', !!a.me && !!b.me, `cleo x=${a.me.x} viking x=${b.me.x}`);
check('spawnar pa varsin sida', a.me.x < 800 && b.me.x > 800);
check('landar pa marken', await until(() => a.me.g === 1), `y=${a.me.y}`);

// --- hopp
const yBefore = a.me.y;
a.send({ t: 'act', a: 'jump' });
check('W hoppar', await until(() => a.me.y < yBefore - 40, 800), `y ${yBefore} -> ${a.me.y}`);
check('landar igen', await until(() => a.me.g === 1, 2500));

// --- rorelse
const xBefore = a.me.x;
a.send({ t: 'move', l: false, r: true });
await wait(400);
check('D gar hoger', a.me.x > xBefore + 100, `x ${xBefore} -> ${a.me.x}`);
a.send({ t: 'move', l: true, r: false });
const xTurn = a.me.x;
await wait(400);
// Kortare stracka an at hoger: halva tiden gar at till att bromsa in.
check('A gar vanster', a.me.x < xTurn - 60, `x ${xTurn} -> ${a.me.x}`);
a.send({ t: 'move', l: false, r: false });

// --- 1: sand blast (cleo)
a.send({ t: 'act', a: 'a1' });
check('1 startar cooldown', await until(() => a.me.cd.a1 > 0, 500), `${Math.round(a.me.cd.a1)} ms kvar`);
const cdFirst = a.me.cd.a1;
a.send({ t: 'act', a: 'a1' });
await wait(120);
check('1 gar inte att spamma', a.me.cd.a1 <= cdFirst);
check('1 har ratt cooldown (6.5s)', cdFirst > 6200 && cdFirst <= 6500, `${Math.round(cdFirst)} ms`);

// --- 2: blink (cleo)
const xBlinkBefore = a.me.x;
a.send({ t: 'act', a: 'a2' });
check('2 startar cooldown', await until(() => a.me.cd.a2 > 0, 500), `${Math.round(a.me.cd.a2)} ms kvar`);
check('2 blinkar spelaren framat', await until(() => Math.abs(a.me.x - xBlinkBefore) > 120, 700), `x ${xBlinkBefore} -> ${a.me.x}`);

// --- 3: power shield (cleo)
a.send({ t: 'act', a: 'a3' });
check('3 startar cooldown', await until(() => a.me.cd.a3 > 59000, 500), `${Math.round(a.me.cd.a3)} ms kvar`);
check('3 ger 5 shield charges', await until(() => a.me.ps === 5, 500), `charges ${a.me.ps}`);

// --- 2: shield charge (viking) kraver luft
b.send({ t: 'act', a: 'a2' });
await wait(150);
check('2 blockeras pa marken', b.me.cd.a2 === 0);
b.send({ t: 'act', a: 'jump' });
await wait(120);
b.send({ t: 'act', a: 'a2' });
check('2 funkar i luften', await until(() => b.me.cd.a2 > 0, 600), `${Math.round(b.me.cd.a2)} ms`);
check('marksmall ger shockwave-fx', await until(() => b.fx.some((f) => f.k === 'slam'), 2000));

// --- narstrid
await until(() => a.me.g === 1 && b.me.g === 1, 3000);
a.send({ t: 'move', l: false, r: true });
b.send({ t: 'move', l: true, r: false });
const met = await until(() => Math.abs(a.me.x - b.me.x) < 40, 8000);
a.send({ t: 'move', l: false, r: false });
b.send({ t: 'move', l: false, r: false });
check('spelarna moter varandra', met, `avstand ${Math.round(Math.abs(a.me.x - b.me.x))}`);

// Traffar knuffar undan motstandaren, sa vi maste jaga mellan varje slag.
const hpBefore = b.me.hp;
const deadline = Date.now() + 15000;
let swings = 0;
while (Date.now() < deadline && !b.me.d) {
  const toRight = b.me.x > a.me.x;
  a.send({ t: 'move', l: !toRight, r: toRight });
  if (Math.abs(a.me.x - b.me.x) < 45) {
    a.send({ t: 'act', a: 'm1' });
    swings++;
    await wait(430);
  } else {
    await wait(30);
  }
}
a.send({ t: 'move', l: false, r: false });
check('mellanslag gor skada', b.me.hp < hpBefore || b.me.d === 1, `hp ${hpBefore} -> ${b.me.hp} pa ${swings} slag`);

// --- dod, killfeed, poang, respawn
const died = await until(() => b.me.d === 1, 6000);
check('spelare dor vid 0 hp', died);
if (died) {
  check('killfeed registrerar', a.feed.some((f) => f.victim === 'Bjorn'), JSON.stringify(a.feed.at(-1) ?? {}));
  check('poang till Cleo', a.state.score.cleo >= 1, JSON.stringify(a.state.score));
  check('respawn-timer racknar ned', b.me.rs > 0 && b.me.rs <= 3000, `${Math.round(b.me.rs)} ms`);
  check('respawnar automatiskt', await until(() => b.me.d === 0 && b.me.hp === 100, 5000));
}

// --- disconnect
a.ws.close();
await wait(300);
check('spelare tas bort vid disconnect', !b.state.players.some((p) => p.n === 'Katten'));

b.ws.close();
console.log('');
console.log(fails.length ? `${fails.length} TEST MISSLYCKADES: ${fails.join(', ')}` : 'ALLA TESTER OK');
process.exit(fails.length ? 1 : 0);
