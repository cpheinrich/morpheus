import { execFileSync } from 'node:child_process';
export const sim = (...args) => execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8', timeout: 120000 }).trim();

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

export function ownedDevices(inventory, name) {
  if (!/^Morpheus CI [a-f0-9-]{36}$/.test(name)) throw Error('Invalid simulator ownership name.');
  return Object.values(inventory.devices).flat().filter(d => d.name === name || new RegExp(`^Clone [0-9]+ of ${name}$`).test(d.name));
}

export function cleanup(name, command = sim) {
  const errors = [];
  // Xcode keeps parallel workers in XCTestDevices, not the default device set.
  // Carry the selector through every command so a worker UDID is resolved there.
  for (const selector of [[], ['--set', 'testing']]) {
    let devices;
    try { devices = ownedDevices(JSON.parse(command(...selector, 'list', 'devices', '-j')), name); }
    catch (error) { errors.push(error); continue; }
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
