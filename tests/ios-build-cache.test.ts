import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

// A job cancelled mid-build leaves XCBuildData/build.db half-written on the shared cache disk
// and every later job on that slot fails before compiling (cpheinrich/morpheus#394). The
// workflow checks the database before building and retries one cold build when the build
// service fails on it; these tests run those two step scripts against stub binaries.
const exec = promisify(execFile);
type Step = { name?: string; run?: string };
const steps = async () => (load(await readFile(new URL('../.github/workflows/ios-ci.yml', import.meta.url), 'utf8')) as { jobs: { test: { steps: Step[] } } }).jobs.test.steps;
const exists = (path: string) => access(path).then(() => true, () => false);

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'ios-build-cache-'));
  for (const child of ['bin', 'results', 'logs', 'cache']) await mkdir(join(dir, child));
  const argLog = `${dir}/argv`;
  const githubEnv = `${dir}/env`;
  const env: Record<string, string> = { ...process.env as Record<string, string>, PATH: `${dir}/bin:${process.env.PATH}`, RUNNER_TEMP: dir, MORPHEUS_IOS_CI_CACHE: `${dir}/cache`, GITHUB_ENV: githubEnv, GITHUB_OUTPUT: `${dir}/output`, GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1', RESULTS: `${dir}/results`, LOGS: `${dir}/logs`, ARG_LOG: argLog, PROJECT: 'App.xcodeproj', SCHEME: 'App', CONFIGURATION: 'Debug', SDK: 'iphonesimulator', PLATFORM: 'iOS Simulator', DESTINATION: 'id=test', SOURCE_PACKAGES: `${dir}/cache/SourcePackages`, DERIVED_DATA: `${dir}/cache/DerivedData`, PARALLEL_TESTING: 'NO', MAXIMUM_PARALLEL_TESTING_WORKERS: '0', TEST_PLAN: '', OPTIMIZE_TEST_BUILD: 'false' };
  async function binary(name: string, script: string) { const path = join(dir, 'bin', name); await writeFile(path, '#!/bin/bash\n' + script); await chmod(path, 0o755); }
  const all = await steps();
  const run = (name: string) => exec('/bin/bash', ['-c', all.find(s => s.name === name)!.run!], { cwd: dir, env });
  const buildDb = join(dir, 'cache/DerivedData/Build/Intermediates.noindex/XCBuildData/build.db');
  return { dir, env, run, binary, buildDb, argLog, githubEnv };
}

describe('shared DerivedData self-heal', () => {
  it('discards only the build directory when the cached build database fails its integrity check', async () => {
    const f = await fixture();
    await mkdir(join(f.dir, 'cache/DerivedData/Build/Intermediates.noindex/XCBuildData'), { recursive: true });
    await mkdir(join(f.dir, 'cache/DerivedData/ModuleCache.noindex'), { recursive: true });
    await mkdir(join(f.dir, 'cache/SourcePackages/checkouts'), { recursive: true });
    await writeFile(f.buildDb, 'not a database');
    await f.binary('sqlite3', 'echo "file is not a database"; exit 1\n');
    const { stdout } = await f.run('Prepare isolated build directories');
    expect(stdout).toMatch(/::warning::Discarding the cached DerivedData build directory/);
    expect(await exists(join(f.dir, 'cache/DerivedData/Build'))).toBe(false);
    expect(await exists(join(f.dir, 'cache/DerivedData/ModuleCache.noindex'))).toBe(true);
    expect(await exists(join(f.dir, 'cache/SourcePackages/checkouts'))).toBe(true);
    expect(await readFile(f.githubEnv, 'utf8')).toContain(`DERIVED_DATA=${f.dir}/cache/DerivedData`);
  });

  it('keeps a healthy build database and never runs the check without a cache', async () => {
    const f = await fixture();
    await mkdir(join(f.dir, 'cache/DerivedData/Build/Intermediates.noindex/XCBuildData'), { recursive: true });
    await writeFile(f.buildDb, 'fine');
    await f.binary('sqlite3', 'echo ok\n');
    const { stdout } = await f.run('Prepare isolated build directories');
    expect(stdout).not.toMatch(/::warning::/);
    expect(await exists(f.buildDb)).toBe(true);
    await f.binary('sqlite3', 'echo "must not run"; exit 1\n');
    const cold = await exec('/bin/bash', ['-c', (await steps()).find(s => s.name === 'Prepare isolated build directories')!.run!], { cwd: f.dir, env: { ...f.env, MORPHEUS_IOS_CI_CACHE: '' } });
    expect(cold.stdout).not.toMatch(/must not run|::warning::/);
  });

  for (const step of ['Build for testing', 'Build']) {
    it(`${step}: retries once cold after a build-service failure on the cache, and only then`, async () => {
      const f = await fixture();
      await mkdir(join(f.dir, 'cache/DerivedData/Build/Intermediates.noindex/XCBuildData'), { recursive: true });
      await writeFile(f.buildDb, 'damaged');
      // First call fails like a damaged cache; the second succeeds. Each call is logged.
      // Like the real tool, every invocation writes its result bundle and refuses an existing one
      // (xcodebuild: error: Existing file at -resultBundlePath), which is what the retry must survive.
      await f.binary('xcodebuild', 'echo "$*" >> "$ARG_LOG"\nbundle="$RESULTS/Build.xcresult"\nif [ -e "$bundle" ]; then echo "xcodebuild: error: Existing file at -resultBundlePath \\"$bundle\\""; exit 70; fi\nmkdir -p "$bundle"\nif [ ! -f "$RUNNER_TEMP/retried" ]; then touch "$RUNNER_TEMP/retried"; echo \'error: accessing build database "x/build.db": database disk image is malformed\'; exit 65; fi\necho built\n');
      const { stdout } = await f.run(step);
      expect(stdout).toMatch(/::warning::Build service failure on the cached DerivedData/);
      expect(stdout).not.toMatch(/Existing file at -resultBundlePath/);
      expect((await readFile(f.argLog, 'utf8')).trim().split('\n')).toHaveLength(2);
      expect(await exists(f.buildDb)).toBe(false);
      expect(await exists(join(f.dir, 'logs/build-damaged-cache.log'))).toBe(true);
      expect(await exists(join(f.dir, 'results/Build-damaged-cache.xcresult'))).toBe(true);
      expect(await exists(join(f.dir, 'results/Build.xcresult'))).toBe(true);
      expect(await readFile(join(f.dir, 'logs/build.log'), 'utf8')).toContain('built');
      // An ordinary compile error is not retried.
      const g = await fixture();
      await g.binary('xcodebuild', 'echo "$*" >> "$ARG_LOG"\necho "error: cannot find type Foo in scope"\nexit 65\n');
      await expect(g.run(step)).rejects.toMatchObject({ code: 65 });
      expect((await readFile(g.argLog, 'utf8')).trim().split('\n')).toHaveLength(1);
      // A second damaged-cache failure is a real failure.
      const h = await fixture();
      await h.binary('xcodebuild', 'echo "$*" >> "$ARG_LOG"\necho "error: The build service has encountered an internal inconsistency error"\nexit 65\n');
      await expect(h.run(step)).rejects.toMatchObject({ code: 65 });
      expect((await readFile(h.argLog, 'utf8')).trim().split('\n')).toHaveLength(2);
    });
  }
});
