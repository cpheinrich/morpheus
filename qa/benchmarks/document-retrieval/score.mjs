import { createHash } from 'node:crypto';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const normalize = value => value.replace(/\s+/g, ' ').trim();

export function recallAt(groups, paths, k) {
  if (!groups.length) throw new Error('Evidence groups must be nonempty');
  const ranked = [...new Set(paths)].slice(0, k);
  return groups.filter(group => group.some(source => ranked.includes(source.path))).length / groups.length;
}

export function reciprocalRank(groups, paths) {
  const rank = [...new Set(paths)].findIndex(path => groups.some(group => group.some(s => s.path === path)));
  return rank < 0 ? 0 : 1 / (rank + 1);
}

export function evidenceRecall(groups, citations) {
  if (!groups.length) throw new Error('Evidence groups must be nonempty');
  return groups.filter(group => group.some(source => citations.some(citation => {
    const quote = normalize(citation.quote ?? '');
    return citation.path.replace(/^\.\//, '') === source.path &&
      quote.length >= 30 && normalize(source.text).includes(quote);
  }))).length / groups.length;
}

export function quantile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low);
}

export const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
