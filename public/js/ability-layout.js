import { ABILITY_SLOTS, TEAM_IDS } from '../../shared/constants.js';

// The server keeps abilities on stable action ids (a1-a5). This module only
// decides which hotbar position each action occupies. Keybinds belong to the
// position, while cooldowns and press/release messages follow the ability.
const STORAGE_KEY = 'vvc.abilityOrder';
const MIGRATION_OWNER_KEY = `${STORAGE_KEY}.migrationOwner`;
const listeners = new Set();
let currentOwner = 'browser';
let current = load(currentOwner);

// A browser can host more than one game account. Switching profile swaps the
// complete layout store instead of letting the accounts share localStorage.
export function setAbilityOrderOwner(profileId) {
  const nextOwner = ownerKey(profileId);
  if (nextOwner === currentOwner) return;
  currentOwner = nextOwner;
  current = load(currentOwner);
  for (const team of TEAM_IDS) {
    for (const listener of listeners) listener(team, abilityOrder(team));
  }
}

export function abilityOrder(team) {
  return [...(current[cleanTeam(team)] ?? ABILITY_SLOTS)];
}

export function abilityForPosition(team, position) {
  const index = ABILITY_SLOTS.indexOf(position);
  return index < 0 ? position : abilityOrder(team)[index] ?? position;
}

export function positionForAbility(team, abilitySlot) {
  const index = abilityOrder(team).indexOf(abilitySlot);
  return index < 0 ? abilitySlot : ABILITY_SLOTS[index];
}

export function moveAbility(team, abilitySlot, targetPosition) {
  const id = cleanTeam(team);
  const order = abilityOrder(id);
  const from = order.indexOf(abilitySlot);
  const to = ABILITY_SLOTS.indexOf(targetPosition);
  if (from < 0 || to < 0 || from === to) return order;

  [order[from], order[to]] = [order[to], order[from]];
  current = { ...current, [id]: order };
  persist();
  for (const listener of listeners) listener(id, [...order]);
  return [...order];
}

export function onAbilityOrderChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function load() {
  try {
    const scoped = localStorage.getItem(storageKey(currentOwner));
    if (scoped) return sanitize(JSON.parse(scoped));

    // Give a pre-account-scoping layout to the first profile that opens it.
    // Later accounts in the same browser start with their own default order.
    if (currentOwner !== 'browser') {
      const legacy = localStorage.getItem(STORAGE_KEY);
      const migrationOwner = localStorage.getItem(MIGRATION_OWNER_KEY);
      if (legacy && (!migrationOwner || migrationOwner === currentOwner)) {
        localStorage.setItem(MIGRATION_OWNER_KEY, currentOwner);
        const migrated = sanitize(JSON.parse(legacy));
        localStorage.setItem(storageKey(currentOwner), JSON.stringify(migrated));
        return migrated;
      }
    }
    return sanitize(null);
  } catch {
    return sanitize(null);
  }
}

function persist() {
  try {
    localStorage.setItem(storageKey(currentOwner), JSON.stringify(current));
  } catch {
    // Private browsing can reject storage; the order still lasts this session.
  }
}

function sanitize(raw) {
  const clean = {};
  for (const team of TEAM_IDS) {
    const saved = Array.isArray(raw?.[team]) ? raw[team] : [];
    const unique = saved.filter((slot, index) => ABILITY_SLOTS.includes(slot) && saved.indexOf(slot) === index);
    clean[team] = [...unique, ...ABILITY_SLOTS.filter((slot) => !unique.includes(slot))];
  }
  return clean;
}

function cleanTeam(team) {
  return TEAM_IDS.includes(team) ? team : TEAM_IDS[0];
}

function ownerKey(profileId) {
  const id = Math.max(0, Math.floor(Number(profileId) || 0));
  return id ? `profile-${id}` : 'browser';
}

function storageKey(owner) {
  return owner === 'browser' ? STORAGE_KEY : `${STORAGE_KEY}.${owner}`;
}
