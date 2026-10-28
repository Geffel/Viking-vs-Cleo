import { ACTION_SLOTS, LOCAL_SEAT_IDS, MAPS, PERFORMANCE_TEST, TEAM_IDS } from '../shared/constants.js';
import { validView } from '../shared/netcode.js';

export const MAX_MESSAGE_BYTES = 4096;
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 80) => typeof value === 'string' && value.length <= max;
const optional = (msg, key, check) => msg[key] === undefined || check(msg[key]);
const seat = (value) => LOCAL_SEAT_IDS.includes(value);
const character = (value) => TEAM_IDS.includes(value);
const actionIds = new Set(['jump', 'drop', 'melee', ...ACTION_SLOTS]);
const action = (value) => actionIds.has(value);
const device = (value) => record(value)
  && (value.type === 'keyboard' || (value.type === 'gamepad' && Number.isInteger(value.index) && value.index >= 0 && value.index <= 15))
  && optional(value, 'label', (label) => text(label));
const identity = (msg) => text(msg.name) && optional(msg, 'clientId', (id) => id === null || text(id));

const validators = {
  clientPing: (m) => Number.isSafeInteger(m.id) && m.id >= 0,
  identify: identity,
  join: (m) => identity(m) && optional(m, 'team', character),
  createMatch: (m) => optional(m, 'mode', (mode) => ['online', 'training', 'performance'].includes(mode))
    && optional(m, 'maxBots', (count) => Number.isInteger(count)
      && count >= PERFORMANCE_TEST.minBots && count <= PERFORMANCE_TEST.maxBots),
  joinMatch: (m) => text(m.id) && m.id.length > 0,
  setSharedScreenMode: (m) => typeof m.enabled === 'boolean',
  wakeLocalSeat: (m) => device(m.inputDevice),
  setLocalSeatCharacter: (m) => seat(m.seatId) && character(m.character),
  setLocalSeatReady: (m) => seat(m.seatId) && typeof m.ready === 'boolean',
  removeLocalSeat: (m) => seat(m.seatId),
  setLocalSeatConnected: (m) => device(m.inputDevice) && typeof m.connected === 'boolean',
  setReady: (m) => typeof m.ready === 'boolean',
  setCharacter: (m) => character(m.character),
  trainingSwitchCharacter: (m) => character(m.character),
  voteMap: (m) => MAPS.some((map) => map.id === m.mapId) && optional(m, 'seatId', seat),
  move: (m) => typeof m.l === 'boolean' && typeof m.r === 'boolean' && optional(m, 'seatId', seat),
  act: (m) => action(m.a) && optional(m, 'seatId', seat) && optional(m, 'view', validView),
  actup: (m) => action(m.a) && optional(m, 'seatId', seat),
  leaveMatch: () => true,
  startMatch: () => true,
  finishMatch: () => true,
  resetMatch: () => true,
  leave: () => true,
};

// This boundary rejects JSON primitives and malformed fields before any game
// or profile mutation. Unknown message types (including prototype keys) fail.
export function parseClientMessage(raw, isBinary = false) {
  if (isBinary || Buffer.byteLength(raw) > MAX_MESSAGE_BYTES) return null;
  let msg;
  try { msg = JSON.parse(raw); } catch { return null; }
  if (!record(msg) || typeof msg.t !== 'string' || !Object.hasOwn(validators, msg.t)) return null;
  return validators[msg.t](msg) ? msg : null;
}
