const TEAM_IDS = new Set(['cleo', 'viking']);

/**
 * Build the durable summary used by the result screen before the live Game is
 * reset. Players who left during the round remain in roundPlayers, while a
 * reconnect with the same profile/team is folded into the same performance.
 */
export function buildRoundResult(game, finalScore = game?.score) {
  const score = cleanScore(finalScore);
  const winner = score.cleo === score.viking ? null : score.cleo > score.viking ? 'cleo' : 'viking';
  const participants = aggregateParticipants(game);
  const eligible = winner ? participants.filter((player) => player.team === winner) : participants;
  const performed = eligible.filter((player) => player.kills > 0 || player.damageDealt > 0);
  performed.sort(comparePerformance);
  const mvp = performed[0] ?? null;
  const ranked = [...participants].sort(comparePerformance);
  const podium = mvp
    ? [mvp, ...ranked.filter((player) => player !== mvp)]
        .slice(0, 3)
        .map((player, index) => ({ ...player, rank: index + 1 }))
    : [];

  return {
    winner,
    mvp,
    podium,
  };
}

function aggregateParticipants(game) {
  const source = Array.isArray(game?.roundPlayers) ? game.roundPlayers : [...(game?.players?.values?.() ?? [])];
  const rows = new Map();

  for (const player of source) {
    if (!player || player.bot || !TEAM_IDS.has(player.team)) continue;
    const profileId = nonNegativeInt(player.profileId);
    const key = profileId ? `profile:${profileId}:${player.team}` : `player:${nonNegativeInt(player.id)}`;
    const current = rows.get(key) ?? {
      name: cleanName(player.name),
      team: player.team,
      profileId,
      kills: 0,
      deaths: 0,
      damageDealt: 0,
    };
    current.kills += nonNegativeInt(player.stats?.kills ?? player.kills);
    current.deaths += nonNegativeInt(player.stats?.deaths ?? player.deaths);
    current.damageDealt += nonNegativeInt(player.stats?.damageDealt);
    rows.set(key, current);
  }

  return [...rows.values()];
}

function comparePerformance(a, b) {
  return b.kills - a.kills
    || b.damageDealt - a.damageDealt
    || a.deaths - b.deaths
    || compareText(a.name, b.name)
    || a.profileId - b.profileId;
}

function compareText(a, b) {
  const left = String(a).normalize('NFKC').toLocaleLowerCase('en-US');
  const right = String(b).normalize('NFKC').toLocaleLowerCase('en-US');
  return left < right ? -1 : left > right ? 1 : 0;
}

function cleanScore(score) {
  return {
    cleo: nonNegativeInt(score?.cleo),
    viking: nonNegativeInt(score?.viking),
  };
}

function cleanName(name) {
  const value = String(name ?? '').trim();
  return value || 'Unknown fighter';
}

function nonNegativeInt(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}
