import { createHash } from "node:crypto";
import { type GitHubApi } from "../../src/cd/store.js";
/** Git database fake with real single-parent fast-forward semantics, not an expected-value ref. */
export class FakeGitHub implements GitHubApi {
  refs = new Map<string, string>(); blobs = new Map<string, string>(); trees = new Map<string, Record<string, string>>(); commits = new Map<string, { tree: { sha: string }; parents: { sha: string }[] }>();
  calls: { method: string; path: string; body: unknown }[] = []; loseNextAcknowledgment = false; afterLostAcknowledgment?: () => Promise<void>;
  private id(value: unknown): string { return createHash("sha1").update(JSON.stringify(value)).digest("hex"); }
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    this.calls.push({ method, path, body }); const route = path.replace(/^repos\/[^/]+\/[^/]+\//, ""), data = body as Record<string, unknown>;
    if (method === "GET" && route.startsWith("git/ref/")) {
      const ref = route.slice("git/ref/".length), value = this.refs.get(ref); if (!value) throw new Error("HTTP 404"); return { object: { sha: value, type: "commit" } } as T;
    }
    if (method === "POST" && route === "git/refs") {
      const ref = String(data.ref).replace(/^refs\//, ""); if (this.refs.has(ref)) throw new Error("HTTP 422 reference exists"); this.refs.set(ref, String(data.sha)); return { ref } as T;
    }
    if (method === "PATCH" && route.startsWith("git/refs/")) {
      const ref = route.slice("git/refs/".length), head = this.refs.get(ref), next = String(data.sha), commit = this.commits.get(next)!;
      if (data.force !== false) throw new Error("Unexpected forced ref update");
      let descendant = next === head, queue = commit.parents.map(parent => parent.sha);
      while (queue.length) { const sha = queue.pop()!; if (sha === head) { descendant = true; break; } queue.push(...(this.commits.get(sha)?.parents.map(parent => parent.sha) ?? [])); }
      if (!descendant) throw new Error("HTTP 422 not a fast forward"); this.refs.set(ref, next);
      if (this.loseNextAcknowledgment && !ref.endsWith("-backup")) { this.loseNextAcknowledgment = false; await this.afterLostAcknowledgment?.(); throw new Error("network response lost after accepted update"); }
      return { ref } as T;
    }
    if (method === "GET" && route.startsWith("git/commits/")) return this.commits.get(route.slice("git/commits/".length)) as T;
    if (method === "GET" && route.startsWith("git/trees/")) return { tree: Object.entries(this.trees.get(route.slice("git/trees/".length))!).map(([path, sha]) => ({ path, sha, type: "blob" })), truncated: false } as T;
    if (method === "GET" && route.startsWith("git/blobs/")) return { encoding: "base64", content: Buffer.from(this.blobs.get(route.slice("git/blobs/".length))!).toString("base64") } as T;
    if (method === "POST" && route === "git/blobs") { const id = this.id(data.content); this.blobs.set(id, String(data.content)); return { sha: id } as T; }
    if (method === "POST" && route === "git/trees") {
      const tree = { ...(data.base_tree ? this.trees.get(String(data.base_tree)) : {}) };
      for (const file of data.tree as { path: string; sha: string }[]) tree[file.path] = file.sha;
      const id = this.id(tree); this.trees.set(id, tree); return { sha: id } as T;
    }
    if (method === "POST" && route === "git/commits") { const commit = { tree: { sha: String(data.tree) }, parents: (data.parents as string[]).map(sha => ({ sha })) }, id = this.id({ ...commit, message: data.message }); this.commits.set(id, commit); return { sha: id, ...commit } as T; }
    if (method === "GET" && route.startsWith("contents/state.json?ref=")) { const head = route.split("=")[1]!, tree = this.trees.get(this.commits.get(head)!.tree.sha)!, content = this.blobs.get(tree["state.json"]!)!; return { content: Buffer.from(content).toString("base64"), encoding: "base64" } as T; }
    if (method === "PUT" && route.endsWith("/protection")) return {} as T;
    throw new Error(`Unexpected fake GitHub request ${method} ${route}`);
  }
}
