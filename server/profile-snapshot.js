import { createHash } from 'node:crypto';

export function hashLegacyClientId(clientId) {
  return createHash('sha256').update(String(clientId), 'utf8').digest('hex');
}

export function snapshotTotals(snapshot) {
  const totals = {
    profiles: 0, points: 0, playMs: 0, kills: 0, deaths: 0,
    matches: 0, achievements: 0, opponentRelations: 0, opponentRelationSha256: '',
  };
  const relations = [];
  for (const profile of snapshot?.profiles ?? []) {
    totals.profiles++;
    totals.points += positive(profile.points);
    totals.playMs += positive(profile.playMs);
    totals.kills += sum(profile.killsAgainst);
    totals.deaths += sum(profile.deathsBy);
    totals.matches += positive(profile.stats?.matches?.played);
    totals.achievements += Object.keys(profile.achievements?.unlocked ?? {}).length;
    const opponents = new Set([
      ...Object.keys(profile.killsAgainst ?? {}),
      ...Object.keys(profile.deathsBy ?? {}),
    ]);
    totals.opponentRelations += opponents.size;
    for (const opponent of [...opponents].sort((a, b) => Number(a) - Number(b))) {
      relations.push(`${profile.profileId}:${opponent}:${positive(profile.killsAgainst?.[opponent])}:${positive(profile.deathsBy?.[opponent])}`);
    }
  }
  totals.opponentRelationSha256 = createHash('sha256').update(relations.sort().join('|')).digest('hex');
  return totals;
}

export function validateLegacySnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.profiles)) throw new Error('Profile snapshot must contain a profiles array');
  const ids = new Set();
  const clientHashes = new Set();
  for (const profile of snapshot.profiles) {
    const id = integer(profile.profileId);
    if (!id || ids.has(id)) throw new Error(`Invalid or duplicate profileId: ${profile.profileId}`);
    ids.add(id);
    const hash = profile.clientIdHash || (profile.clientId ? hashLegacyClientId(profile.clientId) : '');
    if (!/^[a-f0-9]{64}$/.test(hash) || clientHashes.has(hash)) {
      throw new Error(`Invalid or duplicate legacy client identity for profile ${id}`);
    }
    clientHashes.add(hash);
  }
  return snapshotTotals(snapshot);
}

function positive(value) { return Math.max(0, Number(value) || 0); }
function integer(value) { const n = Number(value); return Number.isSafeInteger(n) && n > 0 ? n : 0; }
function sum(map) { return Object.values(map ?? {}).reduce((total, value) => total + positive(value), 0); }
