import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatResults, scoreResults, validateCases } from './measure.mjs';

const span = (path, first, last = first) => ({ path, first, last });
const documents = new Map([
  ['a.md', { lines: ['unrelated', 'required detail', 'other', 'next'] }],
  ['b.md', { lines: ['alternate detail'] }],
]);
const encode = text => Buffer.from(text);

test('the cap admits the exact boundary and skips a whole overflowing citation', () => {
  const entry = 'a.md:2-2\nrequired detail\n\n';
  const ranked = [span('a.md', 2)];
  assert.deepEqual(formatResults(ranked, documents, [], entry.length, encode), {
    output: entry, snippets: ranked, returnedTokens: entry.length,
  });
  assert.deepEqual(formatResults(ranked, documents, [], entry.length - 1, encode), {
    output: '', snippets: [], returnedTokens: 0,
  });
});

test('correct file with wrong lines is a miss, either full alternative is a hit', () => {
  const targets = [span('a.md', 1, 2), span('b.md', 1)];
  assert.deepEqual(scoreResults({ snippets: [span('a.md', 1)] }, targets), { evidence: false, file: true });
  assert.deepEqual(scoreResults({ snippets: [span('a.md', 1), span('a.md', 2)] }, targets),
    { evidence: false, file: true });
  assert.deepEqual(scoreResults({ snippets: [span('b.md', 1)] }, targets), { evidence: true, file: true });
  assert.deepEqual(scoreResults({ snippets: [span('a.md', 1, 2)] }, [span('b.md', 1)]),
    { evidence: false, file: false });
});

test('deduplicates overlapping and excluded ranges without spending their budget', () => {
  const rows = [span('b.md', 1), span('a.md', 1, 2), span('a.md', 2), span('a.md', 3), span('a.md', 4)];
  assert.deepEqual(formatResults(rows, documents, ['b.md'], 500, encode).snippets, [rows[1], rows[3]]);
  assert.throws(() => formatResults([span('a.md', 5)], documents, [], 500, encode), /Invalid source citation/);
});

test('a grouped case may not cross splits or exclude its own target', () => {
  const item = { id: '1', split: 'dev', group: 'same', project: 'fixture',
    query: 'required detail', targets: [span('a.md', 2)], exclude: [] };
  const projects = [{ name: 'fixture', documents }];
  assert.throws(() => validateCases([item, { ...item, id: '2', split: 'holdout' }], projects), /crosses splits/);
  assert.throws(() => validateCases([{ ...item, exclude: ['a.md'] }], projects), /Invalid evidence/);
});
