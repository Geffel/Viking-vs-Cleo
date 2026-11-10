import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
};

const path = new URL('../public/js/keybinds.js', import.meta.url);
const original = await readFile(path, 'utf8');
const constants = `
  const MOVE_BINDS = [
    { slot: 'left', code: 'KeyA' },
    { slot: 'right', code: 'KeyD' },
  ];
  const MELEE_BINDS = [];
  const ABILITY_BINDS = [{ slot: 'a1', code: 'KeyQ' }];
  const BIND_SLOTS = ['left', 'right', 'a1'];
  const GAMEPAD_BINDS = {};
  const PAD_BUTTONS = [];
`;
const source = original.replace(/^import .*?;$/m, constants);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { canBind, codeMap, keyLabel, mouseCode, saveBindings } = await import(moduleUrl);

assert.equal(mouseCode(0), 'Mouse0');
assert.equal(mouseCode(31), 'Mouse31');
assert.equal(mouseCode(32), null);
assert.equal(canBind('Mouse0'), true);
assert.equal(canBind('Mouse31'), true);
assert.equal(canBind('Mouse32'), false);
assert.equal(canBind('Mouse999'), false);
assert.equal(keyLabel('Mouse0'), 'LMB');
assert.equal(keyLabel('Mouse2'), 'RMB');
assert.equal(keyLabel('Mouse4'), 'Mouse 5');

const saved = saveBindings({
  left: { primary: 'Mouse0', pad: null },
  right: { primary: 'Mouse2', pad: null },
  a1: { primary: 'Mouse32', pad: null },
});
assert.equal(saved.left.primary, 'Mouse0');
assert.equal(saved.right.primary, 'Mouse2');
assert.equal(saved.a1.primary, null);
assert.deepEqual(codeMap(saved), { Mouse0: 'left', Mouse2: 'right' });

console.log('KEYBIND TESTS OK: keyboard and mouse bindings');
