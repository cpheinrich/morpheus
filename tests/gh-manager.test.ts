import { describe, expect, it } from "vitest";
import { Decision, type LiveState, planDecision, planNoDecision, planRoute } from "../src/gh-manager/decision.js";
import { renderDigest } from "../src/gh-manager/digest.js";
import { GhManagerPolicy, humanGatedPaths, parsePolicy } from "../src/gh-manager/policy.js";
import { sessionPrompt } from "../src/gh-manager/prompt.js";
import { parseMarker, renderMarker, routePullRequest, sweep, type PullRequestFacts } from "../src/gh-manager/sweep.js";

const NOW = new Date("2026-10-01T12:00:00Z");
const HEAD = "a".repeat(40);
const OTHER = "b".repeat(40);
const policy = (over: Record<string, unknown> = {}) => GhManagerPolicy.parse({ version: 1, ...over });
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function pr(over: Partial<PullRequestFacts> = {}): PullRequestFacts {
  return {
    number: 7, title: "Add a thing", author: "cpheinrich", authorAssociation: "OWNER", isDraft: false, isCrossRepository: false,
    headRefName: "ev-1-thing", headSha: HEAD, headCommittedAt: hoursAgo(24), labels: [], autoMerge: false, mergeable: "MERGEABLE",
    checks: [{ name: "test", state: "success" }], ...over,
  };
}
const route = (over: Partial<PullRequestFacts> = {}, p = policy()) => routePullRequest(pr(over), p, NOW);

describe("policy", () => {
  it("defaults to an 8 hour cooldown, 48 for drafts, and every action on", () => {
    expect(parsePolicy('{"version":1}')).toEqual({
      version: 1, enabled: true, quietHours: 8, draftQuietHours: 48, maxSessionsPerRun: 4, maxAttemptsPerPullRequest: 2,
      closeGraceDays: 7, protectedPaths: [], model: "claude-opus-5-5",
      actions: { merge: true, repair: true, review: true, undraft: true, close: true },
    });
  });
  it("refuses an unknown key, so a typo cannot silently mean the default", () => {
    expect(() => parsePolicy('{"version":1,"quietHour":2}')).toThrow();
    expect(() => parsePolicy('{"version":2}')).toThrow();
    expect(() => parsePolicy('{"version":1,"actions":{"merg":false}}')).toThrow();
  });
  it("always gates normative policy, and adds the project's protected prefixes", () => {
    const paths = ["src/a.ts", "AGENTS.md", "apps/web/.github/workflows/ci.yml", "morpheus.json", "infra/billing/plan.ts", "infra/billing-notes.md", "infra/billingx/y.ts"];
    expect(humanGatedPaths(paths, { protectedPaths: [] })).toEqual(["AGENTS.md", "apps/web/.github/workflows/ci.yml", "morpheus.json"]);
    // A prefix matches the directory, not every path that happens to start with the same letters.
    expect(humanGatedPaths(paths, { protectedPaths: ["infra/billing"] })).toEqual(["AGENTS.md", "apps/web/.github/workflows/ci.yml", "morpheus.json", "infra/billing/plan.ts"]);
  });
});

describe("marker", () => {
  it("round-trips through a comment body", () => {
    const marker = { head: HEAD, verdict: "escalate" as const, attempts: 2, at: "2026-10-01T00:00:00.000Z" };
    expect(parseMarker(`### GitHub Manager\n\ntext\n\n${renderMarker(marker)}`)).toEqual(marker);
  });
  it("reads a malformed or foreign marker as absent", () => {
    expect(parseMarker("no marker here")).toBeUndefined();
    expect(parseMarker('<!-- morpheus-gh-manager {"head":"x","verdict":"approve","attempts":0,"at":"t"} -->')).toBeUndefined();
    expect(parseMarker("<!-- morpheus-gh-manager {not json} -->")).toBeUndefined();
    expect(parseMarker('<!-- morpheus-gh-manager {"head":"x","verdict":"merge","attempts":"2","at":"t"} -->')).toBeUndefined();
  });
});

