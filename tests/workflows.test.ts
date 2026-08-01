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
