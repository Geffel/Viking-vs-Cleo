import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Game } from '../server/game.js';
import { JsonProfileStore } from '../server/profile-store.js';
import { ProfileStatistics, freshProfileAchievements, freshProfileStats } from '../server/profile-statistics.js';
import { TickMetrics } from '../server/tick-metrics.js';
import { TICK_MS } from '../shared/constants.js';

const SAMPLE_TICKS = Math.max(1_000, Number(process.env.VVC_BENCHMARK_TICKS) || 30_000);
const WARMUP_TICKS = 1_000;
const PROFILE_COUNT = 16;

function createProfiles() {
  return new Map(Array.from({ length: PROFILE_COUNT }, (_, index) => {
    const profileId = index + 1;
    return [profileId, {
      profileId, name: `Benchmark ${profileId}`, points: 0, playMs: 0, seen: 1,
      lastSeenAt: 0, killsAgainst: {}, deathsBy: {}, teamPlayMs: { cleo: 0, viking: 0 },
      stats: freshProfileStats(), achievements: freshProfileAchievements(), active: null,
    }];
  }));
}

function storageSnapshot(profiles) {
  return {
    version: 4,
    nextProfileId: profiles.size + 1,
    globalStats: { factionWins: { cleo: 0, viking: 0 } },
    profiles: [...profiles.values()].map(({ active: _active, ...entry }, index) => ({ clientId: `benchmark-${index + 1}`, ...entry })),
  };
}

async function measure({ save }) {
  let clock = 0;
  const profiles = createProfiles();
  const statistics = new ProfileStatistics({ getProfileById: (id) => profiles.get(id), now: () => clock });
  const game = new Game({ clock: () => clock, rng: () => 0.75 });
  const players = [];
  for (let index = 0; index < 8; index++) {
    const player = game.addPlayer(`Fighter ${index + 1}`, index % 2 ? 'viking' : 'cleo', { profileId: index + 1 });
    players.push(player);
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'vvc-tick-baseline-'));
  const store = new JsonProfileStore({ dataDir: tempDir });
  const metrics = new TickMetrics({ sampleLimit: SAMPLE_TICKS });
  let writes = 0;
  try {
    for (let tick = -WARMUP_TICKS; tick < SAMPLE_TICKS; tick++) {
      clock += TICK_MS;
      for (let index = 0; index < players.length; index += 2) {
        const left = players[index];
        const right = players[index + 1];
        left.x = 300 + index * 80; left.y = 500; left.onGround = true; left.facing = 1;
        right.x = left.x + 38; right.y = 500; right.onGround = true; right.facing = -1;
        if (tick % 30 === index * 2) game.action(left, 'm1');
        if (tick % 30 === index * 2 + 15) game.action(right, 'm1');
      }

      const started = performance.now();
      game.update();
      if (tick % 2 === 0) {
        const snapshot = game.snapshot();
        const killChanges = statistics.applyKillFeed(snapshot.feed);
        statistics.unlockAchievements(killChanges);
        if (save && killChanges.size) { store.save(storageSnapshot(profiles)); writes++; }

        const eventChanges = statistics.applyEvents(snapshot.events);
        statistics.unlockAchievements(eventChanges);
        if (save && eventChanges.size) { store.save(storageSnapshot(profiles)); writes++; }
      }
      if (tick >= 0) metrics.record(performance.now() - started);
    }
    return { ...metrics.snapshot(), writes };
  } finally {
    await rm(tempDir, { recursive: true });
  }
}

const combat = await measure({ save: false });
const combatAndSave = await measure({ save: true });
console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  runtime: process.version,
  platform: `${process.platform} ${process.arch}`,
  cpu: os.cpus()[0]?.model ?? 'unknown',
  logicalCpus: os.cpus().length,
  sampleTicks: SAMPLE_TICKS,
  players: 8,
  profiles: PROFILE_COUNT,
  scenarios: { combat, combatAndSynchronousProfileSave: combatAndSave },
}, null, 2));