describe("routing one pull request", () => {
  it("leaves bot lanes and untrusted authors alone", () => {
    expect(route({ author: "morpheus-security[bot]" })).toMatchObject({ route: "skip", reason: "bot-lane" });
    expect(route({ author: "dependabot[bot]" })).toMatchObject({ route: "skip", reason: "bot-lane" });
    expect(route({ authorAssociation: "CONTRIBUTOR" })).toMatchObject({ route: "skip", reason: "untrusted-author" });
    expect(route({ authorAssociation: "NONE" })).toMatchObject({ route: "skip", reason: "untrusted-author" });
    // A collaborator's pull request from a fork is still someone else's branch.
    expect(route({ isCrossRepository: true })).toMatchObject({ route: "skip", reason: "untrusted-author" });
  });

  it("applies the cooldown at its boundary: under 8h is active, exactly 8h is not", () => {
    expect(route({ headCommittedAt: hoursAgo(7.99) })).toMatchObject({ route: "skip", reason: "active" });
    expect(route({ headCommittedAt: hoursAgo(8) }).reason).not.toBe("active");
  });
  it("gives a draft 48 hours before presuming it abandoned", () => {
    expect(route({ isDraft: true, headCommittedAt: hoursAgo(47.9) })).toMatchObject({ route: "skip", reason: "active" });
    expect(route({ isDraft: true, headCommittedAt: hoursAgo(48) })).toMatchObject({ route: "session", reason: "needs-judgment" });
    // The same age on a ready pull request is long past its own cooldown.
    expect(route({ headCommittedAt: hoursAgo(47.9) })).toMatchObject({ route: "session" });
  });
  it("treats an unreadable commit date as active rather than old", () => {
    expect(route({ headCommittedAt: "not a date" })).toMatchObject({ route: "skip", reason: "active" });
  });

  it("enables auto-merge on a reviewed, green pull request without a session", () => {
    expect(route({ labels: ["agent-reviewed"] })).toMatchObject({ route: "merge", reason: "reviewed-and-green" });
    expect(route({ labels: ["manager-reviewed"] })).toMatchObject({ route: "merge", reason: "reviewed-and-green" });
    expect(route({ labels: ["agent-reviewed"], mergeable: "UNKNOWN" })).toMatchObject({ route: "merge" });
    expect(route({ labels: ["agent-reviewed"] }, policy({ actions: { merge: false } }))).toMatchObject({ route: "skip", reason: "merge-disabled" });
  });
  it("does not merge while a check is still running, and reruns a cancelled one", () => {
    expect(route({ labels: ["agent-reviewed"], checks: [{ name: "test", state: "pending" }] })).toMatchObject({ route: "skip", reason: "checks-running" });
    expect(route({ labels: ["agent-reviewed"], checks: [{ name: "test", state: "cancelled", runId: 5 }] })).toMatchObject({ route: "merge", reason: "reviewed-and-green" });
    expect(route({ labels: ["agent-reviewed"], autoMerge: true, checks: [{ name: "test", state: "cancelled", runId: 5 }] })).toMatchObject({ route: "merge", reason: "rerun-cancelled" });
  });
  it("waits on a pull request that already has auto-merge on", () => {
    expect(route({ autoMerge: true })).toMatchObject({ route: "skip", reason: "waiting" });
    expect(route({ autoMerge: true, checks: [{ name: "test", state: "failure" }] })).toMatchObject({ route: "session" });
    expect(route({ autoMerge: true, mergeable: "CONFLICTING" })).toMatchObject({ route: "session" });
  });

  it("sends everything else to a session, and says why", () => {
    expect(route()).toMatchObject({ route: "session", detail: "no completed review" });
    expect(route({ labels: ["agent-reviewed"], mergeable: "CONFLICTING" })).toMatchObject({ route: "session", detail: "conflicts with the base" });
    expect(route({ labels: ["agent-reviewed"], checks: [{ name: "pr / conventions", state: "failure" }] })).toMatchObject({ route: "session", detail: "failing: pr / conventions" });
    expect(route({ labels: ["agent-reviewed"], isDraft: true, headCommittedAt: hoursAgo(72) })).toMatchObject({ route: "session", detail: "draft" });
    expect(route({}, policy({ actions: { review: false, repair: false } }))).toMatchObject({ route: "skip", reason: "sessions-disabled" });
  });

  it("stops at the attempt budget and resets it when a human answers", () => {
    const spent = { head: HEAD, verdict: "wait" as const, attempts: 2, at: hoursAgo(12) };
    expect(route({ marker: { ...spent, attempts: 1 } })).toMatchObject({ route: "session", attempts: 1 });
    expect(route({ marker: spent })).toMatchObject({ route: "escalate", reason: "attempts-spent", attempts: 2 });
    const escalated = { ...spent, verdict: "escalate" as const };
    expect(route({ marker: escalated, labels: ["manager:needs-human"] })).toMatchObject({ route: "skip", reason: "escalated" });
    // A push after the escalation, or a human removing the label, starts the budget again.
    expect(route({ marker: { ...escalated, head: OTHER }, labels: ["manager:needs-human"] })).toMatchObject({ route: "session", attempts: 0 });
    expect(route({ marker: escalated, labels: [] })).toMatchObject({ route: "session", attempts: 0 });
  });

  it("leaves an incomplete draft alone until it gets a push", () => {
    const marker = { head: HEAD, verdict: "incomplete" as const, attempts: 1, at: hoursAgo(72) };
    expect(route({ isDraft: true, headCommittedAt: hoursAgo(100), labels: ["manager:incomplete"], marker })).toMatchObject({ route: "skip", reason: "incomplete" });
    expect(route({ isDraft: true, headCommittedAt: hoursAgo(100), labels: ["manager:incomplete"], marker: { ...marker, head: OTHER } })).toMatchObject({ route: "session" });
  });

  it("closes a stale pull request only once the grace period has fully elapsed", () => {
    const warned = (days: number) => ({ head: HEAD, verdict: "warn-stale" as const, attempts: 1, at: hoursAgo(days * 24) });
    const stale = { labels: ["manager:stale"], headCommittedAt: hoursAgo(24 * 40) };
    expect(route({ ...stale, marker: warned(6.99) })).toMatchObject({ route: "skip", reason: "stale-grace" });
    expect(route({ ...stale, marker: warned(7) })).toMatchObject({ route: "close", reason: "stale-grace-expired" });
    expect(route({ ...stale, marker: warned(7) }, policy({ actions: { close: false } }))).toMatchObject({ route: "skip", reason: "close-disabled" });
    // A push after the warning is an answer: the warning no longer describes this head.
    expect(route({ ...stale, marker: { ...warned(30), head: OTHER } })).toMatchObject({ route: "session" });
  });
});

