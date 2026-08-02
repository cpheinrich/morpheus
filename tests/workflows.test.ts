import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

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

    for (const file of files) {
      const wf = await read(file);
      for (const [name, job] of Object.entries(wf.jobs ?? {})) {
        const local = job.uses?.match(/^\.\/\.github\/workflows\/(.+)$/)?.[1];
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
  it("is reusable and takes the key as an optional secret", async () => {
    const wf = (await read("agent-review.yml")) as {
      on?: { workflow_call?: { secrets?: Record<string, { required?: boolean }> } };
    };
    const secret = wf.on?.workflow_call?.secrets?.["anthropic_api_key"];
    expect(secret).toBeDefined();
    // Required would fail every repo that has not configured the rung.
    expect(secret?.required).toBe(false);
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
  });
});

describe("ci.yml", () => {
  it("calls the agent review rung", async () => {
    const wf = await read("ci.yml");
    expect(wf.jobs?.["agent-review"]?.uses).toContain("agent-review.yml");
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
    expect(raw).toMatch(/--base \$\{\{ steps\.since\.outputs\.base \}\}/);
  });

  it("hands the gate the last review, so an answering push is not skipped", async () => {
    const raw = await readFile(join(DIR, "agent-review.yml"), "utf8");
    expect(raw).toContain("--prior-review");
  });

  it("falls back to the base branch on a first review", async () => {
    const raw = await readFile(join(DIR, "agent-review.yml"), "utf8");
    expect(raw).toContain('base=origin/${{ github.base_ref }}');
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
