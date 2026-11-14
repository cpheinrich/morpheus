import {afterEach, describe, expect, it} from 'vitest';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {digest} from '../qa/benchmarks/document-retrieval/score.mjs';

const roots: string[] = [];
afterEach(() => {for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true});});
const secret = 'PRIVATE_TUNING_CANARY';
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'morpheus-tuning-test-'));
  roots.push(root);
  const write = (path: string, value: unknown) => writeFileSync(join(root, path), JSON.stringify(value));
  mkdirSync(join(root, 'evo'));
  const quote = secret + ': a sufficiently long literal source passage.';
  writeFileSync(join(root, 'evo', secret + '.md'), quote);
  write('evo/snapshot.json', {files: [{path: secret + '.md', sha256: digest(quote)}]});
  write('fixture.json', [{id: 'H01', question: secret, groups: [[{path: secret + '.md', text: quote}]]}]);
  for (const stage of ['pilot', 'pilot-cli', 'validation']) {
    mkdirSync(join(root, stage));
    const arms = stage === 'pilot' ? ['baseline', 'lexical', 'hybrid'] : stage === 'pilot-cli' ? ['cli'] : ['baseline', 'cli'];
    const repeats = stage === 'validation' ? 2 : 1;
    write(stage + '/config.json', {fixture: 'fixture.json', fixtureSha256: digest(readFileSync(join(root, 'fixture.json'))),
      model: 'test-model', effort: 'high', timestamp: '2026-09-25T00:00:00Z', arms, repeats, privateConfig: secret});
    for (let repeat = 0; repeat < repeats; repeat++) for (const [i,arm] of arms.entries()) {
      const prefix = `${stage}/H01-${arm}-${repeat}`;
      write(prefix + '.result.json', {id: 'H01', arm, repeat, order: (i + repeat) % arms.length,
        ms: arm === 'baseline' ? 80 : 60, status: 'completed', error: secret, threadId: secret,
        toolCalls: 1, qmdCalls: 0, usage: {input_tokens: 100, cached_input_tokens: 40, output_tokens: 10}});
      write(prefix + '.answer.json', {answer: secret, citations: [{path: secret + '.md', quote}]});
      write(prefix + '.events.json', [{atMs: 10, event: {type: 'item.started', item: {type: 'command_execution'}}},
        {atMs: arm === 'baseline' ? 40 : 20, event: {type: 'item.completed', item: {
          type: 'command_execution', aggregated_output: quote, command: arm === 'cli' ? 'qmd search term' : 'rg term',
        }}}]);
    }
  }
  for (const name of ['development-results.json', 'development-fresh-results.json', 'development-http-results.json']) {
    write(name, [{id: 'E01', mode: 'lex', ms: 1, recall5: 1, recall10: 1, paths: [secret], error: secret}]);
  }
  const publish = () => spawnSync(process.execPath, [resolve('qa/benchmarks/document-retrieval/publish-tuning.mjs'), root, join(root, 'public')], {encoding: 'utf8'});
  return {root, write, publish};
}