describe("sweep", () => {
  it("holds sessions to the budget, closest-to-merging first", () => {
    const prs = [
      pr({ number: 1, isDraft: true, headCommittedAt: hoursAgo(500) }),
      pr({ number: 2, headCommittedAt: hoursAgo(20) }),
      pr({ number: 3, headCommittedAt: hoursAgo(90) }),
      pr({ number: 4, labels: ["agent-reviewed"], mergeable: "CONFLICTING", headCommittedAt: hoursAgo(10) }),
      pr({ number: 5, labels: ["agent-reviewed"] }),
    ];
    const routed = sweep(prs, policy({ maxSessionsPerRun: 2 }), NOW);
    expect(routed.map(r => [r.number, r.route, r.reason])).toEqual([
      [1, "skip", "session-budget"],
      [2, "skip", "session-budget"],
      [3, "session", "needs-judgment"],
      [4, "session", "needs-judgment"],
      [5, "merge", "reviewed-and-green"],
    ]);
  });
  it("spends no session when the budget is zero", () => {
    expect(sweep([pr()], policy({ maxSessionsPerRun: 0 }), NOW)[0]).toMatchObject({ route: "skip", reason: "session-budget" });
  });
});

const live = (over: Partial<LiveState> = {}): LiveState => ({ headSha: HEAD, isDraft: false, labels: [], autoMerge: false, body: "## Test plan\nran it", changedFiles: ["src/a.ts"], cancelledRunIds: [], ...over });
const ctx = (over: Record<string, unknown> = {}) => ({ policy: policy(over), attempts: 0, now: NOW, runUrl: "https://example.test/run/1" });
const decision = (over: Record<string, unknown> = {}) => Decision.parse({ version: 1, pr: 7, head: HEAD, action: "merge", summary: "Reviewed the change and fixed one bug.", reasoning: "Checks pass and the review is complete.", ...over });
const kinds = (plan: { operations: { kind: string }[] }) => plan.operations.map(op => op.kind === "add-label" || op.kind === "remove-label" ? `${op.kind}:${(op as unknown as { label: string }).label}` : op.kind);
const RECORD_BODY = "## Test plan\nran it\n\nmanager-review-record: .agent/worklog/2026-10-01-x.md";

