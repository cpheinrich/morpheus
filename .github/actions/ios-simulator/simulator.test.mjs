import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanup, ownedDevices, selectDestination } from './simulator.mjs';
const name = 'Morpheus CI 12345678-abcd-abcd-abcd-123456789abc';
const device = { name: 'iPhone 17 Pro', isAvailable: true, deviceTypeIdentifier: 'iphone', udid: 'base' };
const inventory = { devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-26-5': [device] } };
test('destination selection supports pinned OS, latest, id and excludes unavailable devices', () => {
  for (const destination of ['name=iPhone 17 Pro,OS=26.5', 'OS=latest,name=iPhone 17 Pro', 'id=base']) assert.deepEqual(selectDestination(inventory, destination).device, device);
  assert.throws(() => selectDestination(inventory, 'name=iPhone 17 Pro,OS=26.6'), /No available/);
  assert.throws(() => selectDestination(inventory, 'name=iPhone 17 Pro,arch=arm64'), /must use/);
  assert.throws(() => selectDestination({ devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-26-5': [{ ...device, isAvailable: false }] } }, 'id=base'), /No available/);
});
test('cleanup owns only exact unique base and its XCTest worker clones', () => {
  const names = [name, `Clone 1 of ${name}`, `Clone 2 of ${name}`, `${name}-other`, `Clone 1 of ${name}-other`, 'iPhone 17 Pro', 'Evo QA abc'];
  assert.deepEqual(ownedDevices({ devices: { ios: names.map(name => ({ name })) } }, name).map(d => d.name), names.slice(0, 3));
  assert.throws(() => ownedDevices(inventory, 'iPhone 17 Pro'), /Invalid/);
});
test('post shuts down booted devices, deletes shutdown devices, and preserves unrelated ones', () => {
  const devices = [{ name, udid: 'base', state: 'Booted' }, { name: `Clone 1 of ${name}`, udid: 'clone', state: 'Shutdown' }, { name: 'user device', udid: 'user', state: 'Booted' }];
  const calls = [];
  cleanup(name, (...args) => { calls.push(args); return JSON.stringify({ devices: { ios: args[0] === '--set' ? [] : devices } }); });
  assert.deepEqual(calls, [['list', 'devices', '-j'], ['shutdown', 'base'], ['delete', 'base'], ['delete', 'clone'], ['--set', 'testing', 'list', 'devices', '-j']]);
});
test('partial cleanup attempts remaining devices and reports failure', () => {
  const calls = [];
  assert.throws(() => cleanup(name, (...args) => {
    calls.push(args);
    if (args[0] === '--set') return JSON.stringify({ devices: {} });
    if (args[0] === 'delete' && args[1] === 'bad') throw Error('delete failed');
    return JSON.stringify({ devices: { ios: [{ name, udid: 'bad', state: 'Booted' }, { name: `Clone 1 of ${name}`, udid: 'good', state: 'Shutdown' }] } });
  }), /Failed to clean up 1/);
  assert.ok(calls.some(a => a[0] === 'delete' && a[1] === 'good'));
});
test('post is idempotent after devices have already been removed', () => {
  const calls = [];
  cleanup(name, (...args) => { calls.push(args); return JSON.stringify({ devices: {} }); });
  assert.deepEqual(calls, [['list', 'devices', '-j'], ['--set', 'testing', 'list', 'devices', '-j']]);
});
test('workflow routes builds/tests through owned destination and registers unconditional post', () => {
  const workflow = readFileSync(new URL('../../workflows/ios-ci.yml', import.meta.url), 'utf8');
  const action = readFileSync(new URL('./action.yml', import.meta.url), 'utf8');
  assert.match(workflow, /uses: cpheinrich\/morpheus\/\.github\/actions\/ios-simulator@main/);
  assert.equal((workflow.match(/MORPHEUS_IOS_DESTINATION:-\$DESTINATION/g) ?? []).length, 3);
  assert.match(action, /post: post.mjs\n  post-if: always\(\)/);
  const main = readFileSync(new URL('./main.mjs', import.meta.url), 'utf8');
  assert.ok(main.indexOf('appendFileSync(process.env.GITHUB_STATE') < main.indexOf("sim('create'"));
});

test('parallel XCTest workers are discovered and removed in the testing device set', () => {
  const calls = [];
  cleanup(name, (...args) => {
    calls.push(args);
    const testing = args[0] === '--set';
    if (args.includes('list')) return JSON.stringify({ devices: { ios: testing ? [
      { name: `Clone 1 of ${name}`, udid: 'worker', state: 'Booted' },
      { name: 'Clone 1 of another job', udid: 'other-worker', state: 'Booted' },
    ] : [{ name, udid: 'base', state: 'Shutdown' }] } });
  });
  assert.deepEqual(calls, [
    ['list', 'devices', '-j'], ['delete', 'base'],
    ['--set', 'testing', 'list', 'devices', '-j'],
    ['--set', 'testing', 'shutdown', 'worker'],
    ['--set', 'testing', 'delete', 'worker'],
  ]);
});
test('an unreadable default set does not skip cleanup of testing workers', () => {
  const calls = [];
  assert.throws(() => cleanup(name, (...args) => {
    calls.push(args);
    if (args[0] === 'list') throw Error('default inventory failed');
    if (args.includes('list')) return JSON.stringify({ devices: { ios: [{ name: `Clone 2 of ${name}`, udid: 'worker', state: 'Shutdown' }] } });
  }), /default inventory failed/);
  assert.deepEqual(calls.at(-1), ['--set', 'testing', 'delete', 'worker']);
});

test('shutdown state races cannot skip owned deletion in either device set', () => {
  const calls = [];
  cleanup(name, (...args) => {
    calls.push(args);
    const testing = args[0] === '--set';
    const command = args[testing ? 2 : 0];
    if (command === 'list') return JSON.stringify({ devices: { ios: [
      { name: testing ? `Clone 1 of ${name}` : name, udid: testing ? 'worker' : 'base', state: 'Booted' },
      { name: 'user device', udid: 'user', state: 'Booted' },
    ] } });
    if (command === 'shutdown') throw Error('current state: Shutdown');
  });
  assert.deepEqual(calls, [
    ['list', 'devices', '-j'], ['shutdown', 'base'], ['delete', 'base'],
    ['--set', 'testing', 'list', 'devices', '-j'],
    ['--set', 'testing', 'shutdown', 'worker'], ['--set', 'testing', 'delete', 'worker'],
  ]);
});
