import {readFileSync} from 'node:fs';
import {load} from 'js-yaml';
import {describe, it, expect, vi} from 'vitest';

const workflow = load(readFileSync(new URL('../.github/workflows/ios-nightly-build.yml', import.meta.url), 'utf8')) as any;
const step = workflow.jobs.changes.steps.find((s: any) => s.id === 'capture');
const execute = new Function('github', 'core', 'context', 'process', `return (async () => {${step.with.script}})();`);
const prior = {id: 10, run_attempt: 2, head_sha: 'abc', event: 'schedule', conclusion: 'success', created_at: '2026-09-09T13:00:00Z'};
const artifact = {name: 'ios-screenshots-10-2', expired: false};

async function check(runs: any[], artifacts: any[], now = '2026-09-09T14:00:00Z', fail = false) {
  vi.useFakeTimers(); vi.setSystemTime(new Date(now));
  const listWorkflowRuns = vi.fn();
  const listWorkflowRunArtifacts = vi.fn();
  const github = {rest: {actions: {listWorkflowRuns, listWorkflowRunArtifacts}},
    paginate: vi.fn(async (method: unknown, params: any) => {
      if (fail) throw new Error('API unavailable');
      if (method === listWorkflowRuns) {
        expect(params.status).toBe('success'); expect(params.branch).toBe('main');
        return runs;
      }
      return artifacts;
    })};
  const core = {setOutput: vi.fn(), notice: vi.fn(), warning: vi.fn()};
  try {
    await execute(github, core, {repo: {owner: 'owner', repo: 'app'}, sha: 'abc', runId: 11},
      {env: {WORKFLOW_FILE: 'ios-nightly-build.yml', SCHEDULE_TIMEZONE: 'America/Los_Angeles'}});
    return core;
  } finally { vi.useRealTimers(); }
}

describe('nightly recovery capture gate', () => {
  it('skips repeated captures only when the exact source has a successful capture today', async () => {
    expect((await check([prior], [artifact])).setOutput).toHaveBeenCalledWith('capture', 'false');
    expect(step.if).toBe("inputs.capture-every-night && steps.decide.outputs.build == 'false'");
    expect(workflow.jobs.test.if).toContain("needs.changes.outputs.build == 'true'");
    expect(workflow.jobs.test.if).toContain("needs.changes.outputs.capture == 'true'");
    expect(workflow.jobs.changes.outputs.capture).toBe('${{ steps.capture.outputs.capture }}');
  });
  it.each([
    {head_sha: 'old'}, {id: 11}, {event: 'pull_request'}, {created_at: '2026-09-08T23:00:00Z'},
  ])('recaptures when prior evidence is not eligible: %j', async patch => {
    expect((await check([{...prior, ...patch}], [artifact])).setOutput).toHaveBeenCalledWith('capture', 'true');
  });
  it.each([{artifacts: []}, {artifacts: [{...artifact, expired: true}]}, {artifacts: [{...artifact, name: 'ios-screenshots-10-1'}]}])('requires an unexpired artifact for the successful attempt: %j', async ({artifacts}) => {
    expect((await check([prior], artifacts)).setOutput).toHaveBeenCalledWith('capture', 'true');
  });
  it('does not let a successful no-op hide earlier screenshot evidence', async () => {
    expect((await check([{...prior, id: 9}, prior], [artifact])).setOutput).toHaveBeenCalledWith('capture', 'false');
  });
  it('uses the local calendar day across UTC midnight and the DST transition', async () => {
    expect((await check([{...prior, created_at:'2026-09-09T01:00:00Z'}], [artifact], '2026-09-09T06:59:00Z')).setOutput).toHaveBeenCalledWith('capture','false');
    expect((await check([{...prior, created_at:'2026-09-09T01:00:00Z'}], [artifact], '2026-09-09T07:01:00Z')).setOutput).toHaveBeenCalledWith('capture','true');
    expect((await check([{...prior, created_at:'2026-11-01T08:30:00Z'}], [artifact], '2026-11-01T09:30:00Z')).setOutput).toHaveBeenCalledWith('capture','false');
  });
  it('captures conservatively after an API error or with no successful run', async () => {
    expect((await check([], [], undefined, true)).setOutput).toHaveBeenCalledWith('capture', 'true');
    expect((await check([], [])).setOutput).toHaveBeenCalledWith('capture', 'true');
  });
  it('records an explicit no-op only when both build and capture are unnecessary', () => {
    const marker = workflow.jobs.changes.steps.find((s: any) => s.with?.name?.startsWith('ios-nightly-noop'));
    expect(marker.if).toBe("steps.decide.outputs.build == 'false' && steps.capture.outputs.capture != 'true'");
    expect(marker.with.name).toBe('ios-nightly-noop-${{ github.run_id }}-${{ github.run_attempt }}');
  });
});
