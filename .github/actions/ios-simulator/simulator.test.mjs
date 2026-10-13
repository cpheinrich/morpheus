import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cleanup, cloneFromWarmedTemplate, createOwnedSimulator, ownedDevices, ownedTemplateDevices,
  selectDestination, shutdownTemplate, simulatorTemplateName,
} from './simulator.mjs';
const name = 'Morpheus CI 12345678-abcd-abcd-abcd-123456789abc';
const device = { name: 'iPhone 17 Pro', isAvailable: true, deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro', udid: 'base' };
const inventory = { devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-26-5': [device] } };
const selected = { runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-26-5', device };
const templateName = 'Morpheus CI Template iPhone-17-Pro iOS-26-5';
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
test('template ownership is deterministic and excludes user and job devices', () => {
  const names = [templateName, 'Morpheus CI Template iPhone 17 Pro iOS-26-5', name, 'iPhone 17 Pro'];
  const found = ownedTemplateDevices({ devices: { ios: names.map(name => ({ name })) } });
  assert.deepEqual(found.map(({ device }) => device.name), [templateName]);
  assert.equal(simulatorTemplateName(selected), templateName);
  assert.throws(() => simulatorTemplateName({ runtime: selected.runtime, device: {} }), /safe template/);
});
test('persistent destinations warm once, delete superseded templates and clone per job', t => {
  const root = mkdtempSync(join(tmpdir(), 'morpheus-simulator-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const templateUdid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const cloneUdid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const oldUdid = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const interruptedUdid = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  const devices = [
    device,
    { name: 'Morpheus CI Template iPhone-16-Pro iOS-18-0', udid: oldUdid, state: 'Booted', isAvailable: true, deviceTypeIdentifier: 'old', dataPath: join(root, 'old') },
    { name: templateName, udid: interruptedUdid, state: 'Creating', isAvailable: true, deviceTypeIdentifier: device.deviceTypeIdentifier, dataPath: join(root, 'interrupted') },
    { name: 'User QA', udid: 'user', state: 'Booted', isAvailable: true, deviceTypeIdentifier: 'user' },
  ];
  const calls = [];
  const command = (...args) => {
    calls.push(args);
    if (args[0] === 'list') return JSON.stringify({ devices: { [selected.runtime]: devices } });
    if (args[0] === 'create') {
      devices.push({ name: args[1], udid: templateUdid, state: 'Shutdown', isAvailable: true, deviceTypeIdentifier: args[2], dataPath: root });
      return templateUdid;
    }
    const target = devices.find(candidate => candidate.udid === args[1]);
    if (args[0] === 'boot') target.state = 'Booted';
    if (args[0] === 'shutdown') target.state = 'Shutdown';
    if (args[0] === 'delete') devices.splice(devices.indexOf(target), 1);
    if (args[0] === 'clone') return cloneUdid;
    return '';
  };
  const options = { developerDir: '/Applications/Xcode_26.6.app/Contents/Developer' };
  assert.equal(cloneFromWarmedTemplate(selected, name, command, options), cloneUdid);
  assert.ok(calls.some(call => call[0] === 'shutdown' && call[1] === oldUdid));
  assert.ok(calls.some(call => call[0] === 'delete' && call[1] === oldUdid));
  assert.ok(calls.some(call => call[0] === 'delete' && call[1] === interruptedUdid));
  assert.ok(calls.some(call => call[0] === 'bootstatus' && call[1] === templateUdid));
  assert.ok(calls.some(call => call[0] === 'clone' && call[1] === templateUdid && call[2] === name));
  assert.ok(existsSync(join(root, '.morpheus-ci-template.json')));
  assert.ok(devices.some(candidate => candidate.name === 'User QA'));

  calls.length = 0;
  assert.equal(cloneFromWarmedTemplate(selected, name, command, options), cloneUdid);
  assert.equal(calls.filter(call => ['create', 'boot', 'bootstatus'].includes(call[0])).length, 0);
  assert.equal(calls.filter(call => call[0] === 'clone').length, 1);
});
test('ephemeral destinations still create a pristine device without a template', () => {
  const calls = [];
  const udid = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  assert.equal(createOwnedSimulator(selected, name, false, (...args) => { calls.push(args); return udid; }), udid);
  assert.deepEqual(calls, [['create', name, device.deviceTypeIdentifier, selected.runtime]]);
});
test('persistent destinations execute the clone helper under the macOS kernel lock', () => {
  const calls = [];
  const udid = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  const options = { lock: { path: '/tmp/morpheus-test.lock', execute: (file, args, spawnOptions) => {
    calls.push({ file, args, spawnOptions });
    return `${udid}\n`;
  } } };
  assert.equal(createOwnedSimulator(selected, name, true, undefined, options), udid);
  assert.equal(calls[0].file, '/usr/bin/lockf');
  assert.deepEqual(calls[0].args.slice(0, 5), ['-k', '-t', '300', '/tmp/morpheus-test.lock', process.execPath]);
  assert.match(calls[0].args[5], /\/locked\.mjs$/);
  assert.equal(calls[0].args[6], 'clone');
  assert.deepEqual(JSON.parse(calls[0].args[7]), selected);
  assert.equal(calls[0].args[8], name);
  assert.deepEqual(calls[0].spawnOptions, { encoding: 'utf8' });
});
test('a failed warm shuts the template down and never clones it', t => {
  const root = mkdtempSync(join(tmpdir(), 'morpheus-simulator-failure-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const template = { name: templateName, udid: 'dddddddd-dddd-dddd-dddd-dddddddddddd', state: 'Shutdown', isAvailable: true, deviceTypeIdentifier: device.deviceTypeIdentifier, dataPath: root };
  const calls = [];
  assert.throws(() => cloneFromWarmedTemplate(selected, name, (...args) => {
    calls.push(args);
    if (args[0] === 'list') return JSON.stringify({ devices: { [selected.runtime]: [device, template] } });
    if (args[0] === 'boot') template.state = 'Booted';
    if (args[0] === 'bootstatus') throw Error('boot failed');
    if (args[0] === 'shutdown') template.state = 'Shutdown';
    return '';
  }), /Failed to warm/);
  assert.equal(template.state, 'Shutdown');
  assert.equal(calls.some(call => call[0] === 'clone'), false);
  assert.equal(existsSync(join(root, '.morpheus-ci-template.json')), false);
});
test('macOS kernel lock serializes concurrent owners and releases after a crash', { skip: process.platform !== 'darwin' }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'morpheus-simulator-lock-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const lock = join(root, 'template.lock');
  const log = join(root, 'order.log');
  const script = "const fs=require('node:fs');const label=process.argv[1],log=process.argv[2];fs.appendFileSync(log,label+'-start\\n');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,150);fs.appendFileSync(log,label+'-end\\n');";
  const run = (label, childScript = script) => new Promise(resolve => {
    const child = spawn('/usr/bin/lockf', ['-k', '-t', '5', lock, process.execPath, '-e', childScript, label, log]);
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', (code, signal) => resolve({ code, signal, stderr }));
  });
  const results = await Promise.all([run('a'), run('b')]);
  assert.deepEqual(results.map(result => result.code), [0, 0]);
  const order = readFileSync(log, 'utf8').trim().split('\n');
  assert.ok(['a-start,a-end,b-start,b-end', 'b-start,b-end,a-start,a-end'].includes(order.join(',')));

  const crashed = await run('crash', "process.kill(process.pid,'SIGKILL')");
  assert.notEqual(crashed.code, 0);
  const afterCrash = await run('after-crash');
  assert.equal(afterCrash.code, 0, afterCrash.stderr);
});
test('post recovery shuts down only the exact persistent template', () => {
  const calls = [];
  shutdownTemplate(templateName, (...args) => {
    calls.push(args);
    if (args[0] === 'list') return JSON.stringify({ devices: { ios: [
      { name: templateName, udid: 'template', state: 'Booted' },
      { name: `${templateName}-other`, udid: 'other', state: 'Booted' },
      { name: 'User QA', udid: 'user', state: 'Booted' },
    ] } });
  });
  assert.deepEqual(calls, [['list', 'devices', '-j'], ['shutdown', 'template']]);
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
  assert.match(workflow, /persistent: \$\{\{ runner\.environment == 'self-hosted' \}\}/);
  assert.match(action, /persistent:\n[\s\S]*default: "false"/);
  assert.match(action, /post: post.mjs\n  post-if: always\(\)/);
  const main = readFileSync(new URL('./main.mjs', import.meta.url), 'utf8');
  assert.ok(main.indexOf('appendFileSync(process.env.GITHUB_STATE') < main.indexOf('createOwnedSimulator(selected'));
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

test('an absent optional testing set is empty on a fresh serial runner', () => {
  const calls = [];
  cleanup(name, (...args) => {
    calls.push(args);
    if (args[0] === '--set') throw Object.assign(Error('simctl failed'), {
      stderr: Buffer.from("Using Parallel Testing Device Clones Device Set: '/Users/runner/Library/Developer/XCTestDevices'\nProvided set path does not exist: /Users/runner/Library/Developer/XCTestDevices\n"),
    });
    if (args[0] === 'list') return JSON.stringify({ devices: { ios: [{ name, udid: 'base', state: 'Shutdown' }] } });
  });
  assert.deepEqual(calls, [['list', 'devices', '-j'], ['delete', 'base'], ['--set', 'testing', 'list', 'devices', '-j']]);
});
test('testing-set permission errors and absent default inventory still fail cleanup', () => {
  for (const missingDefault of [false, true]) {
    assert.throws(() => cleanup(name, (...args) => {
      if (args[0] === '--set' || missingDefault) throw Object.assign(Error('inventory failed'), {
        stderr: missingDefault ? 'Provided set path does not exist: default' : 'Permission denied',
      });
      return JSON.stringify({ devices: {} });
    }), /inventory failed/);
  }
});
