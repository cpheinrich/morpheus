import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { parseState, type CdConfig, type CdEvent, type CdState } from "./schema.js";
import { newState, invariant } from "./state.js";
import { assertTransition } from "./invariants.js";
import { CdWait } from "./errors.js";

export interface GitHubApi { request<T>(method: string, path: string, body?: unknown): Promise<T> }
const exec = promisify(execFile);
export class GhApi implements GitHubApi {
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const args = ["api", "--method", method, path, "-H", "Accept: application/vnd.github+json"];
    const child = exec("gh", body === undefined ? args : [...args, "--input", "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 120_000 });
    if (body !== undefined) { child.child.stdin?.on("error", () => {}); child.child.stdin?.end(JSON.stringify(body)); }
    try { const { stdout } = await child; return (stdout.trim() ? JSON.parse(stdout) : undefined) as T; }
    catch (error) { if (/HTTP (429|5[0-9]{2})|rate limit|timed out|ECONNRESET|ENETUNREACH|ETIMEDOUT/i.test(errorText(error))) throw new CdWait(`GitHub ${method} ${path} temporarily unavailable`, "github-provider"); throw error; }
  }
}
export function errorText(error: unknown): string { const value = error as { stderr?: unknown; message?: string }; return String(value.stderr ?? value.message ?? error); }
export function isMissing(error: unknown): boolean { return /HTTP 404|\b404\b/.test(errorText(error)); }
export async function pages<T>(api: GitHubApi, path: string, key?: string): Promise<T[]> {
  const result: T[] = [];
  for (let page = 1; ; page++) {
    const data = await api.request<T[] | Record<string, T[]>>("GET", `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
    const items = key ? (data as Record<string, T[]>)[key] : data as T[];
    invariant(Array.isArray(items), `Expected paginated list at ${path}`); result.push(...items);
    if (items.length < 100) return result;
  }
}
export interface Snapshot { head: string; tree: string; state: CdState }
export interface Transaction<T> { state: CdState; head: string; result: T; replayed: boolean }
export class GitHubStore {
  constructor(readonly api: GitHubApi, readonly config: CdConfig) {}
  private get root(): string { return `repos/${this.config.repository}`; }
  async read(): Promise<Snapshot> {
    let ref: { object: { sha: string } };
    try { ref = await this.api.request("GET", `${this.root}/git/ref/heads/${this.config.stateBranch}`); }
    catch (error) { if (isMissing(error)) throw new Error("CD state branch is missing; do not recreate an initialized ledger. Diagnose and recover its backup."); throw error; }
    const commit = await this.api.request<{ tree: { sha: string } }>("GET", `${this.root}/git/commits/${ref.object.sha}`);
    const tree = await this.api.request<{ truncated?: boolean; tree: { path: string; type: string; sha: string }[] }>("GET", `${this.root}/git/trees/${commit.tree.sha}`);
    const stateBlob = tree.tree.find(entry => entry.path === "state.json" && entry.type === "blob");
    invariant(stateBlob, "State commit has no exact root state.json blob");
    // Contents API deliberately returns encoding:none for files over 1 MiB.
    // Git blobs preserve the exact observed-commit identity and support larger ledgers.
    const contents = await this.api.request<{ content: string; encoding: string }>("GET", `${this.root}/git/blobs/${stateBlob.sha}`);
    invariant(contents.encoding === "base64", "Unsupported state content encoding");
    const state = parseState(JSON.parse(Buffer.from(contents.content, "base64").toString("utf8")));
    invariant(state.repository === this.config.repository, "State belongs to another repository");
    return { head: ref.object.sha, tree: commit.tree.sha, state };
  }
  private async blob(value: unknown): Promise<string> {
    return (await this.api.request<{ sha: string }>("POST", `${this.root}/git/blobs`, { content: JSON.stringify(value, null, 2) + "\n", encoding: "utf-8" })).sha;
  }
  private async write(snapshot: Snapshot | undefined, state: CdState, event: CdEvent): Promise<string> {
    const stateBlob = await this.blob(state), eventBlob = await this.blob(event);
    const tree = await this.api.request<{ sha: string }>("POST", `${this.root}/git/trees`, { ...(snapshot ? { base_tree: snapshot.tree } : {}), tree: [{ path: "state.json", mode: "100644", type: "blob", sha: stateBlob }, { path: `events/${event.id}.json`, mode: "100644", type: "blob", sha: eventBlob }] });
    const parents = snapshot ? [snapshot.head] : [];
    const commit = await this.api.request<{ sha: string; parents: { sha: string }[] }>("POST", `${this.root}/git/commits`, { message: `CD ${event.kind} ${event.id}`, tree: tree.sha, parents });
    invariant(commit.parents.length === parents.length && commit.parents.every((parent, index) => parent.sha === parents[index]), "Ledger commit must have exactly the observed head as sole parent");
    if (snapshot) await this.api.request("PATCH", `${this.root}/git/refs/heads/${this.config.stateBranch}`, { sha: commit.sha, force: false });
    else await this.api.request("POST", `${this.root}/git/refs`, { ref: `refs/heads/${this.config.stateBranch}`, sha: commit.sha });
    return commit.sha;
  }
  async initialize(now: string, epoch: string = randomUUID()): Promise<Transaction<{ epoch: string }>> {
    for (const ref of [`heads/${this.config.stateBranch}`, `heads/${this.config.stateBranch}-backup`, `tags/${this.config.stateBranch}-initialized`]) {
      try { await this.api.request("GET", `${this.root}/git/ref/${ref}`); throw new Error(`CD ledger initialization refused: ${ref} already exists`); }
      catch (error) { if (!isMissing(error)) throw error; }
    }
    const state = newState(this.config, epoch, now), id = `initialize-${epoch}`;
    state.transitions[id] = { at: now, result: { epoch } };
    const head = await this.write(undefined, state, { id, at: now, kind: "initialize", data: { epoch } });
    await this.api.request("POST", `${this.root}/git/refs`, { ref: `refs/tags/${this.config.stateBranch}-initialized`, sha: head });
    await this.api.request("POST", `${this.root}/git/refs`, { ref: `refs/heads/${this.config.stateBranch}-backup`, sha: head });
    // No PR/check requirement: ledger writers need direct nonforce updates. Deletion and
    // rewriting are prohibited for administrators too; failure remains a visible init error.
    for (const branch of [this.config.stateBranch, `${this.config.stateBranch}-backup`]) await this.api.request("PUT", `${this.root}/branches/${branch}/protection`, { required_status_checks: null, enforce_admins: true, required_pull_request_reviews: null, restrictions: null, allow_force_pushes: false, allow_deletions: false });
    return { state, head, result: { epoch }, replayed: false };
  }
  async transact<T>(id: string, kind: string, now: string, transition: (state: CdState) => T): Promise<Transaction<T>> {
    invariant(/^[A-Za-z0-9_.:-]+$/.test(id), "Transition id cannot contain path separators");
    // An effect ID is shared by retries; ownership belongs to this invocation alone.
    // Without this nonce identical sibling commits can share a SHA, and observing
    // someone else's same-ID transition after rejection can authorize both callers.
    const owner = randomUUID();
    for (let conflict = 0; conflict < 8; conflict++) {
      const snapshot = await this.read(), previous = snapshot.state.transitions[id];
      if (previous) return { state: snapshot.state, head: snapshot.head, result: previous.result as T, replayed: true };
      const state = structuredClone(snapshot.state), result = transition(state);
      assertTransition(snapshot.state, state);
      state.transitions[id] = { at: now, result: result ?? null, owner };
      try {
        const head = await this.write(snapshot, state, { id, at: now, kind, data: result ?? null, owner });
        // Backup is a secondary recoverable pointer, never read for admission. A concurrent
        // newer backup can reject this nonforce update without losing authoritative work.
        try { await this.api.request("PATCH", `${this.root}/git/refs/heads/${this.config.stateBranch}-backup`, { sha: head, force: false }); } catch { /* next tick retries backup explicitly */ }
        return { state, head, result, replayed: false };
      } catch (error) {
        // A lost write response is not proof of rejection. Later writers preserve every
        // transition identity, so head equality is neither required nor sufficient here.
        const observed = await this.read();
        if (observed.state.transitions[id]) return { state: observed.state, head: observed.head, result: observed.state.transitions[id]!.result as T, replayed: observed.state.transitions[id]!.owner !== owner };
        if (observed.head === snapshot.head) throw error;
      }
    }
    throw new Error("CD ledger contention exceeded eight reload/recompute attempts; reconcile again");
  }
  async repairBackup(): Promise<void> {
    const snapshot = await this.read();
    await this.api.request("PATCH", `${this.root}/git/refs/heads/${this.config.stateBranch}-backup`, { sha: snapshot.head, force: false });
  }
}
