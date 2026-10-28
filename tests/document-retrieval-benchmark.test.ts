import {describe, it, expect} from 'vitest';
import {recallAt, reciprocalRank, evidenceRecall, quantile, mean, digest} from '../qa/benchmarks/document-retrieval/score.mjs';

const first = {path: 'decisions.md', text: 'First settled rule says preserve immutable original evidence.'};
const alternate = {path: 'worklog.md', text: 'The original evidence is retained without subsequent mutation.'};
const second = {path: 'decisions.md', text: 'Second settled rule says later edits belong in an append-only ledger.'};
const groups = [[first, alternate], [second]];

describe('document retrieval benchmark scoring', () => {
  it('counts equivalent files once per required evidence group', () => {
    expect(recallAt(groups, ['worklog.md', 'worklog.md'], 5)).toBe(0.5);
    expect(recallAt(groups, ['worklog.md', 'decisions.md'], 5)).toBe(1);
  });
  it('deduplicates ranked documents before applying k', () => {
    expect(recallAt(groups, ['other.md', 'other.md', 'worklog.md'], 2)).toBe(0.5);
    expect(recallAt(groups, ['other.md', 'decisions.md'], 1)).toBe(0);
  });
  it('computes reciprocal rank rather than recall', () => {
    expect(reciprocalRank(groups, ['x.md', 'x.md', 'worklog.md'])).toBe(0.5);
    expect(reciprocalRank(groups, ['x.md'])).toBe(0);
  });
  it('does not award section credit for a shared file name', () => {
    expect(evidenceRecall(groups, [{path: first.path, quote: first.text}])).toBe(0.5);
    expect(evidenceRecall(groups, [{path: first.path, quote: 'An unrelated passage which is longer than thirty characters.'}])).toBe(0);
  });
  it('accepts whitespace normalization and corpus-relative ./ paths', () => {
    expect(evidenceRecall(groups, [{path: './worklog.md', quote: alternate.text.replaceAll(' ', '\n')}])).toBe(0.5);
  });
  it('requires source attribution and exact, sufficiently long quotes', () => {
    expect(evidenceRecall(groups, [{path: 'wrong.md', quote: first.text}])).toBe(0);
    expect(evidenceRecall(groups, [{path: first.path, quote: 'preserve immutable original evidence'}])).toBe(0.5);
    expect(evidenceRecall(groups, [{path: first.path, quote: 'retain immutable original evidence'}])).toBe(0);
    expect(evidenceRecall(groups, [{path: first.path, quote: 'First settled rule'}])).toBe(0);
  });
  it('tests the quote-length boundary at exactly thirty characters', () => {
    const source = {path: 'a.md', text: 'a'.repeat(30)};
    expect(evidenceRecall([[source]], [{path: 'a.md', quote: 'a'.repeat(29)}])).toBe(0);
    expect(evidenceRecall([[source]], [{path: 'a.md', quote: 'a'.repeat(30)}])).toBe(1);
  });
  it('does not multiply credit for duplicate citations', () => {
    expect(evidenceRecall(groups, [{path: first.path, quote: first.text}, {path: first.path, quote: first.text}])).toBe(0.5);
    expect(evidenceRecall(groups, [{path: first.path, quote: first.text}, {path: second.path, quote: second.text}])).toBe(1);
  });
  it('retains missing evidence as zero and rejects unlabeled questions', () => {
    expect(evidenceRecall(groups, [])).toBe(0);
    expect(recallAt(groups, [], 10)).toBe(0);
    expect(() => evidenceRecall([], [])).toThrow('nonempty');
    expect(() => recallAt([], [], 5)).toThrow('nonempty');
  });
  it('calculates interpolated percentiles and means with explicit empty behavior', () => {
    expect(quantile([10, 30, 20, 40], 0.5)).toBe(25);
    expect(quantile([0, 100], 0.95)).toBe(95);
    expect(quantile([], 0.5)).toBeNull();
    expect(mean([1, 0, 0.5])).toBe(0.5);
    expect(mean([])).toBeNull();
  });
  it('fingerprints exact bytes, not an unstable object representation', () => {
    expect(digest('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(digest('abc\n')).not.toBe(digest('abc'));
  });
});
