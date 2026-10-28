import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { buildRoundResult } from '../server/round-results.js';

function fighter(game, name, team, profileId, stats) {
  const player = game.addPlayer(name, team, { profileId });
  Object.assign(player.stats, stats);
  player.kills = player.stats.kills;
  player.deaths = player.stats.deaths;
  return player;
}

{
  const game = new Game();
  fighter(game, 'First Viking', 'viking', 1, { kills: 2, damageDealt: 900, deaths: 0 });
  fighter(game, 'True MVP', 'viking', 2, { kills: 3, damageDealt: 500, deaths: 2 });
  fighter(game, 'Cleo Star', 'cleo', 3, { kills: 8, damageDealt: 1600, deaths: 0 });
  const result = buildRoundResult(game, { cleo: 8, viking: 9 });
  assert.equal(result.winner, 'viking');
  assert.equal(result.mvp.name, 'True MVP', 'MVP comes from the winning team and is not the first connected player');
  assert.deepEqual(result.podium.map((player) => player.name), ['True MVP', 'Cleo Star', 'First Viking']);
  assert.deepEqual(result.podium.map((player) => player.rank), [1, 2, 3], 'the result carries a durable top three');
}

{
  const picks = [];
  for (const names of [['Zulu', 'Alpha'], ['Alpha', 'Zulu']]) {
    const game = new Game();
    for (const [index, name] of names.entries()) {
      fighter(game, name, 'viking', name === 'Alpha' ? 20 : 10, { kills: 2, damageDealt: 400, deaths: 1 });
    }
    picks.push(buildRoundResult(game, { cleo: 1, viking: 2 }).mvp.name);
  }
  assert.deepEqual(picks, ['Alpha', 'Alpha'], 'an exact performance tie is independent of connection order');
}

{
  const game = new Game();
  fighter(game, 'Viking', 'viking', 31, { kills: 1, damageDealt: 300, deaths: 0 });
  fighter(game, 'Draw MVP', 'cleo', 32, { kills: 1, damageDealt: 450, deaths: 1 });
  assert.equal(buildRoundResult(game, { cleo: 1, viking: 1 }).mvp.name, 'Draw MVP', 'both teams are eligible on a draw');
}

{
  const game = new Game();
  const dropout = fighter(game, 'Disconnected MVP', 'cleo', 41, { kills: 4, damageDealt: 800, deaths: 1 });
  fighter(game, 'Late Joiner', 'cleo', 42, { kills: 1, damageDealt: 250, deaths: 0 });
  game.removePlayer(dropout.id);
  const result = buildRoundResult(game, { cleo: 5, viking: 2 });
  assert.equal(result.mvp.name, 'Disconnected MVP', 'a player who leaves remains part of the round result');
  assert.equal(result.podium[0].name, 'Disconnected MVP', 'a dropout keeps their podium position');
}

{
  const game = new Game();
  fighter(game, 'Quiet Cleo', 'cleo', 51, { kills: 0, damageDealt: 0, deaths: 0 });
  fighter(game, 'Quiet Viking', 'viking', 52, { kills: 0, damageDealt: 0, deaths: 0 });
  assert.equal(buildRoundResult(game, { cleo: 0, viking: 0 }).mvp, null, 'an empty round does not invent an MVP');
  assert.deepEqual(buildRoundResult(game, { cleo: 0, viking: 0 }).podium, [], 'an empty round does not invent a podium');
}

console.log('ROUND RESULT TESTS OK: winner, draw, ties, late joins, dropouts and empty rounds are explicit');
