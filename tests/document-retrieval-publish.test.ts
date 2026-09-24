import {afterEach, describe, expect, it} from 'vitest';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {digest} from '../qa/benchmarks/document-retrieval/score.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true}); });
const secret = 'PRIVATE_SOURCE_CANARY';
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'morpheus-retrieval-test-'));
  roots.push(root);
  const write = (path: string, data: unknown) => writeFileSync(join(root, path), JSON.stringify(data));
  mkdirSync(join(root, 'agents'));
  const questions = ['lakina', 'evo'].flatMap(project => Array.from({length: 30}, (_, i) => ({
    id: (project === 'lakina' ? 'L' : 'E') + String(i + 1).padStart(2, '0'),
    project, category: 'exact', question: secret, keywords: secret, groups: [[{path: secret, text: secret}]],
  })));
  write('fixtures.json', questions);
  write('frozen.json', {fixtureSha256: digest(readFileSync(join(root, 'fixtures.json')))});
  for (const project of ['lakina', 'evo']) {
    mkdirSync(join(root, project));
    write(project + '/snapshot.json', {revision: 'a'.repeat(40), bytes: 10, files: [{path: secret}]});
    write(project + '-index.json', {updateMs: 1, embedMs: 2, embed: {chunksEmbedded: 1}});
    for (const mode of ['bm25', 'vector', 'hybrid', 'rerank', 'full']) {
      write(project + '-' + mode + '-engine.json', questions.filter(q => q.project === project).map((q, i) => ({
        ...q, mode, ms: i + 1, firstQuery: i === 0, recall5: 1, recall10: 1, mrr: 1, error: null, paths: [secret],
      })));
    }
  }
  for (const q of questions) for (const arm of ['baseline', 'qmd']) {
    const failed = q.id === 'L01' && arm === 'qmd';
    write('agents/' + q.id + '-' + arm + '.result.json', {
      ...q, arm, order: 0, startedAt: '2026-09-24T00:00:00Z', ms: failed ? 120001 : 1000,
      status: failed ? 'timeout' : 'completed', recall: failed ? 0 : 1,
      error: failed ? secret : null, toolCalls: 1, toolOutputChars: 100,
      qmdCalls: arm === 'qmd' ? 1 : 0, usage: failed ? null : {input_tokens: 100, cached_input_tokens: 50, output_tokens: 10},
      threadId: secret,
    });
  }
  const publish = () => spawnSync(process.execPath, [
    resolve('qa/benchmarks/document-retrieval/publish.mjs'), root, join(root, 'public'),
  ], {encoding: 'utf8'});
  return {root, write, publish};
}

describe('retrieval result publication', () => {
  it('publishes only allowlisted metrics and retains timeout losses', () => {
    const {root, publish} = setup();
    const run = publish();
    expect(run.status, run.stderr).toBe(0);
    const measurements = readFileSync(join(root, 'public/measurements.json'), 'utf8');
    const summaryText = readFileSync(join(root, 'public/summary.json'), 'utf8');
    expect(measurements).not.toContain(secret);
    expect(summaryText).not.toContain(secret);
    const summary = JSON.parse(summaryText);
    const row = summary.agents.find((r: {project: string; arm: string}) => r.project === 'lakina' && r.arm === 'qmd');
    expect(row.recall).toBe(29 / 30);
    expect(row.completeEvidence).toBe(29);
    expect(row.timeouts).toBe(1);
    expect(row.usageRows).toBe(29);
    expect(summary.pairs[0].worse).toBe(1);
    expect(summary.pairs[0].tied).toBe(29);
    expect(summary.deliveryBudgets.find((r: {project: string; arm: string; seconds: number}) =>
      r.project === 'lakina' && r.arm === 'qmd' && r.seconds === 30).deliveredRecall).toBe(29 / 30);
  });
  it('refuses incomplete experiments instead of silently reducing the denominator', () => {
    const {root, publish} = setup();
    rmSync(join(root, 'agents/L01-baseline.result.json'));
    const run = publish();
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Incomplete run');
    expect(existsSync(join(root, 'public/measurements.json'))).toBe(false);
  });
  it('refuses fixtures changed after freezing', () => {
    const {root, write, publish} = setup();
    write('fixtures.json', []);
    const run = publish();
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Fixture drift');
    expect(existsSync(join(root, 'public/summary.json'))).toBe(false);
  });
  it('keeps audited interpretation separate from frozen scores and private reasons', () => {
    const {root, write, publish} = setup();
    const path = join(root, 'agents/E01-qmd.result.json');
    const row = JSON.parse(readFileSync(path, 'utf8'));
    row.recall = 0;
    writeFileSync(path, JSON.stringify(row));
    write('adjudications.json', [{
      id: 'E01', arm: 'qmd', strictRecall: 0, auditedRecall: 1,
      classification: 'unlabeled-equivalent', reason: secret,
    }]);
    const run = publish();
    expect(run.status, run.stderr).toBe(0);
    const text = readFileSync(join(root, 'public/summary.json'), 'utf8');
    expect(text).not.toContain(secret);
    const summary = JSON.parse(text);
    const isEvoQmd = (r: {project: string; arm: string}) => r.project === 'evo' && r.arm === 'qmd';
    expect(summary.agents.find(isEvoQmd).recall).toBe(29 / 30);
    expect(summary.postHoc.agents.find(isEvoQmd).recall).toBe(1);
    expect(summary.postHoc.agents.find(isEvoQmd).unadjudicatedCompletedMisses).toBe(0);
  });
  it('does not allow an audit override to erase a timeout', () => {
    const {write, publish} = setup();
    write('adjudications.json', [{
      id: 'L01', arm: 'qmd', strictRecall: 0, auditedRecall: 1,
      classification: 'unlabeled-equivalent', reason: 'not valid',
    }]);
    const run = publish();
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Invalid post-hoc adjudication');
  });
});
