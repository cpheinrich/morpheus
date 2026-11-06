import { createHash } from "node:crypto";
import { type GitHubApi } from "../../src/cd/store.js";
/** Git database fake with real single-parent fast-forward semantics, not an expected-value ref. */
export class FakeGitHub implements GitHubApi {
  refs = new Map<string, string>(); blobs = new Map<string, string>(); trees = new Map<string, Record<string, string>>(); commits = new Map<string, { tree: { sha: string }; parents: { sha: string }[] }>();
  calls: { method: string; path: string; body: unknown }[] = []; loseNextAcknowledgment = false; afterLostAcknowledgment?: () => Promise<void>;
  private id(value: unknown): string { return createHash("sha1").update(JSON.stringify(value)).digest("hex"); }
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    this.calls.push({ method, path, body }); const route = path.replace(/^repos\/[^/]+\/[^/]+\//, ""), data = body as Record<string, unknown>;
    // The first route whose method and path match answers, in the order GitHub's paths are told apart.
    for (const [routeMethod, matches, answer] of this.routes()) if (method === routeMethod && matches(route)) return await answer(route, data) as T;
    throw new Error(`Unexpected fake GitHub request ${method} ${route}`);
  }
  private routes(): [string, (route: string) => boolean, (route: string, data: Record<string, unknown>) => unknown][] {
    const prefix = (start: string) => (route: string) => route.startsWith(start), exact = (path: string) => (route: string) => route === path;
    return [
      ["GET", prefix("git/ref/"), (route) => this.readRef(route.slice("git/ref/".length))],
      ["POST", exact("git/refs"), (_route, data) => this.createRef(data)],
      ["PATCH", prefix("git/refs/"), (route, data) => this.updateRef(route.slice("git/refs/".length), data)],
      ["GET", prefix("git/commits/"), (route) => this.commits.get(route.slice("git/commits/".length))],
      ["GET", prefix("git/trees/"), (route) => ({ tree: Object.entries(this.trees.get(route.slice("git/trees/".length))!).map(([path, sha]) => ({ path, sha, type: "blob" })), truncated: false })],
      ["GET", prefix("git/blobs/"), (route) => ({ encoding: "base64", content: Buffer.from(this.blobs.get(route.slice("git/blobs/".length))!).toString("base64") })],
      ["POST", exact("git/blobs"), (_route, data) => { const id = this.id(data.content); this.blobs.set(id, String(data.content)); return { sha: id }; }],
      ["POST", exact("git/trees"), (_route, data) => this.createTree(data)],
      ["POST", exact("git/commits"), (_route, data) => this.createCommit(data)],
      ["GET", prefix("contents/state.json?ref="), (route) => this.stateContent(route)],
      ["PUT", (route) => route.endsWith("/protection"), () => ({})],
    ];
  }
  private readRef(ref: string) {
    const value = this.refs.get(ref); if (!value) throw new Error("HTTP 404"); return { object: { sha: value, type: "commit" } };
  }
  private createRef(data: Record<string, unknown>) {
    const ref = String(data.ref).replace(/^refs\//, ""); if (this.refs.has(ref)) throw new Error("HTTP 422 reference exists"); this.refs.set(ref, String(data.sha)); return { ref };
  }
  /** True when `next` is `head` or descends from it through recorded parents. */
  private descends(next: string, head: string | undefined, commit: { parents: { sha: string }[] }) {
    const queue = commit.parents.map(parent => parent.sha);
    if (next === head) return true;
    while (queue.length) { const sha = queue.pop()!; if (sha === head) return true; queue.push(...(this.commits.get(sha)?.parents.map(parent => parent.sha) ?? [])); }
    return false;
  }
  private async updateRef(ref: string, data: Record<string, unknown>) {
    const head = this.refs.get(ref), next = String(data.sha), commit = this.commits.get(next)!;
    if (data.force !== false) throw new Error("Unexpected forced ref update");
    if (!this.descends(next, head, commit)) throw new Error("HTTP 422 not a fast forward"); this.refs.set(ref, next);
    if (this.loseNextAcknowledgment && !ref.endsWith("-backup")) { this.loseNextAcknowledgment = false; await this.afterLostAcknowledgment?.(); throw new Error("network response lost after accepted update"); }
    return { ref };
  }
  private createTree(data: Record<string, unknown>) {
    const tree = { ...(data.base_tree ? this.trees.get(String(data.base_tree)) : {}) };
    for (const file of data.tree as { path: string; sha: string }[]) tree[file.path] = file.sha;
    const id = this.id(tree); this.trees.set(id, tree); return { sha: id };
  }
  private createCommit(data: Record<string, unknown>) {
    const commit = { tree: { sha: String(data.tree) }, parents: (data.parents as string[]).map(sha => ({ sha })) }, id = this.id({ ...commit, message: data.message }); this.commits.set(id, commit); return { sha: id, ...commit };
  }
  private stateContent(route: string) {
    const head = route.split("=")[1]!, tree = this.trees.get(this.commits.get(head)!.tree.sha)!, content = this.blobs.get(tree["state.json"]!)!; return { content: Buffer.from(content).toString("base64"), encoding: "base64" };
  }

}
