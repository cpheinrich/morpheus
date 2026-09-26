import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
export const sim = (...args) => execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8', timeout: 120000 }).trim();

const ownedJobPattern = /^Morpheus CI [a-f0-9-]{36}$/;
const ownedTemplatePattern = /^Morpheus CI Template [A-Za-z0-9.-]+ [A-Za-z0-9.-]+$/;
const deviceIdentifierPattern = /^[A-Fa-f0-9-]{36}$/;
const wait = milliseconds => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);

function processIsAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
}

function lockOwner(path) {
  try {
    const owner = JSON.parse(readFileSync(join(path, 'owner.json'), 'utf8'));
    return Number.isInteger(owner.pid) && Number.isFinite(owner.createdAt) ? owner : undefined;
  } catch { return undefined; }
}

export function withTemplateLock(work, options = {}) {
  const path = options.path ?? join(homedir(), 'Library', 'Caches', 'Morpheus', 'ios-simulator-template.lock');
  const acquireTimeoutMs = options.acquireTimeoutMs ?? 300000;
  const staleAfterMs = options.staleAfterMs ?? 300000;
  const ownerlessGraceMs = options.ownerlessGraceMs ?? 2000;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? wait;
  const alive = options.alive ?? processIsAlive;
  const startedAt = now();
  mkdirSync(dirname(path), { recursive: true });

  while (true) {
    try {
      mkdirSync(path);
      try { writeFileSync(join(path, 'owner.json'), JSON.stringify({ pid: process.pid, createdAt: now() }), { flag: 'wx' }); }
      catch (error) { rmSync(path, { recursive: true, force: true }); throw error; }
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = lockOwner(path);
      let orphaned = owner ? !alive(owner.pid) || now() - owner.createdAt > staleAfterMs : false;
      if (!owner) {
        try { orphaned = now() - statSync(path).mtimeMs > ownerlessGraceMs; }
        catch (statError) { if (statError.code !== 'ENOENT') throw statError; }
      }
      if (orphaned) {
        rmSync(path, { recursive: true, force: true });
        continue;
      }
      if (now() - startedAt >= acquireTimeoutMs) throw Error(`Timed out waiting for iOS simulator template lock: ${path}`);
      sleep(250);
    }
  }

  try { return work(); }
  finally { rmSync(path, { recursive: true, force: true }); }
}

export function selectDestination(inventory, destination) {
  const parts = Object.fromEntries(destination.split(',').map(part => {
    const at = part.indexOf('=');
    if (at < 1) throw Error(`Invalid simulator destination: ${destination}`);
    return [part.slice(0, at).trim(), part.slice(at + 1).trim()];
  }));
  if (Object.keys(parts).some(k => !['platform', 'id', 'name', 'OS'].includes(k)) || (!parts.id && !parts.name)) throw Error('Simulator destination must use id or name and OS.');
  const matches = Object.entries(inventory.devices).flatMap(([runtime, devices]) => devices.map(device => ({ runtime, device })))
    .filter(({ runtime, device }) => runtime.includes('.iOS-') && device.isAvailable && (parts.id ? device.udid === parts.id : device.name === parts.name))
    .filter(({ runtime }) => !parts.OS || parts.OS === 'latest' || runtime === `com.apple.CoreSimulator.SimRuntime.iOS-${parts.OS.replaceAll('.', '-')}`)
    .sort((a, b) => b.runtime.localeCompare(a.runtime, undefined, { numeric: true }));
  if (!matches[0]?.device.deviceTypeIdentifier) throw Error(`No available simulator matches ${destination}`);
  return matches[0];
}

export function simulatorTemplateName({ device, runtime }) {
  const deviceType = device.deviceTypeIdentifier?.split('.').at(-1);
  const runtimeName = runtime?.split('.').at(-1);
  if (!deviceType || !runtimeName) throw Error('Selected simulator cannot form a safe template name.');
  const name = `Morpheus CI Template ${deviceType} ${runtimeName}`;
  if (!ownedTemplatePattern.test(name)) throw Error('Selected simulator cannot form a safe template name.');
  return name;
}

export function ownedTemplateDevices(inventory) {
  return Object.entries(inventory.devices).flatMap(([runtime, devices]) => devices.map(device => ({ runtime, device })))
    .filter(({ device }) => ownedTemplatePattern.test(device.name));
}

function removeDevice(device, command) {
  if (device.state !== 'Shutdown') {
    try { command('shutdown', device.udid); }
    catch (error) { console.warn(`Simulator template shutdown: ${error.message}`); }
  }
  command('delete', device.udid);
}

function markerMatches(path, expected) {
  try { return readFileSync(path, 'utf8') === expected; }
  catch { return false; }
}

