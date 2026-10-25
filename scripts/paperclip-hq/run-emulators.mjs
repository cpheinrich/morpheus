import { spawn } from 'node:child_process';
import { writeFile, rm, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
const repo = resolve(directory, '../..');
const envPath = join(directory, '.env.local');
const settings = { companyId: '11111111-1111-4111-8111-111111111111', controllerId: 'mbp-v1', connectorUid: 'connector', profiles: ['codex-mini'] };
const envText = `MORPHEUS_HQ_SETTINGS_JSON='${JSON.stringify(settings)}'\n`;
let ownsEnv = false;
try {
  // Refuse an existing operator env file; never replace real deployment configuration.
  await writeFile(envPath, envText, { flag: 'wx', mode: 0o600 }); ownsEnv = true;
  const cli = process.env.FIREBASE_CLI || 'firebase';
  const args = ['emulators:exec', '--project', 'demo-morpheus-hq', '--only', 'auth,firestore,functions', '--config', 'scripts/paperclip-hq/firebase.json', 'node --test scripts/paperclip-hq/emulator.mjs'];
  const child = spawn(cli.endsWith('.js') ? process.execPath : cli, cli.endsWith('.js') ? [cli, ...args] : args, { cwd: repo, env: process.env, stdio: 'inherit' });
  process.exitCode = await new Promise((resolveCode, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolveCode(signal ? 1 : code ?? 1)); });
} finally {
  if (ownsEnv && await readFile(envPath, 'utf8') === envText) await rm(envPath);
}
