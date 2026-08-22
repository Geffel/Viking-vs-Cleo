// Matchflodet: lobby -> kartrostning -> countdown -> spel -> resultat.

import { MatchRegistry } from '../server/matches.js';
import { MAPS, MAP_VOTE_MS, MATCH_COUNTDOWN_MS, MATCH_DURATION_MS, MATCH_MODES, MATCH_PHASES } from '../shared/constants.js';

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
check('ny match ar online och oppen', registry.snapshot(created.id).mode === MATCH_MODES.online && registry.snapshot(created.id).closed === false);

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

const sharedHost = { sessionId: 20, name: 'Couch Host', profileId: 200 };
const sharedGuest = { sessionId: 21, name: 'Remote Guest', profileId: 210 };
const shared = registry.create(sharedHost);
registry.setCharacter(shared.id, sharedHost.sessionId, 'cleo');
registry.setReady(shared.id, sharedHost.sessionId, true);
const sharedResult = registry.setSharedScreenMode(shared.id, sharedHost.sessionId, true);
const sharedSnap = registry.snapshot(shared.id);
check(
  'host kan aktivera shared screen i matchlobbyn',
  sharedResult.match?.mode === MATCH_MODES.sharedScreen && sharedResult.match.closed === true && sharedResult.match.statsEnabled === false,
);
check('shared screen toggle nollstaller lobbyval', !shared.players.get(sharedHost.sessionId).character && !shared.players.get(sharedHost.sessionId).ready);
check('snapshot visar shared screen falt', sharedSnap.sharedScreen === true && sharedSnap.closed === true && sharedSnap.statsEnabled === false);
check('stangd shared screen match nekar online join', registry.addPlayer(shared.id, sharedGuest) === null && shared.players.size === 1);
check(
  'shared screen skapar host-seat P1',
  sharedSnap.localSeatCount === 1 &&
    sharedSnap.localSeats[0].id === 'P1' &&
    sharedSnap.localSeats[0].ownerSessionId === sharedHost.sessionId &&
    sharedSnap.localSeats[0].inputDevice.type === 'keyboard',
);

const p2 = registry.addLocalSeat(shared.id, sharedHost.sessionId, { type: 'gamepad', index: 0, label: 'Pad Zero' });
check('gamepad kan vacka P2-seat', p2.seat?.id === 'P2' && p2.match.localSeats.size === 2);
const p2Again = registry.addLocalSeat(shared.id, sharedHost.sessionId, { type: 'gamepad', index: 0 });
check('samma gamepad ateranvander sin seat', p2Again.seat?.id === 'P2' && shared.localSeats.size === 2);
registry.setLocalSeatConnected(shared.id, sharedHost.sessionId, { type: 'gamepad', index: 0 }, false);
check('gamepad disconnect markerar seat offline', shared.localSeats.get('P2')?.connected === false);
const p2Reconnect = registry.addLocalSeat(shared.id, sharedHost.sessionId, { type: 'gamepad', index: 0 });
check('gamepad reconnect ateraktiverar samma seat', p2Reconnect.seat?.id === 'P2' && p2Reconnect.seat.connected === true && shared.localSeats.size === 2);
check('local seat maste valja karaktar fore ready', !!registry.setLocalSeatReady(shared.id, sharedHost.sessionId, 'P2', true).error);
registry.setLocalSeatCharacter(shared.id, sharedHost.sessionId, 'P2', 'viking');
registry.setLocalSeatReady(shared.id, sharedHost.sessionId, 'P2', true);
registry.setLocalSeatCharacter(shared.id, sharedHost.sessionId, 'P1', 'cleo');
registry.setLocalSeatPlayer(shared.id, 'P2', 77);
const withSeats = registry.snapshot(shared.id);
const snapP1 = withSeats.localSeats.find((seat) => seat.id === 'P1');
const snapP2 = withSeats.localSeats.find((seat) => seat.id === 'P2');
check('local seat-val exponeras i snapshot', snapP2.character === 'viking' && snapP2.ready === true && snapP2.playerId === 77);
check('P1-seat speglar hostens karaktar', snapP1.character === 'cleo' && shared.players.get(sharedHost.sessionId).character === 'cleo');
registry.addLocalSeat(shared.id, sharedHost.sessionId, { type: 'gamepad', index: 1 });
registry.addLocalSeat(shared.id, sharedHost.sessionId, { type: 'gamepad', index: 2 });
check('shared screen begransas till fyra seats', !!registry.addLocalSeat(shared.id, sharedHost.sessionId, { type: 'gamepad', index: 3 }).error);
registry.removeLocalSeat(shared.id, sharedHost.sessionId, 'P4');
check('local seat kan tas bort', !shared.localSeats.has('P4') && registry.snapshot(shared.id).localSeatCount === 3);
check('P1 kan inte tas bort', !!registry.removeLocalSeat(shared.id, sharedHost.sessionId, 'P1').error);

