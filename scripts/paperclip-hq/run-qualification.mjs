import { spawn } from 'node:child_process';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const directory = fileURLToPath(new URL('.', import.meta.url));
const repo = resolve(directory, '../..');
const { values } = parseArgs({ options: { fixture: { type: 'boolean' }, 'native-target': { type: 'string' } } });
if (Boolean(values.fixture) === Boolean(values['native-target'])) throw new Error('Choose exactly --fixture or --native-target FILE');
let target;
if (values['native-target']) {
  // No native configuration is inferred from the current browser, company or home.
  target = JSON.parse(await readFile(resolve(values['native-target']), 'utf8'));
  if (target.version !== 1 || target.authorization !== 'controlled-native-qualification' ||
      !Array.isArray(target.profiles) || target.profiles.length < 1 || target.profiles.length > 2 ||
      !['companyId', 'controllerId', 'connectorId', 'connectorUid', 'adminUid'].every(key => typeof target[key] === 'string' && target[key])) throw new Error('Explicit bounded native target required');
}
const settings = target ? { companyId: target.companyId, controllerId: target.controllerId, connectorUid: target.connectorUid, profiles: target.profiles.map(profile => profile.name) }
  : { companyId: '11111111-1111-4111-8111-111111111111', controllerId: 'mbp-v1', connectorUid: 'connector', profiles: ['mini-claude'] };
const envPath = join(directory, '.env.local');
const envText = `MORPHEUS_HQ_SETTINGS_JSON='${JSON.stringify(settings)}'\n`;
let ownsEnv = false;
try {
  await writeFile(envPath, envText, { flag: 'wx', mode: 0o600 }); ownsEnv = true;
  const cli = process.env.FIREBASE_CLI || 'firebase';
  const command = target ? 'node scripts/paperclip-hq/native.mjs' : 'node --test scripts/paperclip-hq/qualification.mjs';
  const args = ['emulators:exec', '--project', 'demo-morpheus-hq', '--only', 'auth,firestore,functions', '--config', 'scripts/paperclip-hq/firebase.json', command];
  const child = spawn(cli.endsWith('.js') ? process.execPath : cli, cli.endsWith('.js') ? [cli, ...args] : args, {
    cwd: repo, env: { ...process.env, ...(target ? { MORPHEUS_HQ_NATIVE_TARGET: resolve(values['native-target']) } : {}) }, stdio: 'inherit',
  });
  process.exitCode = await new Promise((done, reject) => { child.once('error', reject); child.once('exit', (code, signal) => done(signal ? 1 : code ?? 1)); });
} finally {
  if (ownsEnv && await readFile(envPath, 'utf8') === envText) await rm(envPath);
}
