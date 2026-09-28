import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createOwnedSimulator, sim, selectDestination, simulatorTemplateName } from './simulator.mjs';
try {
  const selected = selectDestination(JSON.parse(sim('list', 'devices', 'available', '-j')), process.env.INPUT_DESTINATION);
  const name = `Morpheus CI ${randomUUID()}`;
  const persistent = process.env.INPUT_PERSISTENT === 'true';
  // Save before create: post can recover a device even if creation is interrupted.
  appendFileSync(process.env.GITHUB_STATE, `simulator_name=${name}\n`);
  if (persistent) appendFileSync(process.env.GITHUB_STATE, `simulator_template=${simulatorTemplateName(selected)}\n`);
  // Persistent runners clone a dedicated warmed template. Ephemeral hosted
  // runners keep the simpler pristine-device path because nothing is reusable.
  const udid = createOwnedSimulator(selected, name, persistent);
  if (!/^[A-Fa-f0-9-]{36}$/.test(udid)) throw Error('simctl returned an invalid device identifier.');
  appendFileSync(process.env.GITHUB_ENV, `MORPHEUS_IOS_DESTINATION=id=${udid}\n`);
  console.log(`Using owned simulator ${name} (${udid})${persistent ? ' cloned from the warmed template' : ''}.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
