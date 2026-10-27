export function roundRegistrationKey(match) {
  const roundId = Number(match?.roundId);
  return match?.id && Number.isSafeInteger(roundId) && roundId > 0 ? `${match.id}:${roundId}` : '';
}

export function claimRoundRegistration(registrations, match) {
  const key = roundRegistrationKey(match);
  if (!key || registrations.has(key)) return false;
  registrations.add(key);
  return true;
}

export function clearRoundRegistration(registrations, match) {
  const key = roundRegistrationKey(match);
  if (key) registrations.delete(key);
}
