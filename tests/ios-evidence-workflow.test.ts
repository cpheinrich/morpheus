import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
const exec = promisify(execFile);
type Step = { name?: string; run?: string; if?: string; with?: Record<string, unknown> };
const workflow = async () => load(await readFile(new URL('../.github/workflows/ios-ci.yml', import.meta.url), 'utf8')) as { jobs: { test: { steps: Step[] } } };
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'ios-evidence-'));
  for (const child of ['bin', 'results', 'logs']) await mkdir(join(dir, child));
  const env = { ...process.env, PATH: `${dir}/bin:${process.env.PATH}`, GITHUB_WORKSPACE: dir, RESULTS: `${dir}/results`, LOGS: `${dir}/logs`, ARG_LOG: `${dir}/argv`, PROJECT: 'App.xcodeproj', SCHEME: 'App', CONFIGURATION: 'Debug', SDK: 'iphonesimulator', PLATFORM: 'iOS Simulator', DESTINATION: 'id=test', SOURCE_PACKAGES: `${dir}/packages`, DERIVED_DATA: `${dir}/derived`, PARALLEL_TESTING: 'NO', MAXIMUM_PARALLEL_TESTING_WORKERS: '0', TEST_PLAN: '', SKIP_TESTING: '', TEST_ITERATIONS: '0', FIREBASE_EMULATORS: 'false', PRE_TEST_SCRIPT: '', ONLY_TESTING: '', TEST_SELECTION: '', TEST_EVIDENCE_SCRIPT: '' };
  async function binary(name: string, script: string) { const path = join(dir, 'bin', name); await writeFile(path, '#!/bin/bash\n'+script); await chmod(path, 0o755); }
  await binary('xcodebuild', 'printf "%s\\n" "$@" > "$ARG_LOG"\n');
  await binary('git', 'printf "%s\\n" "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"\n');
  await binary('xcrun', 'if [ "${FAIL_EXPORT:-0}" = 1 ]; then exit 7; fi\nprintf \'{"testNodes":[]}\\n\'\n');
  const steps = (await workflow()).jobs.test.steps;
  const run = (name: string) => exec('/bin/bash', ['-c', steps.find(s => s.name === name)!.run!], { cwd: dir, env });
  return {dir, env, run, steps};
}
describe('native selection and result evidence', () => {
  it('passes selected identifiers literally as separate arguments and preserves full defaults', async () => {
    const f = await fixture();
    try {
      await f.run('Run unit and UI tests');
      expect(await readFile(f.env.ARG_LOG,'utf8')).not.toContain('-only-testing:');
      f.env.ONLY_TESTING = 'AppTests\nAppUITests/Editor/testSave()\nAppUITests/$(touch injected)/test';
      await f.run('Run unit and UI tests');
      const args = (await readFile(f.env.ARG_LOG,'utf8')).trim().split('\n');
      expect(args.filter(a => a.startsWith('-only-testing:'))).toEqual(['-only-testing:AppTests','-only-testing:AppUITests/Editor/testSave()','-only-testing:AppUITests/$(touch injected)/test']);
      await expect(readFile(join(f.dir,'injected'))).rejects.toThrow();
    } finally { await rm(f.dir,{recursive:true,force:true}); }
  });
  it('retains the exact manifest and commit, runs the validator, and uploads after any result', async () => {
    const f = await fixture();
    try {
      await mkdir(join(f.env.RESULTS,'Tests.xcresult'));
      f.env.TEST_SELECTION = '{"tests":["$(touch injected)"],"version":1}';
      f.env.TEST_EVIDENCE_SCRIPT = 'validate.sh';
      await writeFile(join(f.dir,'validate.sh'), 'test -s "$RESULTS/tests.json" && test -s "$RESULTS/summary.json"\n');
      await f.run('Export complete test evidence');
      expect(await readFile(join(f.env.RESULTS,'selection.json'),'utf8')).toBe(f.env.TEST_SELECTION+'\n');
      expect(await readFile(join(f.env.RESULTS,'tested-sha.txt'),'utf8')).toBe('a'.repeat(40)+'\n');
      const upload = f.steps.find(s=>s.name==='Upload complete test evidence')!;
      expect(upload.if).toContain('always()');
      expect(upload.with?.path).toContain('*.json');
      await expect(readFile(join(f.dir,'injected'))).rejects.toThrow();
    } finally { await rm(f.dir,{recursive:true,force:true}); }
  });
  it('propagates validator failure even after XCTest success or absent results', async () => {
    const f = await fixture();
    try {
      f.env.TEST_EVIDENCE_SCRIPT = 'validate.sh';
      await writeFile(join(f.dir,'validate.sh'), 'exit 19\n');
      await expect(f.run('Export complete test evidence')).rejects.toMatchObject({code:19});
      await mkdir(join(f.env.RESULTS,'Tests.xcresult'));
      await expect(f.run('Export complete test evidence')).rejects.toMatchObject({code:19});
    } finally { await rm(f.dir,{recursive:true,force:true}); }
  });
  it('fails closed when structured result export fails', async () => {
    const f = await fixture();
    try {
      await mkdir(join(f.env.RESULTS,'Tests.xcresult'));
      Object.assign(f.env,{FAIL_EXPORT:'1'});
      await expect(f.run('Export complete test evidence')).rejects.toMatchObject({code:7});
    } finally { await rm(f.dir,{recursive:true,force:true}); }
  });
});
