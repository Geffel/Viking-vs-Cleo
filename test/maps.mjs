// Kartdata: alla kartor ska ha spelbar layout, spawnpunkter och powerup-spawns.

import { MAPS, TEAM_IDS, WORLD, mapLayoutFor } from '../shared/constants.js';

const fails = [];

const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'OK  ' : 'FEL '} ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) fails.push(label);
};

const ids = MAPS.map((map) => map.id);
check('alla kartor har unika id', new Set(ids).size === ids.length, ids.join(', '));

for (const map of MAPS) {
  const layout = mapLayoutFor(map.id);
  const ground = layout.platforms.find((pl) => pl.ground);
  const invalidPlatforms = layout.platforms.filter((pl) => !(pl.w > 0 && pl.h > 0 && pl.x >= 0 && pl.x + pl.w <= WORLD.w && pl.y >= 0 && pl.y <= WORLD.h));
  const invalidSpawns = TEAM_IDS.flatMap((team) =>
    (layout.spawns[team] ?? [])
      .filter((spawn) => !(spawn.x >= 0 && spawn.x + 30 <= WORLD.w && spawn.y >= 0 && spawn.y + 44 <= WORLD.h))
      .map((spawn) => ({ team, ...spawn })),
  );
  const invalidPowerups = (layout.powerupSpawns ?? []).filter((spawn) => !(spawn.x >= 0 && spawn.x <= WORLD.w && spawn.y >= 0 && spawn.y <= WORLD.h));

  check(`${map.name} har plattformar`, layout.platforms.length > 0);
  check(`${map.name} har mark`, !!ground);
  check(
    `${map.name} har spawnpunkter for bada lagen`,
    TEAM_IDS.every((team) => Array.isArray(layout.spawns[team]) && layout.spawns[team].length > 0),
  );
  check(
    `${map.name} har powerup-spawns`,
    Array.isArray(layout.powerupSpawns) && layout.powerupSpawns.length >= 3,
    `${layout.powerupSpawns?.length ?? 0} st`,
  );
  check(`${map.name}: alla plattformar ligger i varlden`, invalidPlatforms.length === 0, invalidPlatforms.length ? JSON.stringify(invalidPlatforms) : '');
  check(`${map.name}: alla spel-spawns ligger i varlden`, invalidSpawns.length === 0, invalidSpawns.length ? JSON.stringify(invalidSpawns) : '');
  check(`${map.name}: alla powerup-spawns ligger i varlden`, invalidPowerups.length === 0, invalidPowerups.length ? JSON.stringify(invalidPowerups) : '');
}

check('okand karta faller tillbaka till forsta kartans layout', mapLayoutFor('finns_inte') === mapLayoutFor(MAPS[0].id));

console.log('');
console.log(fails.length ? `${fails.length} TEST MISSLYCKADES: ${fails.join(', ')}` : 'ALLA KART-TESTER OK');
process.exit(fails.length ? 1 : 0);
