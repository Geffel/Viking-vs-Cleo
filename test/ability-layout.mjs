import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
};

const {
  abilityForPosition,
  abilityOrder,
  moveAbility,
  positionForAbility,
  setAbilityOrderOwner,
} = await import('../public/js/ability-layout.js');

setAbilityOrderOwner(101);
assert.deepEqual(abilityOrder('cleo'), ['a1', 'a2', 'a3', 'a4', 'a5']);
assert.deepEqual(moveAbility('cleo', 'a1', 'a3'), ['a3', 'a2', 'a1', 'a4', 'a5']);
assert.equal(abilityForPosition('cleo', 'a1'), 'a3');
assert.equal(abilityForPosition('cleo', 'a3'), 'a1');
assert.equal(positionForAbility('cleo', 'a1'), 'a3');

// Each character keeps an independent arrangement.
assert.deepEqual(abilityOrder('viking'), ['a1', 'a2', 'a3', 'a4', 'a5']);
assert.deepEqual(moveAbility('viking', 'a5', 'a2'), ['a1', 'a5', 'a3', 'a4', 'a2']);
assert.deepEqual(abilityOrder('cleo'), ['a3', 'a2', 'a1', 'a4', 'a5']);

// A second account in the same browser gets independent layouts.
setAbilityOrderOwner(202);
assert.deepEqual(abilityOrder('cleo'), ['a1', 'a2', 'a3', 'a4', 'a5']);
assert.deepEqual(moveAbility('cleo', 'a5', 'a1'), ['a5', 'a2', 'a3', 'a4', 'a1']);
setAbilityOrderOwner(101);
assert.deepEqual(abilityOrder('cleo'), ['a3', 'a2', 'a1', 'a4', 'a5']);

console.log('ABILITY LAYOUT TESTS OK');
