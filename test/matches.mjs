// Matchflodet: lobby -> kartrostning -> countdown -> spel -> resultat.

import { MatchRegistry } from '../server/matches.js';
import { MAPS, MAP_VOTE_MS, MATCH_COUNTDOWN_MS, MATCH_DURATION_MS, MATCH_PHASES } from '../shared/constants.js';

let clock = 100000;
const fails = [];

const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'OK  ' : 'FEL '} ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) fails.push(label);
};

const registry = new MatchRegistry({ clock: () => clock });
const host = { sessionId: 1, name: 'Host', profileId: 11 };
const guest = { sessionId: 2, name: 'Guest', profileId: 22 };

const created = registry.create(host);
check('ny match skapas i matchlobbyn', created.phase === MATCH_PHASES.matchLobby && created.hostId === host.sessionId);
check('host laggs till som spelare', created.players.size === 1 && created.players.has(host.sessionId));

registry.addPlayer(created.id, guest);
check('gasten kan joina lobbyn', created.players.size === 2 && created.players.has(guest.sessionId));
check('snapshot visar lobbydata', registry.snapshot(created.id).playerCount === 2 && registry.list().length === 1);

check('man kan inte ready utan karaktar', !!registry.setReady(created.id, guest.sessionId, true).error);
check('okand karaktar nekas', !!registry.setCharacter(created.id, guest.sessionId, 'pirate').error);
registry.setCharacter(created.id, host.sessionId, 'cleo');
registry.setCharacter(created.id, guest.sessionId, 'viking');
check('spelare kan valja karaktar', [...created.players.values()].every((p) => p.character));

registry.setReady(created.id, host.sessionId, true);
registry.setReady(created.id, guest.sessionId, true);
check('ready raknas i snapshot', registry.snapshot(created.id).allReady);
check('bara host kan starta', !!registry.start(created.id, guest.sessionId).error);

const started = registry.start(created.id, host.sessionId).match;
check('host startar kartrostning', started.phase === MATCH_PHASES.mapVote && started.voteEndsAt === clock + MAP_VOTE_MS);
check('start nollstaller tidigare rostning/resultat', started.mapVotes.size === 0 && !started.selectedMap && !started.finalScore);
check('ready stangs efter karaktarbyte under aktiv fas', registry.setCharacter(created.id, guest.sessionId, 'cleo').match.players.get(guest.sessionId).ready === false);
registry.setCharacter(created.id, guest.sessionId, 'viking');

check('ogiltig karta nekas', !!registry.voteMap(created.id, host.sessionId, 'missing_map').error);
registry.voteMap(created.id, host.sessionId, MAPS[1].id);
check('en rost haller matchen kvar i kartrostning', created.phase === MATCH_PHASES.mapVote && created.selectedMap === null);
const voteResult = registry.voteMap(created.id, guest.sessionId, MAPS[2].id);
check('alla roster startar countdown direkt', voteResult.change?.to === MATCH_PHASES.countdown && created.phase === MATCH_PHASES.countdown);
check('vid lika vinner hostens karta', created.selectedMap === MAPS[1].id, created.selectedMap);

clock = created.countdownEndsAt;
const toPlaying = registry.advancePhases();
check('countdown gar over till spel', toPlaying.some((c) => c.to === MATCH_PHASES.playing) && created.phase === MATCH_PHASES.playing);
check('spelfasen far sluttid', created.matchEndsAt === clock + MATCH_DURATION_MS);

const late = { sessionId: 3, name: 'Late', profileId: 33 };
registry.addPlayer(created.id, late);
check('sen spelare kan joina pagaende match', created.players.has(late.sessionId));
check('sen spelare kan valja karaktar i spel', !registry.setCharacter(created.id, late.sessionId, 'cleo').error);

const removed = registry.removePlayer(created.id, host.sessionId);
check('hostbyte sker nar host lamnar', removed.hostId !== host.sessionId && removed.players.has(removed.hostId));

clock = created.matchEndsAt;
const toResults = registry.advancePhases({ scoreForMatch: () => ({ cleo: 2, viking: 1 }) });
check('tiden kan avsluta matchen', toResults.some((c) => c.to === MATCH_PHASES.results) && created.phase === MATCH_PHASES.results);
check('slutpoang sparas', created.finalScore.cleo === 2 && created.finalScore.viking === 1);
check('resultatet raknas nar minst tva valt karaktar', created.resultCounts === true && created.unrankedReason === null);

check('icke-host kan inte starta om fran resultat', !!registry.resetToLobby(created.id, host.sessionId).error);
registry.resetToLobby(created.id, removed.hostId);
check('host kan starta ny rond fran resultat', created.phase === MATCH_PHASES.matchLobby && !created.selectedMap);
check('ny rond rensar karaktarer och ready', [...created.players.values()].every((p) => !p.character && !p.ready));

const solo = registry.create({ sessionId: 9, name: 'Solo', profileId: 99 });
registry.setCharacter(solo.id, 9, 'cleo');
registry.start(solo.id, 9);
clock = solo.voteEndsAt;
registry.advancePhases();
clock = solo.countdownEndsAt;
registry.advancePhases();
clock = solo.matchEndsAt;
registry.advancePhases();
check('ensam time-out blir orankad', solo.phase === MATCH_PHASES.results && solo.resultCounts === false && solo.unrankedReason === 'soloTimeUp');

registry.removePlayer(solo.id, 9);
check('tom match tas bort', registry.get(solo.id) === null);

console.log('');
console.log(fails.length ? `${fails.length} TEST MISSLYCKADES: ${fails.join(', ')}` : 'ALLA MATCH-TESTER OK');
process.exit(fails.length ? 1 : 0);
