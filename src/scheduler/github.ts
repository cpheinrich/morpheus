/**
 * The handful of GitHub REST reads and the one write the scheduler needs. Every failure throws:
 * an unreadable answer is never returned as an empty one, because an empty run history would
 * read as "never dispatched" and cause a duplicate. Error text carries the route and status,
 * never a header, so a token cannot reach a log.
 */
export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    /** True when the request may have taken effect: network failure, timeout or a 5xx. */
    readonly uncertain: boolean,
  ) {
    super(message);
  }
}

export interface Run {
  id: number;
  display_title: string;
  html_url: string;
  created_at: string;
  run_attempt?: number;
  workflow_id?: number;
}

export interface Job {
  id: number;
  run_attempt?: number;
  steps?: Array<{ name: string; status: string; conclusion: string | null }>;
}

export interface GitHubApi {
  defaultBranch(repo: string): Promise<string>;
  /** File text, or null for a definite 404 in a repository already shown to be readable. */
  file(repo: string, path: string, ref: string): Promise<string | null>;
  lastCommitAt(repo: string, path: string, ref: string): Promise<Date>;
  workflow(repo: string, file: string): Promise<{ id: number; state: string } | null>;
  runs(repo: string, workflow: string | number, since: Date): Promise<Run[]>;
  run(repo: string, runId: number): Promise<Run>;
  jobs(repo: string, runId: number): Promise<Job[]>;
  dispatch(
    repo: string,
    workflow: string,
    ref: string,
    inputs: Record<string, string | number | boolean>,
  ): Promise<{ runId: number; runUrl: string }>;
}

const MAX_PAGES = 10;

export function createGitHub(
  token: string,
  options: { baseUrl?: string; timeoutMs?: number; fetch?: typeof fetch } = {},
): GitHubApi {
  const base = (options.baseUrl ?? "https://api.github.com").replace(/\/$/, "");
  const timeoutMs = options.timeoutMs ?? 15_000;
  const doFetch = options.fetch ?? fetch;

  async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new GitHubError(`${method} ${route(path)}: ${(error as Error).name}`, null, true);
    }
    const text = await response.text().catch(() => "");
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (response.status >= 300) {
      const detail = typeof (json as { message?: unknown })?.message === "string"
        ? `: ${(json as { message: string }).message.slice(0, 200)}`
        : "";
      throw new GitHubError(`${method} ${route(path)} → ${response.status}${detail}`, response.status, response.status >= 500);
    }
    return { status: response.status, json };
  }

  async function paged<T>(path: string, key: string): Promise<T[]> {
    const seen = new Map<number, T>();
    let total: number | null = null;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { json } = await call("GET", `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
      const body = json as Record<string, unknown> | null;
      const items = body?.[key];
      if (!Array.isArray(items) || typeof body?.total_count !== "number") {
        throw new GitHubError(`GET ${route(path)}: unreadable page ${page}`, null, false);
      }
      total ??= body.total_count;
      for (const item of items as Array<T & { id: number }>) seen.set(item.id, item);
      if (seen.size >= total) return [...seen.values()];
      if (items.length === 0) break;
    }
    throw new GitHubError(`GET ${route(path)}: history truncated at ${seen.size} of ${total}`, null, false);
  }

  return {
    async defaultBranch(repo) {
      const { json } = await call("GET", `/repos/${repo}`);
      const branch = (json as { default_branch?: unknown })?.default_branch;
      if (typeof branch !== "string" || !branch) throw new GitHubError(`GET /repos/${repo}: no default branch`, null, false);
      return branch;
    },
    async file(repo, path, ref) {
      try {
        const { json } = await call("GET", `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`);
        const content = (json as { content?: unknown; encoding?: unknown })?.content;
        if (typeof content !== "string" || (json as { encoding?: unknown }).encoding !== "base64") {
          throw new GitHubError(`GET contents ${path}: not a file`, null, false);
        }
        return Buffer.from(content, "base64").toString("utf8");
      } catch (error) {
        if (error instanceof GitHubError && error.status === 404) return null;
        throw error;
      }
    },
    async lastCommitAt(repo, path, ref) {
      const { json } = await call(
        "GET",
        `/repos/${repo}/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(ref)}&per_page=1`,
      );
      const date = (json as Array<{ commit?: { committer?: { date?: string } } }>)?.[0]?.commit?.committer?.date;
      const parsed = date ? new Date(date) : null;
      if (!parsed || Number.isNaN(parsed.getTime())) throw new GitHubError(`GET commits for ${path}: no commit date`, null, false);
      return parsed;
    },
    async workflow(repo, file) {
      try {
        const { json } = await call("GET", `/repos/${repo}/actions/workflows/${encodeURIComponent(file)}`);
        const body = json as { id?: unknown; state?: unknown };
        if (typeof body?.id !== "number" || typeof body.state !== "string") {
          throw new GitHubError(`GET workflow ${file}: unreadable`, null, false);
        }
        return { id: body.id, state: body.state };
      } catch (error) {
        if (error instanceof GitHubError && error.status === 404) return null;
        throw error;
      }
    },
    runs(repo, workflow, since) {
      const created = encodeURIComponent(`>=${since.toISOString()}`);
      return paged<Run>(
        `/repos/${repo}/actions/workflows/${encodeURIComponent(String(workflow))}/runs?event=workflow_dispatch&exclude_pull_requests=true&created=${created}`,
        "workflow_runs",
      );
    },
    async run(repo, runId) {
      const { json } = await call("GET", `/repos/${repo}/actions/runs/${runId}`);
      const run = json as Run;
      if (typeof run?.id !== "number" || typeof run.display_title !== "string") {
        throw new GitHubError(`GET run ${runId}: unreadable`, null, false);
      }
      return run;
    },
    jobs(repo, runId) {
      return paged<Job>(`/repos/${repo}/actions/runs/${runId}/jobs?filter=all`, "jobs");
    },
    async dispatch(repo, workflow, ref, inputs) {
      const { json } = await call("POST", `/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
        ref,
        inputs,
        return_run_details: true,
      });
      const body = json as { workflow_run_id?: unknown; html_url?: unknown };
      if (typeof body?.workflow_run_id !== "number") {
        // Accepted, but without the run details asked for: treat as unknown and reconcile by history.
        throw new GitHubError(`POST dispatch ${workflow}: accepted without run details`, null, true);
      }
      return { runId: body.workflow_run_id, runUrl: typeof body.html_url === "string" ? body.html_url : "" };
    },
  };
}

/** The route without its query, which may carry a ref but is never needed to diagnose. */
function route(path: string): string {
  return path.split("?")[0]!;
}