describe('tuning publication', () => {
  it('redacts source material and computes paired timing from source-verified events', () => {
    const {root, publish} = setup();
    const result = publish();
    expect(result.status, result.stderr).toBe(0);
    const raw = readFileSync(join(root, 'public/measurements.json'), 'utf8');
    expect(raw).not.toContain(secret);
    const summary = JSON.parse(readFileSync(join(root, 'public/summary.json'), 'utf8'));
    expect(summary.paired).toMatchObject({n: 2, medianCompletionDifferenceMs: -20,
      medianEvidenceDifferenceMs: -20, medianEvidenceSpeedup: 2, substantialEvidenceWins: 0});
    const row = summary.summaries.find((r: {key: string}) => r.key === 'validation/cli');
    expect(row).toMatchObject({recall: 1, completeEvidence: 2, timedEvidence: 2, medianEvidenceCappedMs: 20});
  });
  it('retains failures in recall and capped evidence time', () => {
    const {root, write, publish} = setup();
    write('validation/H01-cli-0.result.json', {id: 'H01', arm: 'cli', repeat: 0, order: 1,
      ms: 120001, status: 'timeout', toolCalls: 0, qmdCalls: 0});
    const result = publish();
    expect(result.status, result.stderr).toBe(0);
    const summary = JSON.parse(readFileSync(join(root, 'public/summary.json'), 'utf8'));
    const row = summary.summaries.find((r: {key: string}) => r.key === 'validation/cli');
    expect(row).toMatchObject({recall: .5, completeEvidence: 1, timedEvidence: 1, errors: 1, medianEvidenceCappedMs: 60010});
  });
  it('refuses changed fixtures', () => {
    const {root, write, publish} = setup();
    write('fixture.json', []);
    expect(publish().stderr).toContain('Fixture drift');
    expect(existsSync(join(root, 'public'))).toBe(false);
  });
  it('refuses missing trials', () => {
    const {root, publish} = setup();
    rmSync(join(root, 'validation/H01-cli-1.result.json'));
    expect(publish().stderr).toContain('Incomplete run');
    expect(existsSync(join(root, 'public'))).toBe(false);
  });
  it('refuses corpus edits after snapshotting', () => {
    const {root, publish} = setup();
    writeFileSync(join(root, 'evo', secret + '.md'), 'changed');
    expect(publish().stderr).toContain('Snapshot drift');
  });
  it('does not permit adjudication to rescue a failed run', () => {
    const {write, publish} = setup();
    write('validation/H01-cli-0.result.json', {id: 'H01', arm: 'cli', repeat: 0, order: 1, ms: 120001, status: 'timeout'});
    write('adjudications.json', [{stage: 'validation', id: 'H01', arm: 'cli', repeat: 0, reason: secret,
      additions: [{group: 0, path: secret + '.md', quote: secret}]}]);
    expect(publish().stderr).toContain('Invalid adjudication');
  });
  it('keeps source-verified author adjudication separate from frozen scores', () => {
    const {root, write, publish} = setup();
    const fixtures = JSON.parse(readFileSync(join(root, 'fixture.json'), 'utf8'));
    fixtures[0].groups[0][0].text = 'a sufficiently long literal source passage.';
    write('fixture.json', fixtures);
    for (const stage of ['pilot', 'pilot-cli', 'validation']) {
      const path = stage + '/config.json';
      write(path, {...JSON.parse(readFileSync(join(root, path), 'utf8')),
        fixtureSha256: digest(readFileSync(join(root, 'fixture.json')))});
    }
    const answer = JSON.parse(readFileSync(join(root, 'validation/H01-cli-0.answer.json'), 'utf8'));
    write('adjudications.json', [{stage: 'validation', id: 'H01', arm: 'cli', repeat: 0, reason: secret,
      additions: [{group: 0, ...answer.citations[0]}]}]);
    const result = publish();
    expect(result.status, result.stderr).toBe(0);
    const raw = readFileSync(join(root, 'public/measurements.json'), 'utf8');
    expect(raw).not.toContain(secret);
    const data = JSON.parse(raw);
    expect(data.agents.find((r: {stage: string; arm: string; repeat: number}) =>
      r.stage === 'validation' && r.arm === 'cli' && r.repeat === 0))
      .toMatchObject({recall: 0, auditedRecall: 1, evidenceMs: null, auditedEvidenceMs: 20});
  });
  it('refuses repeats that do not counterbalance arm order', () => {
    const {root, write, publish} = setup();
    for (const [arm, order] of [['baseline', 0], ['cli', 1]] as const) {
      const path = `validation/H01-${arm}-1.result.json`;
      write(path, {...JSON.parse(readFileSync(join(root, path), 'utf8')), order});
    }
    expect(publish().stderr).toContain('Repeats must reverse arm order');
    expect(existsSync(join(root, 'public'))).toBe(false);
  });
});
