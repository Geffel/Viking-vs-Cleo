export function normalizeProfileId(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const profileId = Number(value);
  return Number.isSafeInteger(profileId) && profileId > 0 ? profileId : null;
}

export function resolveProfileReference(ref, getProfileById) {
  const profileId = normalizeProfileId(ref?.profileId);
  return profileId === null ? null : getProfileById(profileId);
}

export function applyKillFeedToProfiles(feed, getProfileById) {
  let dirty = false;
  for (const kill of feed ?? []) {
    const killerId = normalizeProfileId(kill?.killerProfileId);
    const victimId = normalizeProfileId(kill?.victimProfileId);
    if (killerId === null || victimId === null || killerId === victimId) continue;

    const killer = getProfileById(killerId);
    const victim = getProfileById(victimId);
    if (!killer || !victim) continue;

    killer.killsAgainst[victimId] = (killer.killsAgainst[victimId] ?? 0) + 1;
    victim.deathsBy[killerId] = (victim.deathsBy[killerId] ?? 0) + 1;
    dirty = true;
  }
  return dirty;
}
