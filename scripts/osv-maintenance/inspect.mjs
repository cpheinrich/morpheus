#!/usr/bin/env node
// Read-only handoff: GitHub scans; the local agent owns governed fix PRs.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const REPO = 'cpheinrich/morpheus';

export function validateRun(run, workflowId) {
  if (run?.repository?.full_name !== REPO || run.workflow_id !== workflowId ||
      run.head_branch !== 'main' || !['schedule', 'workflow_dispatch', 'push'].includes(run.event) ||
      !Number.isSafeInteger(run.id) || !Number.isSafeInteger(run.run_attempt) ||
      !/^[a-f0-9]{40}$/.test(run.head_sha)) {
    throw new Error('Expected an exact Security run on Morpheus main');
  }
  if (run.status !== 'completed') return 'waiting';
  if (!['success', 'failure'].includes(run.conclusion)) {
    throw new Error(`Scan did not finish normally: ${run.conclusion}`);
  }
  return 'completed';
}

export function findingsFromSarif(sarif) {
  if (sarif?.version !== '2.1.0' || !Array.isArray(sarif.runs) || sarif.runs.length === 0) {
    throw new Error('Missing SARIF runs; no evidence of a clean scan');
  }
  const groups = new Map();
  for (const run of sarif.runs) {
    if (run?.tool?.driver?.name !== 'osv-scanner' || !Array.isArray(run.results) ||
        run.invocations?.some((invocation) => invocation.executionSuccessful === false)) {
      throw new Error('Invalid or failed OSV SARIF run');
    }
    for (const result of run.results) {
      // Match only the pinned scanner's package coordinate, never execute report text.
      const match = /^Package '(.+)@([^'\s]+)' is vulnerable to '/.exec(result.message?.text ?? '');
      const paths = result.locations?.map((location) => location.physicalLocation?.artifactLocation?.uri);
      if (!match || !result.ruleId || !paths?.length || paths.some((path) => typeof path !== 'string' || !path)) {
        throw new Error('Unrecognized OSV finding; inspect the full artifact manually');
      }
      const [, dependency, version] = match;
      const group = groups.get(dependency) ?? { dependency, versions: [], advisories: [], paths: [] };
      group.versions = [...new Set([...group.versions, version])].sort();
      group.advisories = [...new Set([...group.advisories, result.ruleId])].sort();
      group.paths = [...new Set([...group.paths, ...paths])].sort();
      groups.set(dependency, group);
    }
  }
  return [...groups.values()].sort((a, b) => a.dependency.localeCompare(b.dependency));
}

export function inspect({ runId, gh = runGh } = {}) {
  const api = (endpoint) => JSON.parse(gh(['api', endpoint]));
  const workflow = api(`repos/${REPO}/actions/workflows/security.yml`);
  let selected = runId;
  if (selected === undefined) {
    // Query schedule and manual separately so unrelated push runs cannot crowd them out.
    const candidates = ['schedule', 'workflow_dispatch'].flatMap((event) =>
      api(`repos/${REPO}/actions/workflows/${workflow.id}/runs?branch=main&event=${event}&per_page=1`).workflow_runs);
    if (!candidates.length) return { status: 'no-run', findings: [] };
    selected = candidates.sort((a, b) => b.id - a.id)[0].id;
  }
  if (!/^\d+$/.test(String(selected))) throw new Error('Run id must be numeric');
  const run = api(`repos/${REPO}/actions/runs/${selected}`);
  const status = validateRun(run, workflow.id);
  const receipt = { status, runId: run.id, attempt: run.run_attempt, sha: run.head_sha, url: run.html_url };
  if (status === 'waiting') return receipt;
  const directory = mkdtempSync(join(tmpdir(), 'morpheus-osv-'));
  try {
    gh(['run', 'download', String(run.id), '--repo', REPO, '--name', 'OSV Scanner SARIF file', '--dir', directory]);
    const findings = findingsFromSarif(JSON.parse(readFileSync(join(directory, 'results.sarif'), 'utf8')));
    // SARIF can upload successfully even if another scan job failed.
    if (findings.length === 0 && run.conclusion !== 'success') {
      throw new Error('Failed workflow with empty SARIF is not a clean scan');
    }
    return { ...receipt, status: findings.length ? 'findings' : 'clean', findings };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function runGh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', timeout: 120_000, maxBuffer: 20 * 1024 * 1024 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length > 3) throw new Error('Usage: node scripts/osv-maintenance/inspect.mjs [run-id]');
    console.log(JSON.stringify(inspect({ runId: process.argv[2] }), null, 2));
  } catch (error) {
    console.error(`OSV inspection failed: ${error.message}`);
    process.exitCode = 1;
  }
}