describe("applying a session's decision", () => {
  it("merges on the manager's own review: body, label, auto-merge, audit comment", () => {
    const plan = planDecision(decision({ usedManagerReview: true, body: RECORD_BODY }), live({ labels: ["manager:needs-human"] }), ctx());
    expect(plan.verdict).toBe("merge");
    expect(kinds(plan)).toEqual(["set-body", "remove-label:manager:needs-human", "add-label:manager-reviewed", "auto-merge", "comment"]);
    const comment = plan.operations.at(-1) as { body: string };
    expect(comment.body).toContain("### GitHub Manager — auto-merge enabled");
    expect(comment.body).toContain("Reviewed the change and fixed one bug.");
    expect(parseMarker(comment.body)).toEqual({ head: HEAD, verdict: "merge", attempts: 1, at: NOW.toISOString() });
  });
  it("merges on the author's completed review without relabelling", () => {
    const plan = planDecision(decision(), live({ labels: ["agent-reviewed"], cancelledRunIds: [9] }), ctx());
    expect(kinds(plan)).toEqual(["rerun", "auto-merge", "comment"]);
  });
  it("refuses a merge with no review behind it", () => {
    const plan = planDecision(decision(), live(), ctx());
    expect(plan.verdict).toBe("escalate");
    expect(kinds(plan)).toEqual(["add-label:manager:needs-human", "comment"]);
    expect(plan.overridden).toContain("no completed independent review");
  });
  it("refuses to clear normative policy or a protected path on its own review", () => {
    const d = decision({ usedManagerReview: true, body: RECORD_BODY });
    expect(planDecision(d, live({ changedFiles: ["src/a.ts", ".github/workflows/ci.yml"] }), ctx())).toMatchObject({ verdict: "escalate" });
    expect(planDecision(d, live({ changedFiles: ["billing/x.ts"] }), ctx({ protectedPaths: ["billing"] }))).toMatchObject({ verdict: "escalate" });
    expect(planDecision(d, live({ changedFiles: ["billing/x.ts"] }), ctx())).toMatchObject({ verdict: "merge" });
  });
  it("refuses a claimed manager review whose record line is missing or hidden", () => {
    expect(planDecision(decision({ usedManagerReview: true }), live(), ctx())).toMatchObject({ verdict: "escalate" });
    const hidden = "## Test plan\nran it\n\n<!-- manager-review-record: .agent/worklog/x.md -->";
    expect(planDecision(decision({ usedManagerReview: true, body: hidden }), live(), ctx())).toMatchObject({ verdict: "escalate" });
  });
  it("applies nothing when the branch moved during the session", () => {
    const plan = planDecision(decision({ usedManagerReview: true, body: RECORD_BODY }), live({ headSha: OTHER }), ctx());
    expect(plan.verdict).toBe("wait");
    expect(kinds(plan)).toEqual(["comment"]);
  });
  it("marks a draft ready only when the session judged it complete", () => {
    const d = { usedManagerReview: true, body: RECORD_BODY };
    expect(planDecision(decision(d), live({ isDraft: true }), ctx())).toMatchObject({ verdict: "escalate" });
    expect(kinds(planDecision(decision({ ...d, markReady: true }), live({ isDraft: true }), ctx()))).toContain("ready");
    expect(planDecision(decision({ ...d, markReady: true }), live({ isDraft: true }), ctx({ actions: { undraft: false } }))).toMatchObject({ verdict: "escalate" });
  });
  it("escalating takes back auto-merge and the manager's own label", () => {
    const plan = planDecision(decision({ action: "escalate", needsHuman: "Decide whether the price column may be hidden." }), live({ autoMerge: true, labels: ["manager-reviewed"] }), ctx());
    expect(kinds(plan)).toEqual(["disable-auto-merge", "remove-label:manager-reviewed", "add-label:manager:needs-human", "comment"]);
    expect((plan.operations.at(-1) as { body: string }).body).toContain("**Needs you:** Decide whether the price column may be hidden.");
  });
  it("marks an unfinished draft incomplete, naming what is missing", () => {
    const plan = planDecision(decision({ action: "incomplete", missing: "The reorder gesture is not persisted." }), live({ isDraft: true }), ctx());
    expect(plan.verdict).toBe("incomplete");
    expect(kinds(plan)).toEqual(["add-label:manager:incomplete", "comment"]);
    expect((plan.operations.at(-1) as { body: string }).body).toContain("**Still missing:** The reorder gesture is not persisted.");
  });
  it("closes at once only when the superseding pull request really merged", () => {
    const d = decision({ action: "close", supersededBy: 12 });
    expect(kinds(planDecision(d, live({ supersededMerged: true }), ctx()))).toEqual(["comment", "close"]);
    for (const supersededMerged of [false, undefined]) {
      const plan = planDecision(d, live({ supersededMerged }), ctx());
      expect(plan.verdict).toBe("warn-stale");
      expect(kinds(plan)).toEqual(["add-label:manager:stale", "comment"]);
    }
    expect(planDecision(decision({ action: "close" }), live({ supersededMerged: true }), ctx())).toMatchObject({ verdict: "warn-stale" });
    expect(planDecision(d, live({ supersededMerged: true }), ctx({ actions: { close: false } }))).toMatchObject({ verdict: "escalate" });
  });
  it("counts a session that reported nothing as an attempt, and says so", () => {
    const plan = planNoDecision("no decision file was written", live(), { ...ctx(), attempts: 1 });
    expect(plan.verdict).toBe("wait");
    const body = (plan.operations[0] as { body: string }).body;
    expect(body).toContain("no decision file was written");
    expect(parseMarker(body)?.attempts).toBe(2);
  });
  it("rejects a decision that is not the shape asked for", () => {
    expect(() => Decision.parse({ version: 1, pr: 7, head: "abc", action: "merge", summary: "long enough", reasoning: "long enough" })).toThrow();
    expect(() => Decision.parse({ version: 1, pr: 7, head: HEAD, action: "approve", summary: "long enough", reasoning: "long enough" })).toThrow();
    expect(() => Decision.parse({ version: 1, pr: 7, head: HEAD, action: "merge", summary: "long enough", reasoning: "long enough", admin: true })).toThrow();
  });
});