export function cloneFromWarmedTemplate(selected, jobName, command = sim, options = {}) {
  if (!ownedJobPattern.test(jobName)) throw Error('Invalid simulator ownership name.');
  const name = simulatorTemplateName(selected);
  const inventory = JSON.parse(command('list', 'devices', '-j'));
  const templates = ownedTemplateDevices(inventory);
  const matching = templates.filter(({ runtime, device }) => runtime === selected.runtime
    && device.deviceTypeIdentifier === selected.device.deviceTypeIdentifier && device.isAvailable && device.dataPath
    && ['Shutdown', 'Booted'].includes(device.state));
  let template = matching[0];

  // The template is never a test destination. Keep exactly one compatible source
  // so runtime upgrades and interrupted earlier attempts cannot accumulate devices.
  for (const entry of templates) {
    if (template && entry.device.udid === template.device.udid) continue;
    removeDevice(entry.device, command);
  }

  if (!template) {
    const udid = command('create', name, selected.device.deviceTypeIdentifier, selected.runtime);
    if (!deviceIdentifierPattern.test(udid)) throw Error('simctl returned an invalid template device identifier.');
    const refreshed = JSON.parse(command('list', 'devices', '-j'));
    template = ownedTemplateDevices(refreshed).find(({ runtime, device }) => runtime === selected.runtime && device.udid === udid);
    if (!template?.device.dataPath) throw Error('Created simulator template is missing from the device inventory.');
  }

  const developerDir = options.developerDir ?? process.env.DEVELOPER_DIR ?? '';
  const marker = JSON.stringify({ version: 1, developerDir });
  const markerPath = join(template.device.dataPath, '.morpheus-ci-template.json');
  if (!markerMatches(markerPath, marker)) {
    if (template.device.state !== 'Shutdown') command('shutdown', template.device.udid);
    command('boot', template.device.udid);
    const errors = [];
    try { command('bootstatus', template.device.udid, '-b'); }
    catch (error) { errors.push(error); }
    try { command('shutdown', template.device.udid); }
    catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, `Failed to warm simulator template ${name}.`);
    writeFileSync(markerPath, marker);
  } else if (template.device.state !== 'Shutdown') {
    command('shutdown', template.device.udid);
  }

  return command('clone', template.device.udid, jobName);
}

export function createOwnedSimulator(selected, jobName, persistent, command = sim, options = {}) {
  if (!persistent) return command('create', jobName, selected.device.deviceTypeIdentifier, selected.runtime);
  return withTemplateLock(() => cloneFromWarmedTemplate(selected, jobName, command, options), options.lock);
}

export function shutdownTemplate(name, command = sim) {
  if (!ownedTemplatePattern.test(name)) throw Error('Invalid simulator template ownership name.');
  const templates = ownedTemplateDevices(JSON.parse(command('list', 'devices', '-j')))
    .filter(({ device }) => device.name === name);
  for (const { device } of templates) if (device.state !== 'Shutdown') command('shutdown', device.udid);
}

export function ownedDevices(inventory, name) {
  if (!ownedJobPattern.test(name)) throw Error('Invalid simulator ownership name.');
  return Object.values(inventory.devices).flat().filter(d => d.name === name || new RegExp(`^Clone [0-9]+ of ${name}$`).test(d.name));
}

export function cleanup(name, command = sim) {
  const errors = [];
  // Xcode keeps parallel workers in XCTestDevices, not the default device set.
  // Carry the selector through every command so a worker UDID is resolved there.
  for (const selector of [[], ['--set', 'testing']]) {
    let devices;
    try { devices = ownedDevices(JSON.parse(command(...selector, 'list', 'devices', '-j')), name); }
    catch (error) {
      // Serial tests on a fresh runner never create XCTestDevices. Absence is empty;
      // other inventory failures must remain visible rather than hiding leaked workers.
      if (selector.length && /^Provided set path does not exist: /m.test(String(error.stderr ?? ''))) continue;
      errors.push(error);
      continue;
    }
    for (const device of devices) {
      // XCTest can finish shutdown between inventory and this command.
      // Deletion is the cleanup invariant, so attempt it even if shutdown fails.
      try { if (device.state !== 'Shutdown') command(...selector, 'shutdown', device.udid); }
      catch (error) { console.warn(`Simulator shutdown: ${error.message}`); }
      try {
        command(...selector, 'delete', device.udid);
        console.log(`Removed owned simulator ${device.name} (${device.udid}).`);
      } catch (error) { errors.push(error); }
    }
  }
  if (errors.length) throw new AggregateError(errors, `Failed to clean up ${errors.length} simulator device(s)/set(s): ${errors.map(e => e.message).join('; ')}`);
}
