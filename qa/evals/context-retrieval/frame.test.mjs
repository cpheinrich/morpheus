import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFrame } from './frame.mjs';

function project(name, files) {
  return {
    name,
    repository: 'org/' + name,
    documents: new Map(Object.entries(files).map(([path, raw]) =>
      [path, { path, raw, lines: raw.split('\n') }])),
  };
}

const first = 'AB-26-02-03-00.00.01';
const second = 'AB-26-02-03-00.00.02';
const third = 'AB-26-02-03-00.00.03';
const line = 'The remote job now writes two retained success receipts.';
const otherLine = 'A distinct fallback was retained after the old endpoint expired.';
const roadmapPath = id => 'hq/product/roadmap/' + id + '.md';
const worklogPath = id => '.agent/worklog/' + id + '.md';
const roadmap = (id, title, prs = '[]') => ['---', 'id: ' + id, 'title: ' + title, 'prs: ' + prs, '---'].join('\n');
const worklog = (id, body = line) => ['---', 'roadmap: ' + id, '---', '# Result', '', body].join('\n');
const target = (path, line) => ({ path, first: line, last: line });

test('extracts a literal case and redacted descriptive case with alternate evidence', () => {
  const alternative = '.agent/worklog/continuation.md';
  const fixture = project('sample', {
    [roadmapPath(first)]: roadmap(first, '"Retain remote job receipts for ' + first + '"'),
    [worklogPath(first)]: worklog(first),
    [alternative]: worklog(first, otherLine),
    [worklogPath(second)]: worklog(second),
  });
  const cases = buildFrame([fixture]);
  assert.equal(cases.length, 2);
  assert.equal(cases[0].group, cases[1].group);
  assert.deepEqual(cases.map(({ kind, query, exclude, targets }) => ({ kind, query, exclude, targets })), [
    {
      kind: 'literal-id',
      query: 'Work log for ' + first,
      exclude: [],
      targets: [target(worklogPath(first), 6), target(alternative, 6)],
    },
    {
      kind: 'descriptive-task',
      query: 'Work log for Retain remote job receipts for',
      exclude: [roadmapPath(first)],
      targets: [target(worklogPath(first), 6), target(alternative, 6)],
    },
  ]);
});

test('uses shared direct PRs and exposure to keep connected cases out of holdout', () => {
  const fixture = project('sample', {
    [roadmapPath(first)]: roadmap(first, 'Retain remote job receipts', '[42]'),
    [worklogPath(first)]: worklog(first),
    [roadmapPath(second)]: roadmap(second, 'Run the fallback test', '[https://github.com/org/sample/pull/42]'),
    [worklogPath(second)]: worklog(second),
    [roadmapPath(third)]: roadmap(third, 'Test another stable path'),
    [worklogPath(third)]: worklog(third),
  });
  const cases = buildFrame([fixture], { exposedPaths: { sample: [worklogPath(first)] } });
  assert.equal(cases.length, 6);
  assert.equal(new Set(cases.slice(0, 4).map(item => item.group)).size, 1);
  assert.deepEqual(cases.slice(0, 4).map(item => item.split), ['dev', 'dev', 'dev', 'dev']);
  assert.notEqual(cases[0].group, cases[4].group);
});

test('resolves exact local anchors and discards fenced or ambiguous links', () => {
  const fixture = project('sample', {
    'docs/source.md': [
      '# Source',
      'Read the [notes](target.md#repeat-1) to recover a disabled queue.',
      'See both [one](target.md#repeat) and [two](target.md#unavailable) for the fallback plan.',
      '```md',
      'Ignore the [sample](target.md#repeat) in a fenced example.',
      '```',
      'Compare [broken](target.md#%ZZ) for a damaged URI.',
    ].join('\n'),
    'docs/target.md': [
      '# Target',
      '## Repeat',
      line,
      '## Repeat',
      otherLine,
      '## Unavailable',
      'Empty',
    ].join('\n'),
  });
  const cases = buildFrame([fixture]);
  assert.deepEqual(cases.map(({ kind, query, exclude, targets }) => ({ kind, query, exclude, targets })), [{
    kind: 'linked-section',
    query: 'Find project guidance for Read the to recover a disabled queue.',
    exclude: ['docs/source.md'],
    targets: [target('docs/target.md', 5)],
  }]);
});

test('stratifies a deterministic seeded split over groups and is order independent', () => {
  const files = {};
  for (const [i, id] of [first, second, third].entries()) {
    files[roadmapPath(id)] = roadmap(id, 'Retain the job receipts number ' + i);
    files[worklogPath(id)] = worklog(id);
  }
  const options = { seed: 'test-seed' };
  const cases = buildFrame([project('sample', files)], options);
  assert.deepEqual(cases, buildFrame([project('sample', Object.fromEntries(Object.entries(files).reverse()))], options));
  const held = cases.filter(item => item.split === 'holdout');
  assert.equal(held.length, 2);
  assert.equal(held[0].group, held[1].group);
  assert.equal(cases.filter(item => item.group === held[0].group).length, 2);
});

test('drops duplicate descriptive prompts whose underlying target is ambiguous', () => {
  const fixture = project('sample', {
    [roadmapPath(first)]: roadmap(first, 'Retain remote job receipts'),
    [worklogPath(first)]: worklog(first),
    [roadmapPath(second)]: roadmap(second, 'Retain remote job receipts!'),
    [worklogPath(second)]: worklog(second),
  });
  assert.deepEqual(buildFrame([fixture]).map(item => item.kind), ['literal-id', 'literal-id']);
});

test('meeting headings in one note share a group and target prose rather than headings', () => {
  const path = 'hq/team/meeting-notes/retention.md';
  const fixture = project('sample', {
    [path]: ['---', 'title: Retention work check in', 'occurred: 2026-02-01T12:00:00Z', '---',
      '# Meeting', '## Key decisions', line, '## Open questions', otherLine].join('\n'),
  });
  const cases = buildFrame([fixture]);
  assert.equal(cases.length, 2);
  assert.equal(cases[0].group, cases[1].group);
  assert.deepEqual(cases.map(item => [item.query, item.targets[0]]), [
    ['Key decisions from the meeting about Retention work check in (2026-02-01)', target(path, 7)],
    ['Open questions from the meeting about Retention work check in (2026-02-01)', target(path, 9)],
  ]);
});

test('does not turn quoted answer text into a descriptive query', () => {
  const fixture = project('sample', {
    [roadmapPath(first)]: roadmap(first, 'Follow up when the remote job now writes two retained success receipts'),
    [worklogPath(first)]: worklog(first),
  });
  assert.deepEqual(buildFrame([fixture]).map(item => item.kind), ['literal-id']);
});