describe("applying a route that needed no session", () => {
  const routed = (over: Record<string, unknown>) => ({ number: 7, title: "t", headSha: HEAD, route: "merge" as const, reason: "reviewed-and-green", detail: "reviewed, checks green", attempts: 1, ...over });
  it("enables auto-merge once, and does not comment again when it is already on", () => {
    const first = planRoute(routed({}), live(), ctx());
    expect(kinds(first)).toEqual(["auto-merge", "comment"]);
    // No session ran, so the attempt count is carried, not incremented.
    expect(parseMarker((first.operations.at(-1) as { body: string }).body)?.attempts).toBe(1);
    expect(kinds(planRoute(routed({}), live({ autoMerge: true, cancelledRunIds: [4] }), ctx()))).toEqual(["rerun"]);
  });
  it("does nothing when the branch moved after the sweep", () => {
    expect(planRoute(routed({}), live({ headSha: OTHER }), ctx()).operations).toEqual([]);
  });
  it("closes and escalates", () => {
    expect(kinds(planRoute(routed({ route: "close" }), live({ labels: ["manager:stale"] }), ctx()))).toEqual(["remove-label:manager:stale", "comment", "close"]);
    expect(kinds(planRoute(routed({ route: "escalate" }), live(), ctx()))).toEqual(["add-label:manager:needs-human", "comment"]);
  });
});

describe("digest", () => {
  it("lists every pull request, and flags a session that reported nothing", () => {
    const routed = [
      { number: 1, title: "One | pipe", headSha: HEAD, route: "session" as const, reason: "needs-judgment", detail: "no completed review", attempts: 0 },
      { number: 2, title: "Two", headSha: HEAD, route: "skip" as const, reason: "active", detail: "under 8h", attempts: 0 },
      { number: 3, title: "Three", headSha: HEAD, route: "session" as const, reason: "needs-judgment", detail: "draft", attempts: 0 },
    ];
    const md = renderDigest({ repo: "o/r", runUrl: "https://example.test/run/1", at: NOW, routed, outcomes: [{ number: 1, verdict: "merge", did: ["auto-merge", "comment"] }] });
    expect(md).toContain("### Run 2026-10-01 12:00 UTC");
    expect(md).toContain("3 open pull request(s); acted on 1.");
    expect(md).toContain("| #1 | One \\| pipe | session: needs-judgment | no completed review | merge |");
    expect(md).toContain("| #2 | Two | skip: active | under 8h | — |");
    expect(md).toContain("| #3 | Three | session: needs-judgment | draft | **no result reported** |");
  });
});

describe("session prompt", () => {
  const brief = { repo: "o/r", number: 7, branch: "ev-1-thing", base: "main", sweepDetail: "no completed review", attempts: 1, runRef: "run 9", decisionPath: "/tmp/d.json", cli: "node cli.js", policy: policy({ protectedPaths: ["billing"] }) };
  it("carries the facts and the rules, and no pull request text", () => {
    const text = sessionPrompt(brief);
    expect(text).toContain("pull request #7 (branch `ev-1-thing`, base `main`)");
    expect(text).toContain("Sessions already spent on it: 1 of 2.");
    expect(text).toContain("`billing`");
    expect(text).toContain('"managerSession": "run 9"');
    expect(text).toContain("/tmp/d.json");
    expect(text).not.toContain("This repository's additions");
  });
  it("appends the project's overlay under a heading that says it cannot relax the rules", () => {
    const text = sessionPrompt({ ...brief, overlay: "Lead on dose arithmetic." });
    expect(text).toContain("## This repository's additions");
    expect(text).toContain("cannot relax its ground rules");
    expect(text.trimEnd().endsWith("Lead on dose arithmetic.")).toBe(true);
  });
});
