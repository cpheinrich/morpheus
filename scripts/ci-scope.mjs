import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const jobs = ['node', 'browser', 'bridge', 'artifacts'];
const flags = value => Object.fromEntries(jobs.map(job => [job, value]));

/** Only known inert prose can skip everything. Unknown paths run every check. */
export function selectPaths(paths) {
  const selected = flags(false);
  for (const path of paths) {
    if (/^(?:docs\/(?!runbooks\/|examples\/)|hq\/|qa\/acceptance\/|\.agent\/worklog\/)[\s\S]+\.md$/.test(path)) continue;
    if (path.startsWith('plugins/factory/')) {
      selected.node = selected.bridge = true;
    } else if (path.startsWith('.github/actions/ios-testflight-upload/') || path.startsWith('tests/artifacts/')) {
      selected.node = selected.artifacts = selected.browser = true;
    } else if (path === 'tests/artifact-workflows.test.ts') {
      selected.node = selected.artifacts = true;
    } else if (/^(?:src\/|dist\/|tests\/|docs\/runbooks\/|docs\/examples\/|\.agents\/|\.claude\/)/.test(path) && path !== 'tests/ci-scope.test.ts') {
      selected.node = true;
      if (/^(?:src\/qa\/|dist\/qa\/|tests\/browser\/)/.test(path)) selected.browser = true;
    } else {
      return flags(true);
    }
  }
  return selected;
}

/** Main pushes remain the full integration backstop; uncertain PR diffs run all. */
export function detectScope(env = process.env, cwd = process.cwd()) {
  if (env.GITHUB_EVENT_NAME !== 'pull_request') return { ...flags(true), reason: 'full integration run' };
  try {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
    const { base, head } = event.pull_request;
    if (![base.sha, head.sha].every(sha => /^[a-f0-9]{40}$/.test(sha))) throw new Error('invalid commit');
    const git = args => execFileSync('git', args, { cwd, env, encoding: 'utf8', timeout: 15_000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    if (realpathSync(git(['rev-parse', '--show-toplevel']).trim()) !== realpathSync(cwd)) throw new Error('wrong repository');
    for (const sha of [base.sha, head.sha]) git(['rev-parse', '--verify', `${sha}^{commit}`]);
    const bases = git(['merge-base', '--all', base.sha, head.sha]).trim().split('\n');
    if (bases.length !== 1 || !/^[a-f0-9]{40}$/.test(bases[0])) throw new Error('ambiguous base');
    // No rename heuristics: both old and new paths must contribute to selection.
    const raw = git(['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-only', '-z', bases[0], head.sha, '--']);
    if (raw && !raw.endsWith('\0')) throw new Error('incomplete paths');
    const paths = raw ? raw.slice(0, -1).split('\0') : [];
    return { ...selectPaths(paths), reason: `verified cumulative PR diff: ${paths.length} path(s)` };
  } catch {
    return { ...flags(true), reason: 'comparison unavailable; run all checks' };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const scope = detectScope();
  const output = jobs.map(job => `${job}=${scope[job]}\n`).join('');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
  console.log(JSON.stringify(scope));
}
