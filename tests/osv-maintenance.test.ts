import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// The operator script runs on plain Node without installing the project first.
// @ts-expect-error Standalone operational JavaScript has no declaration file.
import { findingsFromSarif, inspect, validateRun } from '../scripts/osv-maintenance/inspect.mjs';

const run = { id: 123, run_attempt: 1, workflow_id: 456, head_branch: 'main', head_sha: 'a'.repeat(40),
  repository: { full_name: 'cpheinrich/morpheus' }, event: 'schedule', status: 'completed', conclusion: 'failure' };
const finding = (coordinate: string, rule = 'GHSA-example') => ({ ruleId: rule,
  message: { text: `Package '${coordinate}' is vulnerable to '${rule}'.` },
  locations: [{ physicalLocation: { artifactLocation: { uri: 'pnpm-lock.yaml' } } }] });
const report = (results: unknown[] = []) => ({ version: '2.1.0', runs: [{ tool: { driver: { name: 'osv-scanner' } }, results }] });

function fakeGh(options: { run?: object; sarif?: object; downloadError?: boolean; noRuns?: boolean } = {}) {
  const calls: string[][] = [];
  const gh = (args: string[]) => {
    calls.push(args);
    if (args[0] === 'run') {
      if (options.downloadError) throw new Error('Artifact expired');
      writeFileSync(join(args.at(-1)!, 'results.sarif'), JSON.stringify(options.sarif ?? report([finding('vitest@4.1.10')])));
      return '';
    }
    if (args[1]?.endsWith('security.yml')) return JSON.stringify({ id: 456 });
    if (args[1]?.includes('?')) return JSON.stringify({ workflow_runs: options.noRuns ? [] : [{ id: 123 }] });
    return JSON.stringify(options.run ?? run);
  };
  return { gh, calls };
}

describe('OSV maintenance handoff', () => {
  it('groups scoped packages, versions and advisories without losing independent dependencies', () => {
    expect(findingsFromSarif(report([finding('@vitest/mocker@4.1.10'), finding('vitest@4.1.10'),
      finding('vitest@4.1.9'), finding('vitest@4.1.10', 'GHSA-second')]))).toEqual([
      { dependency: '@vitest/mocker', versions: ['4.1.10'], advisories: ['GHSA-example'], paths: ['pnpm-lock.yaml'] },
      { dependency: 'vitest', versions: ['4.1.10', '4.1.9'], advisories: ['GHSA-example', 'GHSA-second'], paths: ['pnpm-lock.yaml'] },
    ]);
  });
  it.each([{}, { version: '2.1.0', runs: [] }, report([{}]), report([{ ...finding('x@1'), locations: [] }]),
    { version: '2.1.0', runs: [{ tool: { driver: { name: 'other' } }, results: [] }] }])('rejects missing or unknown evidence', (sarif) => {
    expect(() => findingsFromSarif(sarif)).toThrow();
  });
  it.each([{ repository: { full_name: 'someone/fork' } }, { workflow_id: 999 }, { head_branch: 'feature' },
    { head_sha: 'main' }, { event: 'pull_request' }, { conclusion: 'cancelled' }])('rejects untrusted or incomplete runs', (change) => {
    expect(() => validateRun({ ...run, ...change }, 456)).toThrow();
  });
  it('waits without downloading while the latest scan runs', () => {
    const fake = fakeGh({ run: { ...run, status: 'in_progress' } });
    expect(inspect(fake).status).toBe('waiting');
    expect(fake.calls.some((args) => args[0] === 'run')).toBe(false);
  });
  it('reports findings even though OSV exited with failure, and cleans the temporary download', () => {
    const fake = fakeGh();
    expect(inspect(fake)).toMatchObject({ status: 'findings', runId: 123, attempt: 1, sha: run.head_sha });
    const directory = fake.calls.find((args) => args[0] === 'run')!.at(-1)!;
    expect(() => readFileSync(join(directory, 'results.sarif'))).toThrow();
    expect(fake.calls.filter((args) => args[1]?.includes('?')).map((args) => args[1])).toEqual([
      expect.stringContaining('event=schedule'), expect.stringContaining('event=workflow_dispatch'),
    ]);
  });
  it('allows clean only with successful workflow and a valid empty report', () => {
    expect(inspect(fakeGh({ run: { ...run, conclusion: 'success' }, sarif: report() })).status).toBe('clean');
    expect(() => inspect(fakeGh({ sarif: report() }))).toThrow('not a clean scan');
  });
  it('does not swallow missing artifacts', () => {
    expect(() => inspect(fakeGh({ downloadError: true }))).toThrow('Artifact expired');
  });
  it('does not call no scheduled/manual runs clean', () => {
    expect(inspect(fakeGh({ noRuns: true })).status).toBe('no-run');
  });
  it('accepts an explicitly selected historical push run for bootstrap', () => {
    expect(inspect({ ...fakeGh({ run: { ...run, event: 'push' } }), runId: '123' }).status).toBe('findings');
  });
  it('rejects a nonnumeric explicit run id before using it in a request', () => {
    expect(() => inspect({ ...fakeGh(), runId: '../other' })).toThrow('numeric');
  });
});
