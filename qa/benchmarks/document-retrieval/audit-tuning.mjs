import {readFileSync, readdirSync, writeFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {scoreTimedEvidence} from './evidence-timing.mjs';

const [root] = process.argv.slice(2);
const read = path => JSON.parse(readFileSync(path));
const manifest = read(join(root, 'evo', 'snapshot.json'));
const allowed = new Set(manifest.files.map(f => f.path));
const sourceText = path => allowed.has(path) ? readFileSync(join(root, 'evo', path), 'utf8') : null;
const rows = [];
for (const stage of ['pilot', 'pilot-cli', 'validation']) {
  const dir = join(root, stage);
  const config = read(join(dir, 'config.json'));
  const fixtures = read(join(root, config.fixture));
  for (const file of readdirSync(dir).filter(f => f.endsWith('.result.json'))) {
    const prefix = join(dir, file.replace(/\.result\.json$/, ''));
    const row = read(prefix + '.result.json');
    const q = fixtures.find(q => q.id === row.id);
    const answer = existsSync(prefix + '.answer.json') ? read(prefix + '.answer.json') : null;
    const events = read(prefix + '.events.json');
    const tools = events.filter(e => e.event.type === 'item.completed' &&
      ['command_execution', 'mcp_tool_call'].includes(e.event.item?.type)).map(e => e.event.item);
    const queries = tools.filter(t => t.type === 'mcp_tool_call' && t.server === 'qmd' && t.tool === 'query');
    const stderr = readFileSync(prefix + '.stderr', 'utf8');
    rows.push({stage, ...row, ...scoreTimedEvidence(q.groups, answer?.citations ?? [], events, sourceText),
      question: q.question, gold: q.groups, answer,
      commands: tools.filter(t => t.type === 'command_execution').map(t => t.command),
      mcpCalls: tools.filter(t => t.type === 'mcp_tool_call').map(t => ({server: t.server, tool: t.tool, arguments: t.arguments})),
      qmdPolicyViolations: queries.filter(t => t.arguments.rerank !== false || !Array.isArray(t.arguments.searches) ||
        t.arguments.query !== undefined || t.arguments.searches.some(s => !['lex', 'vec', 'hyde'].includes(s.type))).length,
      otherMcpCalls: tools.filter(t => t.type === 'mcp_tool_call' && t.server !== 'qmd').length,
      ambientInstructionWarning: stderr.includes('project doc exceeds remaining budget'),
      ambientCloudflareWarning: stderr.includes('server_name="cloudflare-api"'),
    });
  }
}
// Intentionally private: source passages and commands support human adjudication.
writeFileSync(join(root, 'private-tuning-audit.json'), JSON.stringify(rows, null, 2));
console.log(JSON.stringify({n: rows.length, invalidCitations: rows.reduce((n,r) => n + r.invalidCitations, 0),
  policyViolations: rows.reduce((n,r) => n + r.qmdPolicyViolations, 0),
  otherMcpCalls: rows.reduce((n,r) => n + r.otherMcpCalls, 0),
  ambientInstructionWarnings: rows.filter(r => r.ambientInstructionWarning).length,
  ambientCloudflareWarnings: rows.filter(r => r.ambientCloudflareWarning).length}));
