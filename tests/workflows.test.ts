import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { ci as ciTemplate } from "../src/init/templates.js";

/**
 * The workflows are shipped to every project, so a mistake here breaks repos
 * that never changed. They are also the one part of the kit with no type
 * checker behind them.
 *
 * Every failure this guards against has already happened once: a caller passing
 * an input the reusable workflow does not declare, and a checkout too shallow
 * for the command it feeds.
 */

const DIR = join(import.meta.dirname, "../.github/workflows");

interface Workflow {
  on?: Record<string, unknown>;
  jobs?: Record<string, { uses?: string; with?: Record<string, unknown>; steps?: unknown[] }>;
}

async function read(name: string): Promise<Workflow> {
  return load(await readFile(join(DIR, name), "utf8")) as Workflow;
}

describe("every workflow", () => {
  it("parses as YAML", async () => {
    const files = (await readdir(DIR)).filter((f) => f.endsWith(".yml"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      await expect(read(f), `${f} should parse`).resolves.toBeTruthy();
    }
  });
});

describe("callers match what they call", () => {
  /**
   * A local `uses: ./…` call passing an undeclared input fails at run time with
   * a message about the *caller*, which sends you to the wrong file.
   */
  it("passes only inputs the called workflow declares", async () => {
    const files = (await readdir(DIR)).filter((f) => f.endsWith(".yml"));
    const workflows: Array<{ file: string; wf: Workflow }> = [];
    for (const file of files) workflows.push({ file, wf: await read(file) });
    workflows.push({
      file: "generated company ci.yml",
      wf: load(
        ciTemplate({ node: true, rulesPath: "infra/firebase/firestore.rules" }),
      ) as Workflow,
    });

    for (const { file, wf } of workflows) {
      for (const [name, job] of Object.entries(wf.jobs ?? {})) {
        const local =
          job.uses?.match(/^\.\/\.github\/workflows\/(.+)$/)?.[1] ??
          job.uses?.match(/^cpheinrich\/morpheus\/\.github\/workflows\/(.+)@.+$/)?.[1];
        if (!local || !job.with) continue;

        const called = (await read(local)) as {
          on?: { workflow_call?: { inputs?: Record<string, unknown> } };
        };
        const declared = Object.keys(called.on?.workflow_call?.inputs ?? {});

        for (const key of Object.keys(job.with)) {
          expect(declared, `${file}:${name} passes "${key}" to ${local}`).toContain(key);
        }
      }
    }
  });
});

describe("heartbeat.yml", () => {
  it("is reusable, so a project can call it", async () => {
    const wf = await read("heartbeat.yml");
    expect(wf.on).toHaveProperty("workflow_call");
  });

  /**
   * Live claims are read from origin with `ls-remote` and `for-each-ref`. A
   * shallow, single-branch checkout reports no claims — which the beat would
   * read as free lanes and dispatch straight through a full ceiling.
   */
  it("checks out full history, or the claim list reads as empty", async () => {
    const raw = await readFile(join(DIR, "heartbeat.yml"), "utf8");
    expect(raw).toContain("fetch-depth: 0");
  });

  it("leaves dispatch off by default", async () => {
    const wf = (await read("heartbeat.yml")) as {
      on?: { workflow_call?: { inputs?: { dispatch?: { default?: unknown } } } };
    };
    expect(wf.on?.workflow_call?.inputs?.dispatch?.default).toBe(false);
  });
});

describe("pm-check.yml", () => {
  it("offers the HQ rules check without breaking projects that have no rules", async () => {
    const wf = (await read("pm-check.yml")) as {
      on?: {
        workflow_call?: {
          inputs?: Record<string, { type?: string; default?: unknown }>;
        };
      };
      jobs?: Record<
        string,
        {
          steps?: Array<{
            name?: string;
            if?: string;
            env?: Record<string, string>;
            run?: string;
          }>;
        }
      >;
    };
    const input = wf.on?.workflow_call?.inputs?.["hq-rules-path"];
    expect(input).toEqual(expect.objectContaining({ type: "string", default: "" }));

    const step = wf.jobs?.["pm"]?.steps?.find(
      (candidate) => candidate.name === "Verify generated HQ role helpers",
    );
    expect(step?.if).toContain("inputs.hq-rules-path != ''");
    expect(step?.env?.MORPHEUS_RULES_PATH).toBe("${{ inputs.hq-rules-path }}");
    expect(step?.run).toBe(
      'node .morpheus/dist/cli/index.js hq rules --check --rules-path "$MORPHEUS_RULES_PATH"',
    );
  });
});

describe("schedule.yml", () => {
  it("runs on a cron and can be triggered by hand", async () => {
    const wf = await read("schedule.yml");
    expect(wf.on).toHaveProperty("schedule");
    expect(wf.on).toHaveProperty("workflow_dispatch");
  });

  it("calls the heartbeat", async () => {
    const wf = await read("schedule.yml");
    expect(wf.jobs?.["heartbeat"]?.uses).toContain("heartbeat.yml");
  });
});

describe("agent-review.yml", () => {
  it("is reusable and takes both credentials as optional secrets", async () => {
    const wf = (await read("agent-review.yml")) as {
      on?: { workflow_call?: { secrets?: Record<string, { required?: boolean }> } };
    };
    // Required would fail every repo that has not configured the rung.
    for (const name of ["anthropic_api_key", "claude_code_oauth_token"]) {
      const secret = wf.on?.workflow_call?.secrets?.[name];
      expect(secret, name).toBeDefined();
      expect(secret?.required, name).toBe(false);
    }
  });

  /**
   * The subscription token must win when both credentials exist, and winning
   * means the API key is *withheld*, not merely accompanied. The action
   * exports whatever it receives and Claude Code prefers an ANTHROPIC_API_KEY
   * in its environment — handed both, reviews would silently keep billing the
   * prepaid credits the token exists to stop billing, with a green check and
   * no diff to show for it. That is this repo's named failure shape: a check
   * that cannot tell the wrong success from the right one.
   */
  it("prefers the subscription token and withholds the API key beside it", async () => {
    const wf = (await read("agent-review.yml")) as {
      jobs?: Record<string, { steps?: Array<{ with?: Record<string, unknown> }> }>;
    };
    const step = wf.jobs?.["review"]?.steps?.find((s) =>
      Object.hasOwn(s.with ?? {}, "claude_code_oauth_token"),
    );
    expect(step, "no step passes claude_code_oauth_token").toBeDefined();
    expect(step?.with?.["claude_code_oauth_token"]).toBe(
      "${{ secrets.claude_code_oauth_token }}",
    );
    expect(step?.with?.["anthropic_api_key"]).toBe(
      "${{ secrets.claude_code_oauth_token == '' && secrets.anthropic_api_key || '' }}",
    );
  });

  it("counts either credential as configured", async () => {
    const raw = await readFile(join(DIR, "agent-review.yml"), "utf8");
    expect(raw).toContain(
      "HAS_KEY: ${{ secrets.anthropic_api_key != '' || secrets.claude_code_oauth_token != '' }}",
    );
  });

  /**
   * A secret a caller does not pass is silently empty in the called workflow —
   * no error, no warning. Dropping one of these lines would quietly fall back
   * to the other credential (or to unconfigured), which is exactly the silent
   * substitution the preference logic above exists to prevent.
   */
  it("both callers hand through both credentials", async () => {
    for (const file of ["ci.yml", "agent-review-request.yml"]) {
      const wf = (await read(file)) as {
        jobs?: Record<string, { uses?: string; secrets?: Record<string, string> }>;
      };
      const job = Object.values(wf.jobs ?? {}).find((j) =>
        j.uses?.includes("agent-review.yml"),
      );
      expect(job?.secrets?.["claude_code_oauth_token"], file).toBe(
        "${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}",
      );
      expect(job?.secrets?.["anthropic_api_key"], file).toBe(
        "${{ secrets.ANTHROPIC_API_KEY }}",
      );
    }
  });

  /**
   * The `secrets` context is not available in a step-level `if`. Testing
   * `secrets.*` there evaluates to false silently, so the rung would skip even
   * when configured — a verifier that never runs and never says so.
   */
  it("gates on an env var rather than the secrets context", async () => {
    const raw = await readFile(join(DIR, "agent-review.yml"), "utf8");
    expect(raw).toContain("HAS_KEY:");
    expect(raw).toMatch(/if:\s*env\.HAS_KEY/);
    expect(raw).not.toMatch(/if:.*secrets\./);
  });

  it("needs write access to comment, and no more", async () => {
    const wf = (await read("agent-review.yml")) as {
      jobs?: Record<string, { permissions?: Record<string, string> }>;
    };
    const perms = wf.jobs?.["review"]?.permissions;
    expect(perms).toEqual({ contents: "read", "pull-requests": "write" });
    expect(wf.jobs?.["delivery"]?.permissions).toEqual({
      contents: "read",
      "pull-requests": "read",
    });
  });

  it("keeps the cursor in the cost gate and gives the reviewer the full PR", async () => {
    const wf = (await read("agent-review.yml")) as {
      jobs?: Record<string, { steps?: Array<Record<string, unknown>> }>;
    };
    const steps = wf.jobs?.["review"]?.steps ?? [];
    const gate = steps.find((step) => step.name === "Is this worth a review?");
    const review = steps.find((step) => step.name === "Review");
    const cursorConsumers = steps.filter((step) =>
      JSON.stringify(step).includes("steps.since.outputs.base"),
    );

    expect(JSON.stringify(gate)).toContain("steps.since.outputs.base");
    expect(JSON.stringify(review)).not.toContain("steps.since.outputs.base");
    expect(cursorConsumers).toEqual([gate]);
  });

  it("checks delivery after the review even when the action fails", async () => {
    const wf = (await read("agent-review.yml")) as {
      jobs?: Record<
        string,
        {
          needs?: string;
          if?: string;
          outputs?: Record<string, string>;
          steps?: Array<Record<string, unknown>>;
        }
      >;
    };
    const reviewJob = wf.jobs?.["review"];
    const deliveryJob = wf.jobs?.["delivery"];
    const review = reviewJob?.steps?.find((step) => step.name === "Review");
    const delivery = deliveryJob?.steps?.find(
      (step) => step.name === "Verify the review was delivered",
    );

    expect(review?.id).toBe("review");
    expect(deliveryJob?.needs).toBe("review");
    expect(deliveryJob?.if).toContain("github.event_name == 'pull_request'");
    expect(deliveryJob?.if).toContain("always()");
    expect(deliveryJob?.if).toContain("configured != 'false'");
    expect(deliveryJob?.if).not.toContain("configured == 'true'");
    expect(deliveryJob?.if).toContain("review_requested != 'false'");
    expect(deliveryJob?.if).not.toContain("review_requested == 'true'");
    expect(reviewJob?.outputs?.comment_id_before).toContain(
      "steps.since.outputs.comment_id_before",
    );
    expect(JSON.stringify(delivery)).toContain("review delivery");
    expect(JSON.stringify(delivery)).toContain("needs.review.outputs.comment_id_before");
    expect(JSON.stringify(delivery)).toContain("needs.review.outputs.action_conclusion");
  });

  it("reads every comment page and selects this action's own tracking comment", async () => {
    const raw = await readFile(join(DIR, "agent-review.yml"), "utf8");
    expect(raw.match(/--paginate --slurp/g)).toHaveLength(2);
    expect(raw).toContain('contains("[View job")');
    expect(raw).toContain('run_marker="/actions/runs/$GITHUB_RUN_ID)"');
    expect(raw).toContain('startswith("**Claude finished @")');
    expect(raw).toContain('startswith("**Claude encountered an error")');
  });

  it("pins the action whose final comment contract the detector parses", async () => {
    const raw = await readFile(join(DIR, "agent-review.yml"), "utf8");
    expect(raw).toMatch(/anthropics\/claude-code-action@[0-9a-f]{40}/);
    expect(raw).not.toContain("anthropics/claude-code-action@v1");
    expect(raw).toContain("# v1.0.189");
  });

  it("passes the honest skip reason through to the job summary", async () => {
    const raw = await readFile(join(DIR, "agent-review.yml"), "utf8");
    expect(raw).toContain("--json");
    expect(raw).toContain("SKIP_WHY:");
    expect(raw).toContain("Rung 2 did not run: $SKIP_WHY.");
  });

  it("uses jq itself for the run cursor instead of passing jq flags to gh", async () => {
    const raw = await readFile(join(DIR, "agent-review.yml"), "utf8");
    expect(raw).not.toContain("--jq --arg");
    expect(raw).toContain('jq -r --arg sha "$HEAD_SHA"');
    expect(raw).toContain('-f branch="$HEAD_REF"');
  });

  it("takes a pull request number, for a caller with no pull request event", async () => {
    const wf = (await read("agent-review.yml")) as {
      on?: { workflow_call?: { inputs?: Record<string, { type?: string; default?: unknown }> } };
      jobs?: Record<string, { if?: string }>;
    };
    expect(wf.on?.workflow_call?.inputs?.["pr-number"]).toEqual(
      expect.objectContaining({ type: "number", default: 0 }),
    );
    // Both jobs still refuse to run when neither source names a pull request.
    expect(wf.jobs?.["review"]?.if).toContain("inputs.pr-number > 0");
    expect(wf.jobs?.["delivery"]?.if).toContain("inputs.pr-number > 0");
  });

  /**
   * The regression this exists for is silent and expensive: an `issue_comment`
   * run has no `github.event.pull_request`, so any *other* step reading it gets
   * an empty string. A checkout with an empty `ref` lands on trunk, the diff
   * comes out clean, and the rung reports a confident review of code the pull
   * request does not contain.
   *
   * So the payload is read in exactly one place, and everything downstream
   * takes the resolved outputs. Adding a step that reaches for the payload
   * again fails here rather than in production.
   */
  it("reads the pull request payload in one step and nowhere else", async () => {
    const wf = (await read("agent-review.yml")) as {
      jobs?: Record<string, { steps?: Array<Record<string, unknown>> }>;
    };
    const steps = Object.values(wf.jobs ?? {}).flatMap((job) => job.steps ?? []);
    const payloadReaders = steps.filter((step) =>
      /github\.event\.pull_request|github\.head_ref|github\.base_ref/.test(JSON.stringify(step)),
    );

    expect(payloadReaders.map((step) => step.name)).toEqual(["Resolve the pull request"]);
  });

  it("checks out the pull request's head, not whatever branch the event points at", async () => {
    const wf = (await read("agent-review.yml")) as {
      jobs?: Record<
        string,
        { steps?: Array<{ uses?: string; with?: Record<string, unknown> }> }
      >;
    };
    const checkout = wf.jobs?.["review"]?.steps?.find(
      (step) => step.uses?.startsWith("actions/checkout") && step.with?.["fetch-depth"] === 0,
    );

    expect(checkout?.with?.ref).toBe("${{ steps.pr.outputs.checkout_ref }}");
  });

  /**
   * A resolve that half-fails is worse than one that fails: an empty head ref
   * reviews the wrong thing and says nothing about it.
   */
  it("fails the run rather than resolving a pull request partially", async () => {
    const wf = (await read("agent-review.yml")) as {
      jobs?: Record<string, { steps?: Array<{ name?: string; run?: string }> }>;
    };
    const resolve = wf.jobs?.["review"]?.steps?.find(
      (step) => step.name === "Resolve the pull request",
    );

    expect(resolve?.run).toContain("set -euo pipefail");
    expect(resolve?.run).toContain('gh api "repos/$REPO/pulls/$INPUT_NUMBER"');
    // A fork's head commit is on no branch of this repository.
    expect(resolve?.run).toContain('checkout_ref=refs/pull/$INPUT_NUMBER/head');
  });

  /**
   * The cursor reads the caller's successful runs as a stand-in for "someone
   * reviewed this commit". Once the caller stops reviewing every push that
   * proxy is false in the unsafe direction — a green run that reviewed nothing
   * becomes the base, the diff is empty, and the rung declines in silence.
   */
  it("consults the run cursor only on a push to an already-reviewed branch", async () => {
    const wf = (await read("agent-review.yml")) as {
      jobs?: Record<
        string,
        { steps?: Array<{ name?: string; run?: string; env?: Record<string, string> }> }
      >;
    };
    const since = wf.jobs?.["review"]?.steps?.find(
      (step) => step.name === "What has changed since the last review?",
    );

    expect(since?.env?.EVENT_ACTION).toBe("${{ github.event.action }}");
    expect(since?.run).toContain('if [ "$EVENT_ACTION" = "synchronize" ]; then');
    // The lookup itself must sit inside that branch, not beside it.
    const guarded = since?.run?.slice(since.run.indexOf('"$EVENT_ACTION" = "synchronize"'));
    expect(guarded).toContain("actions/workflows/$caller/runs");
    // `refs/pull/<n>/head` is the only ref a comment-triggered checkout fetches.
    expect(since?.run).toContain('"+refs/heads/$BASE_REF:refs/remotes/origin/$BASE_REF"');
  });

  it("honours an explicit request over the cost gate, and skips a closed PR", async () => {
    const wf = (await read("agent-review.yml")) as {
      jobs?: Record<
        string,
        { steps?: Array<{ name?: string; run?: string; env?: Record<string, string> }> }
      >;
    };
    const gate = wf.jobs?.["review"]?.steps?.find(
      (step) => step.name === "Is this worth a review?",
    );

    expect(gate?.env?.REQUESTED).toBe("${{ steps.pr.outputs.requested }}");
    expect(gate?.env?.PR_OPEN).toBe("${{ steps.pr.outputs.open }}");
    // Both short-circuits must precede the CLI call, or they decide nothing.
    const cli = gate?.run?.indexOf("review needed") ?? -1;
    expect(cli).toBeGreaterThan(-1);
    expect(gate?.run?.indexOf('"$PR_OPEN" != "true"')).toBeLessThan(cli);
    expect(gate?.run?.indexOf('"$REQUESTED" = "true"')).toBeLessThan(cli);
  });

  /**
   * `review prompt` derives the roadmap id from the branch via
   * `GITHUB_HEAD_REF`, which only a `pull_request` event sets. Unset, the
   * reviewer gets the persona and no intent — a generic "look for bugs" pass,
   * which is rung 1 with a model attached.
   */
  it("tells the prompt which branch it is reviewing", async () => {
    const wf = (await read("agent-review.yml")) as {
      jobs?: Record<string, { steps?: Array<{ name?: string; env?: Record<string, string> }> }>;
    };
    const prompt = wf.jobs?.["review"]?.steps?.find(
      (step) => step.name === "Assemble the reviewer prompt",
    );

    expect(prompt?.env?.MORPHEUS_BRANCH).toBe("${{ steps.pr.outputs.head_ref }}");
  });

  /**
   * Delivery is meant to be a *required* status check: it is what stops a merge
   * outrunning the reviewer. That only works if the job actually fails on a
   * non-delivery — the previous shape warned and exited 0, which as a required
   * check is a gate that never closes. The waiver is the pressure valve that
   * makes requiring it survivable when the reviewer itself is broken.
   */
  it("fails on a non-delivery, and honours a spoken waiver", async () => {
    const wf = (await read("agent-review.yml")) as {
      jobs?: Record<string, { steps?: Array<{ name?: string; run?: string }> }>;
    };
    const delivery = wf.jobs?.["delivery"]?.steps?.find(
      (step) => step.name === "Verify the review was delivered",
    );
    const run = delivery?.run ?? "";

    // The not-confirmed path must end the job in failure, not a warning.
    expect(run).toContain("::error title=Agent review not delivered");
    expect(run.trimEnd().endsWith("exit 1")).toBe(true);

    // The waiver is read from the PR body at verification time, so editing the
    // body and re-running the job is the recovery path.
    expect(run).toContain('gh api "repos/$REPO/pulls/$PR_NUMBER" --jq \'.body // ""\'');
    expect(run).toContain("--pr-body-file /tmp/pr-body.md");
    // An unreadable body is no waiver — fail closed.
    expect(run).toContain(': > /tmp/pr-body.md');
    // Waived is reported as waived, never as confirmed.
    expect(run).toContain("waived:*)");
    expect(run).toContain("::warning title=Agent review waived");
  });

  it("hands the resolved pull request number to the delivery check", async () => {
    const wf = (await read("agent-review.yml")) as {
      jobs?: Record<
        string,
        {
          outputs?: Record<string, string>;
          steps?: Array<{ name?: string; env?: Record<string, string> }>;
        }
      >;
    };
    expect(wf.jobs?.["review"]?.outputs?.pr_number).toBe("${{ steps.pr.outputs.number }}");

    const delivery = wf.jobs?.["delivery"]?.steps?.find(
      (step) => step.name === "Verify the review was delivered",
    );
    expect(delivery?.env?.PR_NUMBER).toBe("${{ needs.review.outputs.pr_number }}");
  });
});

describe("agent-review-request.yml", () => {
  it("fires on a comment, and only on a pull request", async () => {
    const wf = (await read("agent-review-request.yml")) as {
      on?: { issue_comment?: { types?: string[] } };
      jobs?: Record<string, { if?: string; uses?: string; with?: Record<string, unknown> }>;
    };
    expect(wf.on?.issue_comment?.types).toEqual(["created"]);

    const job = wf.jobs?.["agent-review"];
    expect(job?.uses).toContain("agent-review.yml");
    expect(job?.if).toContain("github.event.issue.pull_request != null");
    expect(job?.if).toContain("@claude");
    expect(job?.with?.["pr-number"]).toBe("${{ github.event.issue.number }}");
  });

  /**
   * This repo is public and takes external contributions. Morpheus does nothing
   * by default for anyone without repo collaboration access, and here the
   * default would be spending the API budget — the workflow already holds the
   * key and write access to comment.
   */
  it("acts only on a comment from someone with repo access", async () => {
    const wf = (await read("agent-review-request.yml")) as {
      jobs?: Record<string, { if?: string }>;
    };
    const guard = wf.jobs?.["agent-review"]?.if ?? "";

    for (const association of ["OWNER", "MEMBER", "COLLABORATOR"]) {
      expect(guard).toContain(`github.event.comment.author_association == '${association}'`);
    }
    // Anything looser would let a first-time commenter trigger a paid run.
    expect(guard).not.toContain("CONTRIBUTOR");
    expect(guard).not.toContain("NONE");
  });

  /**
   * Untrusted text reaching a `run:` block is string substitution, not a
   * variable — and a comment body is the most attacker-controlled input on the
   * repository. This caller must only ever *match* on it.
   */
  it("never puts the comment body into a shell", async () => {
    const wf = (await read("agent-review-request.yml")) as {
      jobs?: Record<string, { steps?: Array<{ run?: string }> }>;
    };
    for (const job of Object.values(wf.jobs ?? {})) {
      for (const step of job.steps ?? []) {
        expect(step.run ?? "").not.toContain("github.event.comment");
      }
    }
  });
});

describe("ci.yml", () => {
  it("compiles Morpheus and rejects stale committed artifacts", async () => {
    const wf = await read("ci.yml");
    expect(wf.jobs?.node?.with).toEqual(
      expect.objectContaining({
        "build-script": "compile",
        "verify-build-clean": true,
        "build-output-directory": "dist",
      }),
    );
  });

  it("calls the agent review rung", async () => {
    const wf = await read("ci.yml");
    expect(wf.jobs?.["agent-review"]?.uses).toContain("agent-review.yml");
  });

  /**
   * Reviews still run once per pull request, but the skip must live *inside*
   * the reusable workflow, never in the caller's `if:`. A caller-level skip on
   * `synchronize` leaves the nested `agent-review / delivery` check
   * *unreported* — and an unreported required check blocks the merge forever,
   * where a job-level skip is reported as skipped and satisfies it. Caught by
   * rung 2 on the PR that nearly required the check in the broken shape.
   */
  it("reviews once per pull request, decided inside the workflow", async () => {
    const wf = (await read("ci.yml")) as {
      on?: { pull_request?: { types?: string[] } };
      jobs?: Record<string, { if?: string }>;
    };
    // `ready_for_review` is not in the default set, so the list has to be spelled out.
    expect(wf.on?.pull_request?.types).toContain("ready_for_review");
    expect(wf.on?.pull_request?.types).toContain("synchronize");

    // No caller-level skip, on this job or any other: the delivery check must
    // be reported on every push for required-check protection to be satisfiable.
    for (const [name, job] of Object.entries(wf.jobs ?? {})) {
      expect(job.if, `${name} must run on every push`).toBeUndefined();
    }

    // The once-per-PR economics live in the called workflow's gate instead.
    const called = (await read("agent-review.yml")) as {
      on?: {
        workflow_call?: {
          inputs?: Record<string, { type?: string; default?: unknown }>;
        };
      };
      jobs?: Record<string, { steps?: Array<{ name?: string; run?: string; env?: Record<string, string> }> }>;
    };
    expect(called.on?.workflow_call?.inputs?.["synchronize-reviews"]).toEqual(
      expect.objectContaining({ type: "boolean", default: false }),
    );
    const gate = called.jobs?.["review"]?.steps?.find(
      (step) => step.name === "Is this worth a review?",
    );
    expect(gate?.env?.EVENT_ACTION).toBe("${{ github.event.action }}");
    expect(gate?.env?.SYNCHRONIZE_REVIEWS).toBe("${{ inputs.synchronize-reviews }}");
    // The skip must precede the CLI call, or it decides nothing.
    const cli = gate?.run?.indexOf("review needed") ?? -1;
    const skip = gate?.run?.indexOf('"$EVENT_ACTION" = "synchronize"') ?? -1;
    expect(skip).toBeGreaterThan(-1);
    expect(skip).toBeLessThan(cli);
  });

  /**
   * Rung 2 is advisory. Making it a dependency of anything, or letting it gate
   * a merge, is the change this asserts against — a model-graded gate that can
   * fail on its own noise trains everyone to bypass it.
   */
  it("does not let the review rung block anything else", async () => {
    const wf = (await read("ci.yml")) as {
      jobs?: Record<string, { needs?: string | string[] }>;
    };
    for (const [name, job] of Object.entries(wf.jobs ?? {})) {
      const needs = [job.needs ?? []].flat();
      expect(needs, `${name} must not depend on agent-review`).not.toContain("agent-review");
    }
  });
});

describe("committed build output", () => {
  it("cleans stale files and stages additions before comparing", async () => {
    const wf = (await read("node-ci.yml")) as {
      jobs?: Record<string, { steps?: Array<{ name?: string; run?: string }> }>;
    };
    const steps = wf.jobs?.check?.steps ?? [];
    const clean = steps.find((step) => step.name === "Clean committed build output");
    const verify = steps.find((step) => step.name === "Verify committed build output");

    expect(clean?.run).toContain("git ls-files --error-unmatch");
    expect(clean?.run).toContain('git rm -r -f -- "$BUILD_OUTPUT_DIRECTORY"');
    expect(clean?.run).not.toContain("--ignore-unmatch");
    expect(clean?.run).toContain('*"*"*|*"?"*|*"["*|*":"*');
    expect(verify?.run).toContain("verify-build-clean requires build-output-directory");
    expect(verify?.run).toContain('git add --all -- "$BUILD_OUTPUT_DIRECTORY"');
    expect(verify?.run).toContain("git diff --cached --exit-code");
  });

  it("consumer workflows use the selected ref's packaged CLI", async () => {
    for (const file of ["agent-review.yml", "heartbeat.yml", "pm-check.yml", "pr-check.yml"]) {
      const raw = await readFile(join(DIR, file), "utf8");
      expect(raw, file).toContain("pnpm install --frozen-lockfile");
      expect(raw, file).not.toContain("pnpm compile");
    }
  });
});

/**
 * A called workflow cannot request more than its caller was granted, and a
 * caller job with no `permissions` block gets the repository default.
 *
 * The failure is not a skipped job — the *entire* workflow file is rejected
 * and nothing runs. It took down all of CI on PR #55 with "The nested job
 * 'review' is requesting 'pull-requests: write', but is only allowed
 * 'pull-requests: none'."
 */
describe("caller permissions cover what they call", () => {
  it("declares at least the permissions the nested workflow asks for", async () => {
    const files = (await readdir(DIR)).filter((f) => f.endsWith(".yml"));

    for (const file of files) {
      const wf = (await read(file)) as {
        jobs?: Record<string, { uses?: string; permissions?: Record<string, string> }>;
      };

      for (const [name, job] of Object.entries(wf.jobs ?? {})) {
        const local = job.uses?.match(/^\.\/\.github\/workflows\/(.+)$/)?.[1];
        if (!local) continue;

        const called = (await read(local)) as {
          jobs?: Record<string, { permissions?: Record<string, string> }>;
        };

        const needed: Record<string, string> = {};
        for (const inner of Object.values(called.jobs ?? {})) {
          Object.assign(needed, inner.permissions ?? {});
        }

        for (const [scope, level] of Object.entries(needed)) {
          if (level !== "write") continue;
          expect(
            job.permissions?.[scope],
            `${file}:${name} calls ${local}, which needs ${scope}: write`,
          ).toBe("write");
        }
      }
    }
  });
});

/**
 * The reviewer has to be able to report.
 *
 * Supplying `prompt` puts claude-code-action into automation mode, which grants
 * the base GitHub tools but not the ones that write to a pull request — and
 * creates no tracking comment. The first live run spent 20 turns and $0.86
 * producing a review, hit nine permission denials trying to post it, and exited
 * green with `agent-review / review  pass`.
 *
 * That is the failure this rung was explicitly built not to have: a verifier
 * that cannot speak is indistinguishable from one that found nothing, and the
 * green check reads as evidence either way.
 */
describe("agent-review can actually post", () => {
  /**
   * Read from the *parsed* step, never the raw file.
   *
   * The first version of these guards used `toContain` over the whole file, so
   * commenting out the `claude_args:` block left all of them green while the
   * reviewer was mute again — the guard against the bug passing on the bug.
   * Caught by the reviewer, on the pull request that introduced it.
   */
  async function reviewStep(): Promise<Record<string, unknown>> {
    const wf = (await read("agent-review.yml")) as {
      jobs?: Record<string, { steps?: Array<{ with?: Record<string, unknown> }> }>;
    };
    const step = wf.jobs?.["review"]?.steps?.find((s) =>
      Object.hasOwn(s.with ?? {}, "anthropic_api_key"),
    );
    expect(step, "no step passes anthropic_api_key").toBeDefined();
    return step!.with!;
  }

  /**
   * The args the action will actually act on.
   *
   * `claude_args` is a YAML block scalar, and **YAML does not treat `#` as a
   * comment inside `|`** — the `#` survives into the string. The action strips
   * those lines itself (`stripShellComments`, `base-action/src/parse-sdk-options.ts`),
   * which makes commenting a line out the supported way to disable it.
   *
   * So asserting on the raw string passes on a commented-out `--allowedTools`
   * while the reviewer is mute. The first version of these guards read the raw
   * file and the second read the unstripped scalar; both were the same mistake
   * at different depths — fixing the *instance* rather than the *class*. This
   * mirrors what the action does, so the test sees what the action sees.
   */
  async function effectiveArgs(): Promise<string> {
    return String((await reviewStep())["claude_args"] ?? "")
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
  }

  it("forces tag mode, or automation mode leaves it nowhere to write", async () => {
    expect((await reviewStep())["track_progress"]).toBe(true);
  });

  it("grants the tools a review is delivered through", async () => {
    const args = await effectiveArgs();
    // Inline findings and the top-level comment are separate paths; losing
    // either silently halves what a review can say.
    expect(args).toContain("mcp__github_inline_comment__create_inline_comment");
    expect(args).toContain("Bash(gh pr comment:*)");
  });

  it("keeps a runaway backstop well above observed usage", async () => {
    const turns = Number(/--max-turns (\d+)/.exec(await effectiveArgs())?.[1]);
    expect(turns).toBeGreaterThan(20);
  });
});

describe("agent-review cost controls", () => {
  it("diffs against the last reviewed commit, not the merge base", async () => {
    const raw = await readFile(join(DIR, "agent-review.yml"), "utf8");
    // The run history is the record of what was reviewed and when, so no cursor
    // is stored that could disagree with reality.
    // Derived, never hardcoded: agent-review.yml is reusable, and naming the
    // caller `ci.yml` would make this a silent permanent no-op in any consumer
    // whose caller is named anything else.
    expect(raw).not.toContain("actions/workflows/ci.yml/runs");
    expect(raw).toContain("GITHUB_WORKFLOW_REF");
    expect(raw).toContain("actions/workflows/$caller/runs");
    expect(raw).toContain('BASE: ${{ steps.since.outputs.base }}');
    expect(raw).toContain('--base "$BASE"');
  });

  it("hands the gate the last review, so an answering push is not skipped", async () => {
    const raw = await readFile(join(DIR, "agent-review.yml"), "utf8");
    expect(raw).toContain("--prior-review");
  });

  it("falls back to the base branch on a first review", async () => {
    const raw = await readFile(join(DIR, "agent-review.yml"), "utf8");
    expect(raw).toContain("base=origin/$BASE_REF");
  });

  it("pins a model rather than inheriting the action's default", async () => {
    const wf = (await read("agent-review.yml")) as {
      on?: { workflow_call?: { inputs?: { model?: { default?: string } } } };
    };
    // Unpinned it chose claude-opus-5[1m] and averaged $1.14 a review. An
    // unpinned default can also move under you, changing cost and quality with
    // no diff to show for it.
    expect(wf.on?.workflow_call?.inputs?.model?.default).toBeTruthy();
  });

  it("gates the model call on there being something to review", async () => {
    const raw = await readFile(join(DIR, "agent-review.yml"), "utf8");
    expect(raw).toMatch(/if:.*steps\.needed\.outputs\.review == 'true'/);
  });

  it("says so when it skips, rather than passing silently", async () => {
    const raw = await readFile(join(DIR, "agent-review.yml"), "utf8");
    expect(raw).toContain("Green here means skipped, not passed.");
  });
});

describe("schedule.yml cadence", () => {
  it("beats hourly, every day", async () => {
    const wf = (await read("schedule.yml")) as {
      on?: { schedule?: Array<{ cron?: string }> };
    };
    expect(wf.on?.schedule?.[0]?.cron).toBe("0 * * * *");
  });
});

/**
 * `${{ }}` substitutes before bash parses, so any attacker-controlled value
 * interpolated into a `run:` block is executed. A branch name is
 * attacker-controlled on a fork pull request, and this repo is public and takes
 * external contributions — a live surface, not a theoretical one.
 */
describe("no untrusted interpolation into shell", () => {
  const UNTRUSTED = [
    "github.head_ref",
    "github.event.pull_request.title",
    "github.event.pull_request.body",
  ];

  it("never templates an attacker-controlled value into a run block", async () => {
    const files = (await readdir(DIR)).filter((f) => f.endsWith(".yml"));

    for (const file of files) {
      // Parsed, not split on text: the `env:` block sits directly above `run:`,
      // so any text-slicing heuristic sees the two as one chunk and flags the
      // safe form as unsafe. `step.run` is exactly the shell that executes.
      const wf = (await read(file)) as {
        jobs?: Record<string, { steps?: Array<{ run?: string }> }>;
      };

      for (const [job, def] of Object.entries(wf.jobs ?? {})) {
        for (const step of def.steps ?? []) {
          for (const ctx of UNTRUSTED) {
            expect(
              step.run?.includes(`\${{ ${ctx} }}`) ?? false,
              `${file}:${job} interpolates ${ctx} into a run block`,
            ).toBe(false);
          }
        }
      }
    }
  });
});

describe("the review gate fails open", () => {
  /**
   * `review=$(node …)` swallows a non-zero exit into an empty string, which
   * reads as false and skips — discarding the fail-open `needed()` goes out of
   * its way to provide. A crash must review, not go quiet.
   */
  it("reviews when the gate itself crashes", async () => {
    const raw = await readFile(join(DIR, "agent-review.yml"), "utf8");
    expect(raw).toMatch(/if ! out=\$\(node/);
    expect(raw).toContain('echo "review=true"');
  });

  it("drops checklist lines before the gate reads a prior review", async () => {
    const raw = await readFile(join(DIR, "agent-review.yml"), "utf8");
    // `- [x] Read src/x.ts` names a file without raising anything.
    expect(raw).toContain("\\[[ x]\\]");
  });
});

describe("firebase-tests.yml", () => {
  type FirebaseTests = {
    on?: {
      workflow_call?: {
        inputs?: Record<string, { type?: string; default?: unknown }>;
        secrets?: Record<string, unknown>;
      };
    };
    jobs?: Record<string, { steps?: Array<Record<string, unknown>> }>;
  };

  it("is reusable, so a project can call it", async () => {
    const wf = (await read("firebase-tests.yml")) as FirebaseTests;
    expect(wf.on).toHaveProperty("workflow_call");
  });

  it("declares no secrets, so it passes on a fork pull request", async () => {
    // The emulators authenticate nobody; the moment this workflow needs a
    // secret it silently stops running the suites external contributors need
    // most.
    const wf = (await read("firebase-tests.yml")) as FirebaseTests;
    expect(wf.on?.workflow_call?.secrets).toBeUndefined();
  });

  it("pins a JDK the emulators support, rather than trusting the runner image", async () => {
    // firebase-tools 15 refuses a JDK older than 21, and ubuntu-latest's
    // preinstalled JRE is older than that — a failure that only appears in CI,
    // because a developer machine with a current JDK passes locally.
    const wf = (await read("firebase-tests.yml")) as FirebaseTests;
    expect(wf.on?.workflow_call?.inputs?.["java-version"]?.default).toBe("21");
    const raw = await readFile(join(DIR, "firebase-tests.yml"), "utf8");
    expect(raw).toContain("actions/setup-java@v4");
  });

  it("pins firebase-tools to a major", async () => {
    const wf = (await read("firebase-tests.yml")) as FirebaseTests;
    expect(wf.on?.workflow_call?.inputs?.["firebase-tools-version"]?.default).toBe("15");
  });

  it("leaves pnpm-version empty so packageManager decides", async () => {
    // Setting both makes pnpm/action-setup fail with "Multiple versions of
    // pnpm specified" — found by the repo following the stricter practice.
    const wf = (await read("firebase-tests.yml")) as FirebaseTests;
    expect(wf.on?.workflow_call?.inputs?.["pnpm-version"]?.default).toBe("");
  });

  it("caches the emulator jars keyed on firebase.json, in both jobs", async () => {
    // The emulators are ~100 MB of Java fetched from Google on first use.
    // firebase.json is what names the emulators, so it is the key.
    const raw = await readFile(join(DIR, "firebase-tests.yml"), "utf8");
    const matches = raw.match(/hashFiles\('firebase\.json'\)/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it("caches Playwright browsers keyed on the lockfile", async () => {
    // The lockfile pins the Playwright version the downloaded browser must
    // match; keying on anything else serves a stale browser to a new runner.
    const raw = await readFile(join(DIR, "firebase-tests.yml"), "utf8");
    expect(raw).toContain("~/.cache/ms-playwright");
    expect(raw).toContain("hashFiles('pnpm-lock.yaml')");
  });

  it("installs the browser only — never --with-deps", async () => {
    // --with-deps' sudo apt-get path hung indefinitely on ubuntu-latest,
    // three runs in a row, 40+ minutes each. The runner image already ships
    // headless Chromium's libraries; a future image dropping one fails at
    // launch with the library named, which is the legible failure. Asserted
    // on the parsed step, not the raw file — the comment explaining the rule
    // legitimately names the flag.
    const wf = (await read("firebase-tests.yml")) as {
      jobs?: Record<string, { steps?: Array<{ name?: string; run?: string }> }>;
    };
    const install = wf.jobs?.["e2e"]?.steps?.find((s) => s.name === "Install Chromium");
    expect(install?.run).toContain("playwright install chromium");
    expect(install?.run).not.toContain("--with-deps");
  });

  it("bounds the hang-prone steps with timeouts", async () => {
    // A hung step otherwise runs to GitHub's 6-hour default on paid minutes.
    const wf = (await read("firebase-tests.yml")) as {
      jobs?: Record<string, {
        "timeout-minutes"?: number;
        steps?: Array<Record<string, unknown>>;
      }>;
    };
    expect(wf.jobs?.["e2e"]?.["timeout-minutes"]).toBe(15);
    const install = wf.jobs?.["e2e"]?.steps?.find((s) => s["name"] === "Install Chromium");
    expect(install?.["timeout-minutes"]).toBe(5);
  });

  it("cancels a superseded run instead of racing it", async () => {
    // Two pushes minutes apart left two hung jobs burning in parallel. The
    // groups are per job and keyed on ref — workflow-level concurrency in a
    // *called* workflow does not govern the caller's run, and one shared group
    // would make a single run's two jobs cancel each other.
    const wf = (await read("firebase-tests.yml")) as {
      jobs?: Record<string, {
        concurrency?: { group?: string; "cancel-in-progress"?: boolean };
      }>;
    };
    const groups = new Set<string>();
    for (const name of ["emulators", "e2e"]) {
      const concurrency = wf.jobs?.[name]?.concurrency;
      expect(concurrency?.["cancel-in-progress"], `${name} must cancel-in-progress`).toBe(true);
      expect(concurrency?.group, `${name} group must key on ref`).toContain("${{ github.ref }}");
      groups.add(concurrency!.group!);
    }
    expect(groups.size).toBe(2);
  });

  it("keeps traces from failures", async () => {
    const wf = (await read("firebase-tests.yml")) as FirebaseTests;
    const steps = wf.jobs?.["e2e"]?.steps ?? [];
    const upload = steps.find((s) => String(s["uses"] ?? "").startsWith("actions/upload-artifact"));
    expect(upload).toBeDefined();
    expect(upload?.["if"]).toBe("failure()");
  });

  it("asks for read access and no more", async () => {
    const wf = (await read("firebase-tests.yml")) as { permissions?: Record<string, string> };
    expect(wf.permissions).toEqual({ contents: "read" });
  });
});
