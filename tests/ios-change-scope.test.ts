import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
const exec = promisify(execFile);
type Step = { name?: string; id?: string; if?: string; run?: string; 'working-directory'?: string };
async function workflow() {
  return load(await readFile(new URL('../.github/workflows/ios-ci.yml', import.meta.url), 'utf8')) as {
    jobs: { test: { steps: Step[] } };
    on: { workflow_call: { inputs: Record<string, { default?: unknown }> } };
  };
}
async function fixture(change: (dir: string, git: (...args: string[]) => Promise<string>) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'ios-scope-'));
  const git = async (...args: string[]) => (await exec('git', args, { cwd: dir })).stdout.trim();
  await git('init', '-b', 'main');
  await git('config', 'user.name', 'Scope test');
  await git('config', 'user.email', 'scope@example.invalid');
  await mkdir(join(dir, 'apps/ios/Evo'), { recursive: true });
  await writeFile(join(dir, 'apps/ios/Evo/App.swift'), 'initial');
  await git('add', '.'); await git('commit', '-m', 'base');
  const base = await git('rev-parse', 'HEAD');
  await git('switch', '-c', 'feature');
  await change(dir, git); await git('add', '-A'); await git('commit', '-m', 'change');
  const head = await git('rev-parse', 'HEAD');
  await git('switch', 'main'); await git('merge', '--no-ff', 'feature', '-m', 'merge');
  const env = { ...process.env, WATCH_PATHS: 'apps/ios\n:(exclude)apps/ios/scripts/preview.mjs', EVENT_NAME: 'pull_request', PR_BASE_SHA: base, PR_HEAD_SHA: head, GITHUB_OUTPUT: join(dir, 'output'), GITHUB_STEP_SUMMARY: join(dir, 'summary') };
  const script = (await workflow()).jobs.test.steps.find(s => s.id === 'scope')!.run!;
  const run = async (overrides: Partial<typeof env> = {}) => {
    await writeFile(env.GITHUB_OUTPUT, '');
    await exec('/bin/bash', ['-c', script], { cwd: dir, env: { ...env, ...overrides } });
    return readFile(env.GITHUB_OUTPUT, 'utf8');
  };
  return { dir, git, env, run };
}
async function write(dir: string, path: string, text = 'changed') {
  await mkdir(dirname(join(dir, path)), { recursive: true });
  await writeFile(join(dir, path), text);
}
describe('single native check change scope', () => {
  it.each([
    ['docs/readme.md', false],
    ['apps/ios/scripts/preview.mjs', false],
    ['apps/ios/Evo/App.swift', true],
    ['apps/ios/Evo/New File.swift', true],
    ['apps/ios/Evo/$(touch injected).swift', true],
  ] as const)('classifies %s without evaluating path text', async (path, relevant) => {
    const f = await fixture(dir => write(dir, path));
    try {
      expect(await f.run()).toBe(`run=${relevant}\n`);
      await expect(readFile(join(f.dir, 'injected'))).rejects.toThrow();
    } finally { await rm(f.dir, { recursive: true, force: true }); }
  });
  it('catches deletion and rename out of a watched directory', async () => {
    for (const rename of [false, true]) {
      const f = await fixture(async (dir, git) => {
        if (rename) await git('mv', 'apps/ios/Evo/App.swift', 'moved.swift');
        else await rm(join(dir, 'apps/ios/Evo/App.swift'));
      });
      try { expect(await f.run()).toBe('run=true\n'); }
      finally { await rm(f.dir, { recursive: true, force: true }); }
    }
  });
  it('preserves unconfigured and non-PR callers', async () => {
    const f = await fixture(dir => write(dir, 'docs/readme.md'));
    try {
      expect(await f.run({ WATCH_PATHS: '' })).toBe('run=true\n');
      for (const event of ['workflow_dispatch', 'schedule', 'push']) {
        expect(await f.run({ EVENT_NAME: event, PR_BASE_SHA: '', PR_HEAD_SHA: '' })).toBe('run=true\n');
      }
    } finally { await rm(f.dir, { recursive: true, force: true }); }
  });
  it('fails closed on wrong parents, missing history and invalid pathspecs', async () => {
    const f = await fixture(dir => write(dir, 'docs/readme.md'));
    try {
      await expect(f.run({ PR_BASE_SHA: 'a'.repeat(40) })).rejects.toThrow();
      await expect(f.run({ PR_HEAD_SHA: f.env.PR_BASE_SHA })).rejects.toThrow();
      await expect(f.run({ WATCH_PATHS: ':(invalid)apps/ios' })).rejects.toThrow();
      await expect(f.run({ WATCH_PATHS: '  \n ' })).rejects.toThrow();
      await f.git('checkout', f.env.PR_HEAD_SHA);
      await expect(f.run()).rejects.toThrow();
    } finally { await rm(f.dir, { recursive: true, force: true }); }
  });
  it('compares the whole PR rather than only the final commit', async () => {
    const f = await fixture(async (dir, git) => {
      await write(dir, 'apps/ios/Evo/App.swift');
      await git('add', '.'); await git('commit', '-m', 'native change');
      await write(dir, 'docs/readme.md');
    });
    try { expect(await f.run()).toBe('run=true\n'); }
    finally { await rm(f.dir, { recursive: true, force: true }); }
  });
  it('keeps one job and gates every native step, including always/failure evidence', async () => {
    const wf = await workflow();
    expect(Object.keys(wf.jobs)).toEqual(['test']);
    expect(wf.on.workflow_call.inputs['watch-paths']!.default).toBe('');
    const steps = wf.jobs.test.steps;
    const scope = steps.findIndex(s => s.id === 'scope');
    expect(scope).toBe(1);
    expect(steps[scope]!['working-directory']).toBe('.');
    for (const step of steps.slice(scope + 1)) expect(step.if, step.name).toContain("steps.scope.outputs.run == 'true'");
  });
});
