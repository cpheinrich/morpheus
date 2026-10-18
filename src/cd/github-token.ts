import { appendFile } from "node:fs/promises";
import { invariant } from "./state.js";
import { hash } from "./schema.js";

export const repairTokenPermissions = { contents: "write", pull_requests: "write", issues: "write", actions: "write", workflows: "write", checks: "read", statuses: "read" };
export async function probeGitHubToken(environment: NodeJS.ProcessEnv, fetcher: typeof fetch = fetch): Promise<unknown> {
  const repository = environment.GITHUB_REPOSITORY, token = environment.GH_TOKEN, run = environment.GITHUB_RUN_ID, attempt = environment.GITHUB_RUN_ATTEMPT;
  invariant(repository && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) && token && run && /^[0-9]+$/.test(run) && attempt && /^[0-9]+$/.test(attempt), "Capability probe requires exact Actions repository/run and scoped GH_TOKEN");
  const api = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const response = await fetcher(`https://api.github.com/repos/${repository}/${path}`, { method, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15_000), redirect: "error" });
    invariant(response.ok, `GitHub capability probe ${method} ${path} HTTP ${response.status}`); return (response.status === 204 ? undefined : await response.json()) as T;
  };
  const repo = await api<{ default_branch: string }>("GET", ""), main = await api<{ object: { sha: string } }>("GET", `git/ref/heads/${repo.default_branch}`);
  const ref = `morpheus-cd-credential-probe-${run}-${attempt}`, path = ".github/workflows/morpheus-cd-credential-probe.yml", content = "name: Morpheus CD credential probe\non: workflow_dispatch\npermissions: {}\njobs:\n  probe:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: 'true'\n";
  const base = await api<{ tree: { sha: string } }>("GET", `git/commits/${main.object.sha}`), blob = await api<{ sha: string }>("POST", "git/blobs", { content, encoding: "utf-8" });
  const tree = await api<{ sha: string }>("POST", "git/trees", { base_tree: base.tree.sha, tree: [{ path, mode: "100644", type: "blob", sha: blob.sha }] });
  const commit = await api<{ sha: string }>("POST", "git/commits", { message: `CD workflow-write capability probe ${run}/${attempt}`, tree: tree.sha, parents: [main.object.sha] });
  let created = false;
  try {
    await api("POST", "git/refs", { ref: `refs/heads/${ref}`, sha: commit.sha }); created = true;
    const actual = await api<{ content: string }>("GET", `contents/${path}?ref=${ref}`);
    invariant(Buffer.from(actual.content, "base64").toString("utf8") === content, "Workflow-write capability readback mismatch");
    return { repository, runId: run, runAttempt: attempt, workflowWriteVerified: true, commit: commit.sha, contentSha256: hash(content), temporaryRef: ref, workflowDispatched: false };
  } finally {
    if (created) { const observed = await api<{ object: { sha: string } }>("GET", `git/ref/heads/${ref}`); invariant(observed.object.sha === commit.sha, "Owned probe ref advanced; preserve it for diagnosis"); await api("DELETE", `git/refs/heads/${ref}`); }
  }
}
/** Mirrors the official Claude action OIDC exchange, scoped to this Actions workflow. */
export async function githubToken(environment: NodeJS.ProcessEnv, revoke = false, fetcher: typeof fetch = fetch): Promise<unknown> {
  if (revoke) {
    invariant(environment.GH_TOKEN, "Token revocation requires GH_TOKEN");
    const response = await fetcher("https://api.github.com/installation/token", { method: "DELETE", headers: { Authorization: `Bearer ${environment.GH_TOKEN}`, Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(15_000), redirect: "error" });
    invariant(response.ok || response.status === 401, `GitHub installation token revocation HTTP ${response.status}`);
    return { revoked: response.ok, alreadyInvalid: response.status === 401 };
  }
  invariant(environment.GITHUB_ACTIONS === "true" && environment.ACTIONS_ID_TOKEN_REQUEST_URL && environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN && environment.GITHUB_OUTPUT, "GitHub token exchange requires an Actions workflow with id-token:write and GITHUB_OUTPUT");
  const url = new URL(environment.ACTIONS_ID_TOKEN_REQUEST_URL);
  invariant(url.protocol === "https:" && url.hostname.endsWith(".actions.githubusercontent.com"), "Unrecognized GitHub OIDC endpoint");
  url.searchParams.set("audience", "claude-code-github-action");
  const oidc = await fetcher(url, { headers: { Authorization: `Bearer ${environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` }, signal: AbortSignal.timeout(15_000), redirect: "error" });
  invariant(oidc.ok, `GitHub OIDC request HTTP ${oidc.status}`);
  const identity = await oidc.json() as { value?: string }; invariant(identity.value, "GitHub OIDC response omitted identity");
  const exchange = await fetcher("https://api.anthropic.com/api/github/github-app-token-exchange", { method: "POST", headers: { Authorization: `Bearer ${identity.value}`, "Content-Type": "application/json" }, body: JSON.stringify({ permissions: repairTokenPermissions }), signal: AbortSignal.timeout(15_000), redirect: "error" });
  // The workflow must already exist on default branch. Do not bypass the provider's check.
  invariant(exchange.ok, `Claude GitHub App exchange HTTP ${exchange.status}; verify installed App and reviewed default-branch workflow`);
  const result = await exchange.json() as { token?: string; app_token?: string; expires_at?: string; permissions?: Record<string, string> };
  const token = result.token ?? result.app_token; invariant(token && /^[A-Za-z0-9_]+$/.test(token), "App exchange omitted a valid token");
  console.log(`::add-mask::${token}`);
  await appendFile(environment.GITHUB_OUTPUT, `token=${token}\n`, { mode: 0o600 });
  return { created: true, expiresAt: result.expires_at, requestedPermissions: repairTokenPermissions, ...(result.permissions ? { grantedPermissions: result.permissions } : {}) };
}
