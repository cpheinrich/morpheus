export const budgets = [1000, 2500];

function overlaps(a, b) {
  return a.path === b.path && a.first <= b.last && b.first <= a.last;
}

export function formatResults(ranked, documents, exclude, budget, encode) {
  const snippets = [];
  const counts = new Map();
  const excluded = new Set(exclude);
  let output = '';
  for (const row of ranked) {
    const source = documents.get(row.path);
    if (!source || !Number.isInteger(row.first) || !Number.isInteger(row.last) ||
        row.first < 1 || row.last < row.first || row.last > source.lines.length) {
      throw Error('Invalid source citation');
    }
    if (excluded.has(row.path) || (counts.get(row.path) ?? 0) === 2 ||
        snippets.some(prior => overlaps(row, prior))) continue;
    const body = source.lines.slice(row.first - 1, row.last).join('\n');
    const entry = `${row.path}:${row.first}-${row.last}\n${body}\n\n`;
    if (encode(output + entry).length > budget) continue;
    output += entry;
    snippets.push({ path: row.path, first: row.first, last: row.last });
    counts.set(row.path, (counts.get(row.path) ?? 0) + 1);
  }
  return { output, snippets, returnedTokens: encode(output).length };
}

export function scoreResults(result, targets) {
  return {
    evidence: targets.some(target => result.snippets.some(span =>
      span.path === target.path && span.first <= target.first && span.last >= target.last)),
    file: targets.some(target => result.snippets.some(span => span.path === target.path)),
  };
}

function validTarget(target, documents, exclude) {
  const lines = documents?.get(target.path)?.lines;
  return lines && !exclude.includes(target.path) && Number.isInteger(target.first) &&
    Number.isInteger(target.last) && target.first >= 1 && target.last >= target.first &&
    target.last <= lines.length;
}

export function validateCases(cases, projects) {
  const docs = new Map(projects.map(project => [project.name, project.documents]));
  const ids = new Set();
  const splits = new Map();
  for (const item of cases) {
    if (ids.has(item.id)) throw Error('Duplicate case: ' + item.id);
    ids.add(item.id);
    if (!['dev', 'holdout'].includes(item.split) || !item.group ||
        !item.query.trim() || !item.targets.length) throw Error('Invalid case: ' + item.id);
    if (splits.has(item.group) && splits.get(item.group) !== item.split) throw Error('Group crosses splits');
    splits.set(item.group, item.split);
    const documents = docs.get(item.project);
    if (!item.targets.every(target => validTarget(target, documents, item.exclude))) {
      throw Error('Invalid evidence: ' + item.id);
    }
  }
}
