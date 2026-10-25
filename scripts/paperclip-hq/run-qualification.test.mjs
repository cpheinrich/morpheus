import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'hq-mode-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = join(root, 'scripts/paperclip-hq');
  await mkdir(dir, { recursive: true });
  const script = join(dir, 'run-qualification.mjs'), called = join(root, 'called.json');
  await copyFile(new URL('./run-qualification.mjs', import.meta.url), script);
  const cli = join(root, 'fake-cli.js');
  await writeFile(cli, `require('node:fs').writeFileSync(${JSON.stringify(called)}, JSON.stringify({args:process.argv.slice(2),settings:require('node:fs').readFileSync(${JSON.stringify(join(dir, '.env.local'))},'utf8')}));`);
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, FIREBASE_CLI: cli } });
  return { root, dir, called, run };
}
test('qualification requires one explicit mode before invoking an emulator or provider', async t => {
  const f = await fixture(t);
  for (const args of [[], ['--fixture', '--native-target', 'missing.json']]) {
    const result = f.run(...args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Choose exactly/);
  }
  await assert.rejects(access(f.called), { code: 'ENOENT' });
  await writeFile(join(f.root, 'invalid.json'), JSON.stringify({ version: 1, authorization: 'unapproved', profiles: [] }));
  const invalid = f.run('--native-target', join(f.root, 'invalid.json'));
  assert.equal(invalid.status, 1); assert.match(invalid.stderr, /Explicit bounded native target required/);
  await assert.rejects(access(f.called), { code: 'ENOENT' });
});
test('fixture mode selects only the provider-free script and removes its exact temporary settings', async t => {
  const f = await fixture(t);
  assert.equal(f.run('--fixture').status, 0);
  const value = JSON.parse(await readFile(f.called, 'utf8'));
  assert.deepEqual(value.args, ['emulators:exec', '--project', 'demo-morpheus-hq', '--only', 'auth,firestore,functions', '--config', 'scripts/paperclip-hq/firebase.json', 'node --test scripts/paperclip-hq/qualification.mjs']);
  assert.equal(value.settings, 'MORPHEUS_HQ_SETTINGS_JSON=\'{"companyId":"11111111-1111-4111-8111-111111111111","controllerId":"mbp-v1","connectorUid":"connector","profiles":["mini-claude"]}\'\n');
  await assert.rejects(access(join(f.dir, '.env.local')), { code: 'ENOENT' });
});
test('existing operator settings are preserved and prevent any child launch', async t => {
  const f = await fixture(t), path = join(f.dir, '.env.local');
  await writeFile(path, 'operator-owned-settings\n');
  assert.equal(f.run('--fixture').status, 1);
  assert.equal(await readFile(path, 'utf8'), 'operator-owned-settings\n');
  await assert.rejects(access(f.called), { code: 'ENOENT' });
});
