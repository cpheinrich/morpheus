import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { sim, selectDestination } from './simulator.mjs';
try {
  const { device, runtime } = selectDestination(JSON.parse(sim('list', 'devices', 'available', '-j')), process.env.INPUT_DESTINATION);
  const name = `Morpheus CI ${randomUUID()}`;
  // Save before create: post can recover a device even if creation is interrupted.
  appendFileSync(process.env.GITHUB_STATE, `simulator_name=${name}\n`);
  // A clean device of the same type avoids copying data from a user's simulator.
  const udid = sim('create', name, device.deviceTypeIdentifier, runtime);
  if (!/^[A-Fa-f0-9-]{36}$/.test(udid)) throw Error('simctl returned an invalid device identifier.');
  appendFileSync(process.env.GITHUB_ENV, `MORPHEUS_IOS_DESTINATION=id=${udid}\n`);
  console.log(`Using owned simulator ${name} (${udid}).`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
