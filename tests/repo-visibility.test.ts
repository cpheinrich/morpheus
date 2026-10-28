import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VISIBILITY_CACHE_MS,
  parseGhVisibility,
  publishVerdict,
  rescueRepositories,
  type CommandRunner,
  type VisibilityCache,
} from "../src/session/repo-visibility.js";

const exec = promisify(execFile);
const NOW = new Date("2026-10-28T18:00:00Z");

function memoryCache(initial: string | null = null): VisibilityCache & { data: string | null } {
  const cache = {
    data: initial,
    read: async () => cache.data,
    write: async (data: string) => { cache.data = data; },
  };
  return cache;
}
const cacheOf = (repos: Record<string, { visibility: string; checkedAt: string }>) => JSON.stringify({ version: 1, repos });
const runnerAnswering = (answers: Record<string, string>) =>
  vi.fn<CommandRunner>(async (_command, args) => answers[args[2]!] === undefined
    ? { code: 1, stdout: "", stderr: `HTTP 404: Not Found (${args[2]})` }
    : { code: 0, stdout: JSON.stringify({ visibility: answers[args[2]!] }), stderr: "" });

describe("parseGhVisibility", () => {
  it("accepts gh's three values and nothing else", () => {
    expect(parseGhVisibility('{"visibility":"PUBLIC"}')).toBe("PUBLIC");
    expect(parseGhVisibility('{"visibility":"PRIVATE"}')).toBe("PRIVATE");
    expect(parseGhVisibility('{"visibility":"INTERNAL"}')).toBe("INTERNAL");
    expect(parseGhVisibility('{"visibility":"private"}')).toBeNull();
    expect(parseGhVisibility("{}")).toBeNull();
    expect(parseGhVisibility("not json")).toBeNull();
  });
});

describe("publishVerdict", () => {
  const targets = (...repos: string[]) => ({ repos, unidentified: [] });

  it("publishes only when every repository is private", async () => {
    expect(await publishVerdict("/r", targets("o/a", "o/b"), runnerAnswering({ "o/a": "PRIVATE", "o/b": "PRIVATE" }), NOW, null))
      .toEqual({ publish: true, repos: ["o/a", "o/b"] });
    expect(await publishVerdict("/r", targets("o/a", "o/b"), runnerAnswering({ "o/a": "PRIVATE", "o/b": "PUBLIC" }), NOW, null))
      .toEqual({ publish: false, repos: ["o/a", "o/b"], reason: "o/b is public" });
    // Public wins over an unreadable sibling: it is the more specific reason.
    expect(await publishVerdict("/r", targets("o/a", "o/b"), runnerAnswering({ "o/b": "PUBLIC" }), NOW, null))
      .toEqual({ publish: false, repos: ["o/a", "o/b"], reason: "o/b is public" });
    expect(await publishVerdict("/r", targets("o/a"), runnerAnswering({}), NOW, null))
      .toEqual({ publish: false, repos: ["o/a"], reason: "the visibility of o/a could not be read (HTTP 404: Not Found (o/a))" });
  });

  it("refuses with no repositories or an unidentified remote, without calling gh", async () => {
    const runner = runnerAnswering({ "o/a": "PRIVATE" });
    expect(await publishVerdict("/r", { repos: [], unidentified: [] }, runner, NOW, null))
      .toEqual({ publish: false, repos: [], reason: "no GitHub repository was found to check its visibility" });
    expect(await publishVerdict("/r", { repos: ["o/a"], unidentified: ["remote origin has no URL"] }, runner, NOW, null))
      .toEqual({ publish: false, repos: ["o/a"], reason: "the repository's visibility cannot be read: remote origin has no URL" });
    expect(runner).not.toHaveBeenCalled();
  });

  it("reuses a cached answer until it is VISIBILITY_CACHE_MS old, then reads again", async () => {
    expect(VISIBILITY_CACHE_MS).toBe(3_600_000);
    const at = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
    // Cached PRIVATE one millisecond inside the window: trusted, gh is not asked.
    const fresh = runnerAnswering({ "o/a": "PUBLIC" });
    expect(await publishVerdict("/r", targets("o/a"), fresh, NOW, memoryCache(cacheOf({ "o/a": { visibility: "PRIVATE", checkedAt: at(VISIBILITY_CACHE_MS - 1) } }))))
      .toEqual({ publish: true, repos: ["o/a"] });
    expect(fresh).not.toHaveBeenCalled();
    // Exactly at the expiry the cached PRIVATE is stale, and the repository has since gone public.
    const stale = runnerAnswering({ "o/a": "PUBLIC" });
    const cache = memoryCache(cacheOf({ "o/a": { visibility: "PRIVATE", checkedAt: at(VISIBILITY_CACHE_MS) } }));
    expect(await publishVerdict("/r", targets("o/a"), stale, NOW, cache)).toEqual({ publish: false, repos: ["o/a"], reason: "o/a is public" });
    expect(stale).toHaveBeenCalledTimes(1);
    expect(JSON.parse(cache.data!)).toEqual({ version: 1, repos: { "o/a": { visibility: "PUBLIC", checkedAt: NOW.toISOString() } } });
  });

  it("does not trust a timestamp from the future, a corrupt cache or an unknown cached value", async () => {
    for (const data of [
      cacheOf({ "o/a": { visibility: "PRIVATE", checkedAt: new Date(NOW.getTime() + 1).toISOString() } }),
      cacheOf({ "o/a": { visibility: "PRIVATE", checkedAt: "yesterday" } }),
      cacheOf({ "o/a": { visibility: "SECRET", checkedAt: NOW.toISOString() } }),
      "{not json",
      JSON.stringify({ version: 2, repos: { "o/a": { visibility: "PRIVATE", checkedAt: NOW.toISOString() } } }),
    ]) {
      const runner = runnerAnswering({ "o/a": "PUBLIC" });
      expect((await publishVerdict("/r", targets("o/a"), runner, NOW, memoryCache(data))).publish).toBe(false);
      expect(runner).toHaveBeenCalledTimes(1);
    }
  });

  it("never caches a failed read", async () => {
    const cache = memoryCache();
    await publishVerdict("/r", targets("o/a"), runnerAnswering({}), NOW, cache);
    expect(cache.data).toBeNull();
  });
});

