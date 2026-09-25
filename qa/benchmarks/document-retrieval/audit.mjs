import {readFileSync, readdirSync, writeFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {normalize, evidenceRecall} from './score.mjs';

const [root] = process.argv.slice(2);
if (!root) throw new Error('Usage: node audit.mjs PRIVATE_RUN_DIRECTORY');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const fixtures = read(join(root, 'fixtures.json'));
const rows = [];
for (const file of readdirSync(join(root, 'agents')).filter(f => f.endsWith('.result.json'))) {
  const prefix = join(root, 'agents', file.replace(/\.result\.json$/, ''));
  const result = read(prefix + '.result.json');
  const question = fixtures.find(q => q.id === result.id);
  const manifest = read(join(root, result.project, 'snapshot.json'));
  const answer = existsSync(prefix + '.answer.json') ? read(prefix + '.answer.json') : null;
  const events = readFileSync(prefix + '.jsonl', 'utf8').trim().split('\n').flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  const tools = events.filter(e => e.type === 'item.completed' &&
    ['command_execution', 'mcp_tool_call'].includes(e.item?.type)).map(e => e.item);
  const citations = (answer?.citations ?? []).map(citation => {
    const path = citation.path.replace(/^\.\//, '');
    const known = manifest.files.some(f => f.path === path);
    const text = known ? readFileSync(join(root, result.project, path), 'utf8') : '';
    return {...citation, validSourceQuote: known && normalize(citation.quote).length >= 30 &&
      normalize(text).includes(normalize(citation.quote)),
      goldRecall: evidenceRecall(question.groups, [citation])};
  });
  const qmdQueries = tools.filter(i => i.type === 'mcp_tool_call' && i.server === 'qmd' && i.tool === 'query');
  rows.push({
    id: result.id, arm: result.arm, status: result.status, recall: result.recall,
    question: question.question, answer: answer?.answer ?? null, citations,
    qmdPolicyViolations: qmdQueries.filter(i => i.arguments.rerank !== false ||
      !Array.isArray(i.arguments.searches) || i.arguments.query !== undefined ||
      i.arguments.searches.some(s => !['lex', 'vec'].includes(s.type))).length,
    qmdQueryModes: qmdQueries.map(i => [...new Set((i.arguments.searches ?? []).map(s =>
      ['lex', 'vec'].includes(s.type) ? s.type : 'other'))].sort().join('+') || 'auto'),
    otherMcpCalls: tools.filter(i => i.type === 'mcp_tool_call' && i.server !== 'qmd').map(i => i.server),
    commands: tools.filter(i => i.type === 'command_execution').map(i => i.command),
  });
}
// This file intentionally includes private text for local adjudication. Never publish it.
writeFileSync(join(root, 'private-audit.json'), JSON.stringify(rows, null, 2));
console.log(JSON.stringify({
  n: rows.length,
  misses: rows.filter(r => r.recall < 1).map(r => ({id: r.id, arm: r.arm, recall: r.recall, status: r.status})),
  invalidQuoteCount: rows.flatMap(r => r.citations).filter(c => !c.validSourceQuote).length,
  qmdPolicyViolations: rows.reduce((sum, r) => sum + r.qmdPolicyViolations, 0),
  otherMcpCalls: rows.flatMap(r => r.otherMcpCalls),
}));