registry.setSharedScreenMode(shared.id, sharedHost.sessionId, false);
check(
  'host kan stanga av shared screen i matchlobbyn',
  shared.mode === MATCH_MODES.online && shared.closed === false && shared.statsEnabled === true && shared.localSeats.size === 0,
);
registry.addPlayer(shared.id, sharedGuest);
check('non-host kan inte aktivera shared screen', !!registry.setSharedScreenMode(shared.id, sharedGuest.sessionId, true).error);
check('host kan inte aktivera shared screen med remote guest', !!registry.setSharedScreenMode(shared.id, sharedHost.sessionId, true).error);

const sharedStartRules = registry.create({ sessionId: 31, name: 'Start Host', profileId: 310 });
registry.setSharedScreenMode(sharedStartRules.id, 31, true);
registry.setLocalSeatCharacter(sharedStartRules.id, 31, 'P1', 'cleo');
check(
  'shared screen start kraver minst tva seats',
  !!registry.start(sharedStartRules.id, 31).error && registry.snapshot(sharedStartRules.id).allCharactersChosen === false,
);
registry.addLocalSeat(sharedStartRules.id, 31, { type: 'gamepad', index: 0 });
check('shared screen start vantar pa alla aktiva seats', !!registry.start(sharedStartRules.id, 31).error);
registry.setLocalSeatCharacter(sharedStartRules.id, 31, 'P2', 'viking');
const sharedStartSnap = registry.snapshot(sharedStartRules.id);
check('shared screen snapshot raknar local seat-val', sharedStartSnap.allCharactersChosen === true && sharedStartSnap.hasMinimumLocalSeats === true);
const sharedStarted = registry.start(sharedStartRules.id, 31).match;
check('shared screen kan starta nar local seats valt', sharedStarted.phase === MATCH_PHASES.mapVote && sharedStarted.localSeats.size === 2);
const firstMapId = MAPS[0].id;
const secondMapId = MAPS[1]?.id ?? firstMapId;
registry.voteMap(sharedStartRules.id, 31, secondMapId, 'P2');
const p2VoteSnap = registry.snapshot(sharedStartRules.id);
check(
  'shared screen map vote visar seat-voters',
  p2VoteSnap.mapVotes.find((map) => map.id === secondMapId)?.voters.some((voter) => voter.seatId === 'P2'),
);
const sharedCountdown = registry.voteMap(sharedStartRules.id, 31, firstMapId, 'P1').match;
check(
  'shared screen map vote vantar pa alla seats och P1 bryter lika',
  sharedCountdown.phase === MATCH_PHASES.countdown && sharedCountdown.selectedMap === firstMapId,
);
const sharedFinished = registry.finish(sharedStartRules.id, 31, { cleo: 3, viking: 2 }).match;
check(
  'shared screen resultat ar statistikfritt',
  sharedFinished.phase === MATCH_PHASES.results &&
    sharedFinished.resultCounts === false &&
    sharedFinished.unrankedReason === 'sharedScreen',
);
registry.resetToLobby(sharedStartRules.id, 31);
const sharedResetSnap = registry.snapshot(sharedStartRules.id);
check(
  'shared screen ny runda behaller seats och fighterval',
  sharedResetSnap.phase === MATCH_PHASES.matchLobby &&
    sharedResetSnap.localSeatCount === 2 &&
    sharedResetSnap.localSeats.every((seat) => seat.character && !seat.mapVote && !seat.playerId),
);

const phaseLocked = registry.create({ sessionId: 30, name: 'Phase Host', profileId: 300 });
registry.setSharedScreenMode(phaseLocked.id, 30, true);
registry.setLocalSeatCharacter(phaseLocked.id, 30, 'P1', 'viking');
registry.addLocalSeat(phaseLocked.id, 30, { type: 'gamepad', index: 0 });
registry.setLocalSeatCharacter(phaseLocked.id, 30, 'P2', 'cleo');
registry.start(phaseLocked.id, 30);
check('shared screen kan inte togglas efter matchlobbyn', !!registry.setSharedScreenMode(phaseLocked.id, 30, false).error);

console.log('');
console.log(fails.length ? `${fails.length} TEST MISSLYCKADES: ${fails.join(', ')}` : 'ALLA MATCH-TESTER OK');
process.exit(fails.length ? 1 : 0);