describe("rescueRepositories", () => {
  let dir: string;
  const git = (...args: string[]) => exec("git", args, { cwd: dir });
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "repo-visibility-"));
    await git("init", "-q");
  });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("collects the push remote's push and fetch repositories and, on a fork, the trunk remote's", async () => {
    await git("remote", "add", "origin", "git@github.com:Fork-Owner/Project.git");
    await git("remote", "set-url", "--push", "origin", "https://github.com/fork-owner/project-mirror");
    await git("remote", "add", "upstream", "https://github.com/up-owner/project.git");
    expect(await rescueRepositories(dir, "origin", "upstream")).toEqual({
      repos: ["fork-owner/project", "fork-owner/project-mirror", "up-owner/project"],
      unidentified: [],
    });
    expect(await rescueRepositories(dir, "origin", "origin")).toEqual({ repos: ["fork-owner/project", "fork-owner/project-mirror"], unidentified: [] });
  });

  it("names each URL that is not a GitHub repository, without its credentials, and a missing remote", async () => {
    await git("remote", "add", "origin", "https://github.com/o/r.git");
    await git("remote", "set-url", "--push", "origin", "https://bot:ghp_secret@gitlab.com/o/r.git");
    expect(await rescueRepositories(dir, "origin", "upstream")).toEqual({
      repos: ["o/r"],
      unidentified: ["https://gitlab.com/o/r.git is not a GitHub repository", "remote upstream has no URL"],
    });
  });

  it("reads the configured URL, not an insteadOf rewrite of it", async () => {
    await git("remote", "add", "origin", "https://github.com/o/r.git");
    await git("config", "url./srv/mirror/r.git.insteadOf", "https://github.com/o/r.git");
    expect((await exec("git", ["remote", "get-url", "origin"], { cwd: dir })).stdout.trim()).toBe("/srv/mirror/r.git");
    expect(await rescueRepositories(dir, "origin", "origin")).toEqual({ repos: ["o/r"], unidentified: [] });
  });
});
