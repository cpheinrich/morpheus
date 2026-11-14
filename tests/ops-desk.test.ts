import { describe, expect, it } from "vitest";

import {
  buildFragment,
  displayedState,
  exactJobUrl,
  formatStamp,
  fragmentSlug,
  githubCommitUrl,
  githubJobUrl,
  githubPullLinks,
  githubRunUrl,
  isTerminalState,
  newestAttemptFirst,
  parseFragment,
} from "../src/ops-desk/index.js";

describe("formatStamp", () => {
  it("reads as a compact local time with the DST-aware zone name", () => {
    expect(formatStamp("2026-11-13T05:19:00Z", "America/Los_Angeles")).toBe("Nov 12, 9:19pm PST");
    expect(formatStamp("2026-07-09T18:07:00Z", "America/Los_Angeles")).toBe("Jul 9, 11:07am PDT");
    expect(formatStamp("2026-11-09T18:17:00Z", "America/New_York")).toBe("Nov 9, 1:17pm EST");
    expect(formatStamp("2026-11-09T12:00:00Z", "UTC")).toBe("Nov 9, 12:00pm UTC");
  });

  it("writes midnight as 12, not 0", () => {
    expect(formatStamp("2026-11-09T08:05:00Z", "America/Los_Angeles")).toBe("Nov 9, 12:05am PST");
  });

  it("is Unknown for anything that is not a parseable time string", () => {
    for (const value of [undefined, null, "", "yesterday", 1_731_000_000_000, {}]) {
      expect(formatStamp(value, "UTC")).toBe("Unknown");
    }
  });
});

describe("attempt states", () => {
  it("keeps a terminal outcome when the source is stale and hides a stale live state", () => {
    for (const state of ["succeeded", "failed", "cancelled", "skipped"]) {
      expect(isTerminalState(state)).toBe(true);
      expect(displayedState(state, false)).toBe(state);
    }
    for (const state of ["running", "queued", "in_progress", "unknown"]) {
      expect(isTerminalState(state)).toBe(false);
      expect(displayedState(state, false)).toBe("unknown");
      expect(displayedState(state, true)).toBe(state);
    }
  });

  it("orders attempts by start time, then run id, ignoring list order", () => {
    const rows = [
      { startedAt: "2026-11-10T12:00:00Z", runId: 5 },
      { startedAt: "2026-11-12T12:00:00Z", runId: 3 },
      { startedAt: "2026-11-12T12:00:00Z", runId: 4 },
      { startedAt: "not a time", runId: 9 },
    ];
    expect([...rows].sort(newestAttemptFirst).map(row => row.runId)).toEqual([4, 3, 5, 9]);
  });
});

describe("GitHub links", () => {
  const repo = "owner/repo-name.x";

  it("builds run, attempt and job links only from valid identifiers", () => {
    expect(githubRunUrl(repo, 12)).toBe("https://github.com/owner/repo-name.x/actions/runs/12");
    expect(githubRunUrl(repo, 12, 2)).toBe("https://github.com/owner/repo-name.x/actions/runs/12/attempts/2");
    expect(githubJobUrl(repo, 12, 34)).toBe("https://github.com/owner/repo-name.x/actions/runs/12/job/34");
    for (const bad of [0, -1, 1.5, "12", null, Number.MAX_SAFE_INTEGER + 1]) {
      expect(githubRunUrl(repo, bad)).toBeNull();
      expect(githubJobUrl(repo, 12, bad)).toBeNull();
      expect(githubRunUrl(repo, 12, bad)).toBeNull();
    }
    for (const badRepo of ["owner", "owner/repo/extra", "../x/y", "owner/re po", "owner/..", "../x", "./x", "owner/.", 7]) {
      expect(githubRunUrl(badRepo, 12)).toBeNull();
      expect(githubCommitUrl(badRepo, "a".repeat(40))).toBeNull();
    }
    expect(githubRunUrl("owner/.github", 12)).toBe("https://github.com/owner/.github/actions/runs/12");
  });

  it("accepts a reported job URL only when it equals the URL its identifiers produce", () => {
    const job = { repository: repo, runId: 12, jobId: 34, url: "https://github.com/owner/repo-name.x/actions/runs/12/job/34" };
    expect(exactJobUrl(job)).toBe(job.url);
    expect(exactJobUrl({ ...job, url: "https://github.com/owner/repo-name.x/actions/runs/12/job/35" })).toBeNull();
    expect(exactJobUrl({ ...job, url: "https://evil.example/actions/runs/12/job/34" })).toBeNull();
    expect(exactJobUrl({ ...job, url: undefined })).toBeNull();
  });

  it("links only a full lowercase commit SHA", () => {
    const sha = "a".repeat(40);
    expect(githubCommitUrl(repo, sha)).toBe(`https://github.com/owner/repo-name.x/commit/${sha}`);
    expect(githubCommitUrl(repo, "a".repeat(39))).toBeNull();
    expect(githubCommitUrl(repo, "A".repeat(40))).toBeNull();
    expect(githubCommitUrl(repo, null)).toBeNull();
  });

  it("returns every pull link or none", () => {
    expect(githubPullLinks(repo, [7, 9])).toEqual([
      { number: 7, url: "https://github.com/owner/repo-name.x/pull/7" },
      { number: 9, url: "https://github.com/owner/repo-name.x/pull/9" },
    ]);
    expect(githubPullLinks(repo, [1, 2, 3])).toHaveLength(3);
    expect(githubPullLinks(repo, [1, 2, 3, 4])).toEqual([]);
    expect(githubPullLinks(repo, [7, 7])).toEqual([]);
    expect(githubPullLinks(repo, [7, 0])).toEqual([]);
    expect(githubPullLinks(repo, "7")).toEqual([]);
  });
});

describe("fragments", () => {
  it("slugs labels the way views are addressed", () => {
    expect(fragmentSlug("Scheduled Tasks")).toBe("scheduled-tasks");
  });

  it("round-trips a section with its parameters in insertion order", () => {
    const hash = buildFragment("work", { view: "recent", detail: "job:o/r:1:1:2", empty: "", none: null });
    expect(hash).toBe("#work?view=recent&detail=job%3Ao%2Fr%3A1%3A1%3A2");
    const { section, params } = parseFragment(hash);
    expect(section).toBe("work");
    expect(params.get("view")).toBe("recent");
    expect(params.get("detail")).toBe("job:o/r:1:1:2");
  });

  it("keeps a hand-typed `?` inside the query", () => {
    expect(parseFragment("#work?detail=a?b").params.get("detail")).toBe("a?b");
    expect(parseFragment("#work").section).toBe("work");
  });

  it("treats the default view as no fragment", () => {
    expect(buildFragment("", { view: "x" })).toBe("");
    expect(buildFragment("devices")).toBe("#devices");
    expect(parseFragment("")).toEqual({ section: "", params: new URLSearchParams() });
  });
});
