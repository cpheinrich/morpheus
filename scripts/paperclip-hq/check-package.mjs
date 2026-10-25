import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Exercise the upload boundary outside the repository and its workspace/toolchain.
const source = fileURLToPath(new URL('.', import.meta.url));
const root = await mkdtemp(join(tmpdir(), 'hq-package-'));
function run(cwd, command, args, env = {}) {
  const result = spawnSync(command, args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 120000 });
  if (result.error || result.status !== 0) throw new Error(`Package check failed: ${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`, { cause: result.error });
}
try {
  const development = join(root, 'development'), production = join(root, 'production');
  await mkdir(development); await mkdir(production);
  const manifests = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'];
  for (const name of [...manifests, 'tsconfig.json', ...(await readdir(source)).filter(name => name.endsWith('.ts'))]) await cp(join(source, name), join(development, name));
  // Fresh stores prevent a prior approved build's side effects from masking policy.
  run(development, 'pnpm', ['install', '--frozen-lockfile', '--store-dir', join(root, 'dev-store')]);
  const manifest = JSON.parse(await readFile(join(development, 'package.json'), 'utf8'));
  assert.equal(manifest.devDependencies.typescript, '5.9.3');
  assert.equal(manifest.devDependencies['@types/node'], '22.20.1');
  assert.equal(manifest.scripts['gcp-build'], '');
  run(development, 'pnpm', ['run', 'build']);
  for (const name of manifests) await cp(join(source, name), join(production, name));
  await cp(join(development, 'lib'), join(production, 'lib'), { recursive: true });
  run(production, 'pnpm', ['install', '--prod', '--frozen-lockfile', '--store-dir', join(root, 'prod-store')]);
  await assert.rejects(readFile(join(production, 'node_modules/typescript/package.json')), { code: 'ENOENT' });
  // No source/compiler in this upload. Definition analysis must need no credentials or RPCs.
  run(production, process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    const handlers = await import('./lib/entry.js');
    assert.deepEqual(Object.keys(handlers).sort(), ['hqBeginApply','hqClaim','hqComplete','hqEnqueue','hqInspect','hqPending','hqPublish','hqRead','hqSnapshot'].sort());
  `], { GCLOUD_PROJECT: 'demo-morpheus-hq', MORPHEUS_HQ_SETTINGS_JSON: JSON.stringify({ companyId: '11111111-1111-4111-8111-111111111111', controllerId: 'fixture', connectorUid: 'connector', profiles: ['fixture'] }) });
  console.log('Standalone development build and plain production install/compiled callable analysis passed; no dependency scripts, cloud deployment or native workers.');
} finally { await rm(root, { recursive: true, force: true }); }
