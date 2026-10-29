import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgentWork, type CdConfig } from "../../src/cd/schema.js";
import { GitHubStore } from "../../src/cd/store.js";
import { after, repairWork } from "../../src/cd/state.js";
import { FakeGitHub } from "./fake-github.js";
import { config, now, prepared } from "./fixtures.js";

export const account = { email: "operator@example.com", subscription: "max" } as const;

/** A synthetic `claude` executable: auth status, the stream-json get_usage control request and a -p run. Never contacts a model. */
const SCRIPT = `import { appendFile, readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
const [calls, ...args] = process.argv.slice(2);
const file = (suffix, fallback) => readFile(calls + suffix, 'utf8').catch(() => fallback);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const envSeen = Object.keys(process.env).filter(name => /^(ANTHROPIC_|CLAUDE_CODE_|CCR_)/.test(name) || name === 'AWS_BEARER_TOKEN_BEDROCK');
const autoupdater = process.env.DISABLE_AUTOUPDATER;
if (args[0] === 'auth') {
  await appendFile(calls + '.admission', JSON.stringify({ args, envSeen }) + '\\n');
  process.stdout.write(await file('.auth', JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', email: 'Operator@Example.com', subscriptionType: 'max', orgId: 'synthetic-org' })));
  process.exit(Number(await file('.auth-exit', '0')));
}
const reader = args.includes('--no-session-persistence');
if (reader) await appendFile(calls + '.usage-args', JSON.stringify({ args, envSeen, autoupdater, cwd: process.cwd() }) + '\\n');
if (reader && await file('.usage-mode', '') === 'exit') process.exit(3);
const initReply = JSON.parse(await file(reader ? '.init-reply' : '.run-init-reply', await file('.init-reply', JSON.stringify({ claude_code_version: '2.1.312', account: { email: 'Operator@Example.com', organization: 'Synthetic Org', subscriptionType: 'Claude Max', apiProvider: 'firstParty' } }))));
const respond = (id, subtype, response) => console.log(JSON.stringify({ type: 'control_response', response: subtype === 'success' ? { subtype, request_id: id, response } : { subtype, request_id: id, error: 'not supported in this context' } }));
for await (const line of createInterface({ input: process.stdin })) {
  const message = JSON.parse(line);
  if (message.type === 'control_request' && message.request.subtype === 'initialize') {
    await appendFile(calls + '.initialize', JSON.stringify(reader ? 'reader' : 'run') + '\\n');
    respond(message.request_id, 'success', initReply);
  } else if (message.type === 'control_request' && message.request.subtype === 'get_usage') {
    await appendFile(calls + '.quota-count', JSON.stringify('read') + '\\n');
    const delay = Number(await file('.usage-delay', '0')); await pause(delay);
    const mode = await file('.usage-mode', '');
    if (mode === 'error') respond(message.request_id, 'error');
    else if (mode !== 'silent') respond(message.request_id, 'success', JSON.parse(await file('.usage', '{}')));
  } else if (message.type === 'user' && !reader) {
    const prompt = message.message.content;
    await appendFile(calls, JSON.stringify({ args, prompt, envSeen, autoupdater }) + '\\n');
    const result = JSON.parse(await file('.result', JSON.stringify({ outcome: 'checkpoint', summary: 'Synthetic Claude checkpoint', evidence: ['synthetic evidence'], pullRequest: '', sourceSha: '', reviewHead: '', missingCapability: '' })));
    const init = await file('.init', JSON.stringify({ type: 'system', subtype: 'init', apiKeySource: 'none', session_id: 'claude-session-new' }));
    if (init.trim() !== 'none') console.log(init.trim());
    const event = await file('.event', ''), hold = Number(await file('.event-hold', '0'));
    if (event) { console.log(event.trim()); await pause(hold); }
    console.log(JSON.stringify({ type: 'result', session_id: 'claude-session-new', usage: { input_tokens: 1, output_tokens: 1 }, structured_output: result }));
  }
}
process.exit(0);
`;

/** A valid get_usage reply; tests mutate it to break one rule at a time. */
export function usageReply(at = new Date().toISOString(), five = 12, seven = 30): Record<string, unknown> {
  return {
    subscription_type: "max", rate_limits_available: true, session: { total_cost_usd: 0 }, behaviors: null,
    rate_limits: {
      five_hour: { utilization: five, resets_at: after(at, 120) }, seven_day: { utilization: seven, resets_at: after(at, 60 * 24 * 3) },
      seven_day_opus: null, seven_day_sonnet: null,
      model_scoped: [{ display_name: "Fable", utilization: 3, resets_at: after(at, 60 * 24 * 3) }],
      extra_usage: { is_enabled: false, monthly_limit: null, used_credits: null, utilization: null },
      limits: [{ kind: "session", group: "session", percent: five, resets_at: after(at, 120), scope: null },
        { kind: "weekly_all", group: "weekly", percent: seven, resets_at: after(at, 60 * 24 * 3), scope: null },
        { kind: "weekly_scoped", group: "weekly", percent: 3, resets_at: after(at, 60 * 24 * 3), scope: { model: { display_name: "Fable", id: null }, surface: null } }],
    },
  };
}

export async function claudeFixture(directories: string[], options: { history?: AgentWork["invocations"]; model?: string; local?: boolean } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "cd-claude-worker-")); directories.push(directory);
  const script = join(directory, "synthetic-claude.mjs"), callsPath = join(directory, "calls.jsonl");
  await writeFile(script, SCRIPT);
  await writeFile(callsPath + ".usage", JSON.stringify(usageReply()));
  const cfg: CdConfig = config();
  cfg.agents = { local: { command: ["codex"] }, claude: { command: [process.execPath, script, callsPath], model: options.model ?? "fable", account: { ...account } } };
  const api = new FakeGitHub(), store = new GitHubStore(api, cfg), at = new Date().toISOString();
  await store.initialize(at, "claude-test-epoch");
  const fixture = prepared();
  const seeded = await store.transact("seed", "fixture", at, state => {
    Object.assign(state, { ...fixture.state, epoch: state.epoch, configurationDigest: state.configurationDigest, transitions: state.transitions });
    const id = repairWork(state, fixture.intentId, ["Original durable diagnostic"], now);
    state.agents[id]!.invocations = options.history ?? [];
    return id;
  });
  const lines = async (suffix = "") => (await readFile(callsPath + suffix, "utf8").catch(() => "")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  const set = (suffix: string, value: unknown) => writeFile(callsPath + suffix, typeof value === "string" ? value : JSON.stringify(value));
  return { cfg, api, store, directory, callsPath, script, workId: seeded.result, lines, set };
}
