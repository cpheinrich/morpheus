import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
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
const execFileAsync = promisify(execFile);

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

describe("dependabot-maintainer.yml", () => {
  type Step = {
    name?: string;
    id?: string;
    uses?: string;
    with?: Record<string, unknown>;
    env?: Record<string, string>;
    run?: string;
  };
  type Maintainer = {
    on?: { workflow_call?: { inputs?: Record<string, { default?: unknown }>; secrets?: Record<string, unknown> } };
    jobs?: Record<string, { permissions?: Record<string, string>; needs?: string | string[]; steps?: Step[] }>;
  };

  it("is reusable, cheap by default, and keeps the key optional", async () => {
    const wf = (await read("dependabot-maintainer.yml")) as Maintainer;
    expect(wf.on).toHaveProperty("workflow_call");
    expect(wf.on?.workflow_call?.inputs?.model?.default).toBe("gpt-5.6-luna");
    expect(wf.on?.workflow_call?.secrets?.openai_api_key).toBeDefined();
  });

  it("gives Codex no GitHub write permission and makes it the final step", async () => {
    const wf = (await read("dependabot-maintainer.yml")) as Maintainer;
    const agent = wf.jobs?.agent;
    const steps = agent?.steps ?? [];
    const codex = steps.at(-1);

    expect(agent?.permissions).toEqual({ contents: "read" });
    expect(codex?.uses).toMatch(/^openai\/codex-action@[0-9a-f]{40}$/);
    expect(codex?.with?.["permission-profile"]).toBe(":read-only");
    expect(codex?.with?.["safety-strategy"]).toBe("drop-sudo");
  });

  it("can read both check-run and commit-status protection results", async () => {
    const wf = (await read("dependabot-maintainer.yml")) as Maintainer;

    expect(wf.jobs?.inspect?.permissions).toMatchObject({
      checks: "read",
      statuses: "read",
    });
  });

  it("delivers in a separate job that revalidates the inspection", async () => {
    const wf = (await read("dependabot-maintainer.yml")) as Maintainer;
    const delivery = wf.jobs?.delivery;
    const deliver = delivery?.steps?.find((step) => step.name === "Revalidate and deliver decisions");

    expect([delivery?.needs ?? []].flat()).toEqual(["inspect", "agent"]);
    expect(delivery?.permissions).toEqual({
      contents: "write",
      "pull-requests": "write",
      issues: "write",
      checks: "read",
      statuses: "read",
    });
    expect(deliver?.run).toContain("dependabot-maintainer.mjs deliver");
    expect(deliver?.env?.AGENT_RESULT).toBe("${{ needs.agent.outputs.result }}");
  });

  it("uploads the dot-prefixed inspection receipt explicitly", async () => {
    const wf = (await read("dependabot-maintainer.yml")) as Maintainer;
    const upload = wf.jobs?.inspect?.steps?.find((step) =>
      step.uses?.startsWith("actions/upload-artifact@"),
    );

    expect(upload?.with?.path).toBe(".dependabot-maintainer");
    expect(upload?.with?.["include-hidden-files"]).toBe(true);
  });
});

describe("release-preflight.yml", () => {
  type ReleasePreflight = {
    on?: {
      workflow_call?: {
        inputs?: Record<string, unknown>;
        outputs?: Record<string, { value?: string }>;
        secrets?: Record<string, unknown>;
      };
    };
    permissions?: Record<string, string>;
    jobs?: Record<
      string,
      {
        outputs?: Record<string, string>;
        steps?: Array<{
          name?: string;
          id?: string;
          uses?: string;
          with?: Record<string, unknown>;
          env?: Record<string, string>;
          run?: string;
        }>;
      }
    >;
  };

  it("is a secret-free read-only gate that returns the reviewed SHA", async () => {
    const wf = (await read("release-preflight.yml")) as ReleasePreflight;
    const call = wf.on?.workflow_call;

    expect(call).toBeDefined();
    expect(wf.on).toHaveProperty("workflow_dispatch");
    expect(call?.inputs).toBeUndefined();
    expect(call?.secrets).toBeUndefined();
    expect(call?.outputs?.sha?.value).toBe("${{ jobs.verify.outputs.sha }}");
    expect(wf.permissions).toEqual({ contents: "read", "pull-requests": "read" });
  });

  it("checks out only the requested SHA without persisting credentials", async () => {
    const steps = ((await read("release-preflight.yml")) as ReleasePreflight).jobs?.verify
      ?.steps ?? [];
    const checkout = steps.find((step) => step.uses === "actions/checkout@v7");

    expect(checkout?.with).toEqual({
      ref: "${{ github.sha }}",
      "fetch-depth": 1,
      "persist-credentials": false,
    });
  });

  it("pins clean current main to an exact merged pull request", async () => {
    const steps = ((await read("release-preflight.yml")) as ReleasePreflight).jobs?.verify
      ?.steps ?? [];
    const verify = steps.find((step) => step.name === "Verify reviewed release source");
    const script = String(verify?.run);

    expect(verify?.env?.GH_TOKEN).toBe("${{ github.token }}");
    expect(script).toContain('GITHUB_REF" != "refs/heads/main');
    expect(script).toContain("git rev-parse HEAD");
    expect(script).toContain("git status --porcelain --untracked-files=all");
    expect(script).toContain("/git/ref/heads/main");
    expect(script).toContain("/commits/${EXPECTED_SHA}/pulls");
    expect(script).toContain("[.number, .base.ref, .merge_commit_sha] | @tsv");
    expect(script).toContain('candidate_base" = "main');
    expect(script).toContain('candidate_sha" = "$EXPECTED_SHA');
    expect(script).toContain('echo "sha=$EXPECTED_SHA"');
  });

  it("rejects dirty and direct-push fixtures before a release can run", async () => {
    const root = await mkdtemp(join(tmpdir(), "morpheus-release-preflight-"));
    const repo = join(root, "repo");
    const bin = join(root, "bin");
    const output = join(root, "output");

    try {
      await mkdir(repo, { recursive: true });
      await mkdir(bin, { recursive: true });
      await execFileAsync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: repo });
      await execFileAsync("git", ["config", "user.name", "Morpheus Test"], { cwd: repo });
      await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: repo });
      await writeFile(join(repo, "source.txt"), "reviewed\n", "utf8");
      await execFileAsync("git", ["add", "source.txt"], { cwd: repo });
      await execFileAsync("git", ["commit", "--quiet", "-m", "reviewed"], { cwd: repo });
      const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
      const sha = stdout.trim();

      const fakeGh = join(bin, "gh");
      await writeFile(
        fakeGh,
        `#!/usr/bin/env bash
case "$*" in
  *"/git/ref/heads/main"*) printf '%s\\n' "$EXPECTED_SHA" ;;
  *"/commits/"*"/pulls"*)
    if [ "$PREFLIGHT_ASSOCIATED_PR" = "true" ]; then
      printf '42\\tmain\\t%s\\n' "$EXPECTED_SHA"
    fi
    ;;
  *) exit 2 ;;
esac
`,
        "utf8",
      );
      await chmod(fakeGh, 0o755);

      const steps = ((await read("release-preflight.yml")) as ReleasePreflight).jobs?.verify
        ?.steps ?? [];
      const script = steps.find((step) => step.name === "Verify reviewed release source")?.run;
      expect(script).toBeTruthy();

      const run = (associated: boolean) =>
        execFileAsync("bash", ["-c", script!], {
          cwd: repo,
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            GITHUB_REF: "refs/heads/main",
            GITHUB_REPOSITORY: "cpheinrich/example",
            GITHUB_OUTPUT: output,
            EXPECTED_SHA: sha,
            GH_TOKEN: "fixture",
            PREFLIGHT_ASSOCIATED_PR: String(associated),
          },
        });

      await expect(run(true)).resolves.toBeDefined();
      expect(await readFile(output, "utf8")).toContain(`sha=${sha}`);

      await writeFile(join(repo, "dirty.txt"), "unreviewed\n", "utf8");
      await expect(run(true)).rejects.toMatchObject({ stderr: expect.stringContaining("not clean") });
      await rm(join(repo, "dirty.txt"));

      await expect(run(false)).rejects.toMatchObject({
        stderr: expect.stringContaining("not associated with a merged pull request"),
      });
    } finally {
      await rm(root, { recursive: true, force: true });
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

  it("gives the beat read-only PR evidence for pre-reconciliation merges", async () => {
    const wf = (await read("heartbeat.yml")) as {
      permissions?: Record<string, string>;
      jobs?: Record<string, { steps?: Array<{ name?: string; env?: Record<string, string> }> }>;
    };
    const beat = wf.jobs?.["beat"]?.steps?.find((step) => step.name === "Beat");

    expect(wf.permissions).toEqual({ contents: "read", "pull-requests": "read" });
    expect(beat?.env?.GH_TOKEN).toBe("${{ github.token }}");
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

describe("osv-scan.yml", () => {
  it("is reusable and pins the full OSV scan workflow", async () => {
    const wf = await read("osv-scan.yml");
    const scan = wf.jobs?.scan;

    expect(wf.on).toHaveProperty("workflow_call");
    expect(scan?.uses).toBe(
      "google/osv-scanner-action/.github/workflows/osv-scanner-reusable.yml@0c58c542420dfd23fcac08dd9c8ca3cca9c36f1a",
    );
  });

  it("schedules scans and runs them after Morpheus reaches main", async () => {
    const wf = await read("security.yml");

    expect(wf.on).toHaveProperty("schedule");
    expect(wf.on).toHaveProperty("workflow_dispatch");
    expect(wf.jobs?.osv?.uses).toBe("./.github/workflows/osv-scan.yml");
    expect((wf as { permissions?: Record<string, string> }).permissions).toEqual({
      actions: "read",
      contents: "read",
      "security-events": "write",
    });
  });
});

describe("vercel-deploy.yml", () => {
  it("is an atomic reusable deploy workflow with explicit credentials", async () => {
    const wf = (await read("vercel-deploy.yml")) as {
      on?: {
        workflow_call?: {
          secrets?: Record<string, { required?: boolean }>;
        };
      };
      jobs?: Record<string, { permissions?: Record<string, string>; if?: string }>;
    };

    expect(Object.keys(wf.on ?? {})).toEqual(["workflow_call"]);
    for (const secret of ["VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"]) {
      expect(wf.on?.workflow_call?.secrets?.[secret]?.required, secret).toBe(true);
    }
    expect(wf.jobs?.deploy?.permissions).toEqual({
      contents: "read",
      "pull-requests": "write",
    });
  });

  it("does not expose caller secrets to fork pull requests", async () => {
    const wf = (await read("vercel-deploy.yml")) as {
      jobs?: Record<string, { if?: string }>;
    };
    expect(wf.jobs?.deploy?.if).toContain(
      "github.event.pull_request.head.repo.full_name == github.repository",
    );
  });

  it("publishes the exact Vercel URL and updates one PR comment", async () => {
    const raw = await readFile(join(DIR, "vercel-deploy.yml"), "utf8");
    expect(raw).toContain('echo "url=$deployment_url" >> "$GITHUB_OUTPUT"');
    expect(raw).toContain("<!-- morpheus-vercel-preview -->");
    expect(raw).toContain("steps.deploy.outputs.url");
  });

  it("lets monorepos and app-only repos identify the manifest that pins pnpm", async () => {
    const wf = (await read("vercel-deploy.yml")) as {
      on?: {
        workflow_call?: {
          inputs?: Record<string, { default?: unknown }>;
        };
      };
      jobs?: Record<string, { steps?: Array<{ name?: string; with?: Record<string, unknown> }> }>;
    };
    expect(wf.on?.workflow_call?.inputs?.["package-manager-file"]?.default).toBe("package.json");
    const setup = wf.jobs?.deploy?.steps?.find((step) => step.name === "Set up pnpm");
    expect(setup?.with?.package_json_file).toBe("${{ inputs.package-manager-file }}");
  });

  it("runs from repository root so Vercel applies its configured Root Directory once", async () => {
    const wf = (await read("vercel-deploy.yml")) as {
      on?: {
        workflow_call?: {
          inputs?: Record<string, { default?: unknown }>;
        };
      };
    };
    expect(wf.on?.workflow_call?.inputs?.["working-directory"]?.default).toBe(".");
  });

  it("uses a dedicated preview environment rather than inheriting a caller's old policy", async () => {
    const wf = (await read("vercel-deploy.yml")) as {
      on?: { workflow_call?: { inputs?: Record<string, { default?: unknown }> } };
      jobs?: Record<string, { environment?: { name?: string } }>;
    };
    expect(wf.on?.workflow_call?.inputs?.["preview-environment"]?.default).toBe(
      "Vercel Preview",
    );
    expect(wf.jobs?.deploy?.environment?.name).toContain("inputs.preview-environment");
  });
});

describe("agent-review.yml", () => {
  it("can be disabled inside the reusable workflow without removing its reported jobs", async () => {
    const called = (await read("agent-review.yml")) as {
      on?: {
        workflow_call?: {
          inputs?: Record<string, { type?: string; default?: unknown }>;
        };
      };
      jobs?: Record<string, { if?: string }>;
    };

    expect(called.on?.workflow_call?.inputs?.enabled).toEqual(
      expect.objectContaining({ type: "boolean", default: true }),
    );
    expect(called.jobs?.review?.if).toContain("inputs.enabled");
    expect(called.jobs?.delivery?.if).toContain("inputs.enabled");

    for (const file of ["ci.yml", "agent-review-request.yml"]) {
      const caller = (await read(file)) as {
        jobs?: Record<string, { uses?: string; with?: Record<string, unknown> }>;
      };
      const job = Object.values(caller.jobs ?? {}).find((candidate) =>
        candidate.uses?.includes("agent-review.yml"),
      );
      expect(job?.with?.enabled, file).toBe(false);
    }
  });

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

describe("ios-nightly-build.yml", () => {
  type NightlyIosBuild = {
    on?: {
      workflow_call?: {
        inputs?: Record<string, { type?: string; default?: unknown; required?: boolean }>;
        outputs?: Record<string, { description?: string; value?: string }>;
        secrets?: Record<string, unknown>;
      };
    };
    permissions?: Record<string, string>;
    jobs?: Record<
      string,
      {
        uses?: string;
        needs?: string | string[];
        if?: string;
        environment?: string;
        outputs?: Record<string, string>;
        with?: Record<string, unknown>;
        env?: Record<string, string>;
        steps?: Array<{
          name?: string;
          id?: string;
          uses?: string;
          with?: Record<string, unknown>;
          env?: Record<string, string>;
          run?: string;
        }>;
      }
    >;
  };

  it("keeps the release cursor read-only and caller-owned", async () => {
    const wf = (await read("ios-nightly-build.yml")) as NightlyIosBuild;
    const call = wf.on?.workflow_call;

    expect(call).toBeDefined();
    expect(call?.secrets).toBeUndefined();
    expect(call?.inputs?.["workflow-file"]?.required).toBe(true);
    expect(call?.inputs?.["watch-paths"]?.required).toBe(true);
    expect(call?.inputs?.["force-build"]?.default).toBe(false);
    expect(call?.inputs?.["app-store-connect-app-id"]?.required).toBe(true);
    expect(call?.inputs?.["testflight-beta-group-ids"]?.required).toBe(true);
    expect(call?.inputs?.environment?.default).toBe("testflight-internal");
    expect(call?.inputs?.runner?.default).toBe("macos-26-xlarge");
    expect(call?.inputs?.["parallel-testing"]?.default).toBe(true);
    expect(call?.inputs?.["maximum-parallel-testing-workers"]?.default).toBe(6);
    expect(call?.inputs?.["firebase-emulators"]?.default).toBe(false);
    expect(call?.inputs?.["firebase-cli-version"]?.default).toBe("15.28.1");
    expect(call?.inputs?.["firebase-config"]?.default).toBe("firebase.json");
    expect(call?.inputs?.["firebase-project"]?.default).toBe("demo-ios-ci");
    expect(call?.inputs?.["firebase-only"]?.default).toBe("auth,firestore");
    expect(call?.inputs?.["pre-test-script"]?.default).toBe("");
    expect(call?.inputs?.["run-upload"]?.default).toBe(true);
    expect(call?.outputs?.build?.value).toBe("${{ jobs.changes.outputs.build }}");
    expect(call?.outputs?.sha?.value).toBe("${{ jobs.preflight.outputs.sha }}");
    expect(wf.permissions).toEqual({
      actions: "read",
      contents: "read",
      "pull-requests": "read",
    });
  });

  it("uses a full checkout and the last successful caller run for its diff", async () => {
    const wf = (await read("ios-nightly-build.yml")) as NightlyIosBuild;
    const steps = wf.jobs?.changes?.steps ?? [];
    const checkout = steps.find((step) => step.uses === "actions/checkout@v7");
    const decision = steps.find((step) => step.name === "Compare with the last successful upload");
    const script = String(decision?.run);

    expect(checkout?.with).toEqual({ "fetch-depth": 0, "persist-credentials": false });
    expect(decision?.env?.GH_TOKEN).toBe("${{ github.token }}");
    expect(script).toContain("/actions/workflows/${WORKFLOW_FILE}/runs?branch=main&status=success");
    expect(script).toContain('git diff --quiet "$baseline" "$CURRENT_SHA" -- "${paths[@]}"');
    expect(script).toContain("building conservatively");
  });

  it("skips an unchanged app and builds after a watched-path change", async () => {
    const root = await mkdtemp(join(tmpdir(), "morpheus-nightly-ios-"));
    const repo = join(root, "repo");
    const bin = join(root, "bin");
    const output = join(root, "output");
    const summary = join(root, "summary");

    try {
      await mkdir(join(repo, "apps/ios"), { recursive: true });
      await mkdir(join(repo, "docs"), { recursive: true });
      await mkdir(bin, { recursive: true });
      await execFileAsync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: repo });
      await execFileAsync("git", ["config", "user.name", "Morpheus Test"], { cwd: repo });
      await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: repo });
      await writeFile(join(repo, "apps/ios/app.txt"), "one\n", "utf8");
      await writeFile(join(repo, "docs/readme.md"), "one\n", "utf8");
      await execFileAsync("git", ["add", "."], { cwd: repo });
      await execFileAsync("git", ["commit", "--quiet", "-m", "baseline"], { cwd: repo });
      const baseline = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo })).stdout.trim();

      await writeFile(join(repo, "docs/readme.md"), "two\n", "utf8");
      await execFileAsync("git", ["add", "."], { cwd: repo });
      await execFileAsync("git", ["commit", "--quiet", "-m", "docs"], { cwd: repo });

      const fakeGh = join(bin, "gh");
      await writeFile(fakeGh, "#!/usr/bin/env bash\nprintf '%s\\n' \"$BASELINE_SHA\"\n", "utf8");
      await chmod(fakeGh, 0o755);

      const wf = (await read("ios-nightly-build.yml")) as NightlyIosBuild;
      const script = wf.jobs?.changes?.steps?.find(
        (step) => step.name === "Compare with the last successful upload",
      )?.run;
      expect(script).toBeTruthy();

      const run = async () => {
        const current = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo })).stdout.trim();
        await writeFile(output, "", "utf8");
        await writeFile(summary, "", "utf8");
        await execFileAsync("bash", ["-c", script!], {
          cwd: repo,
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            BASELINE_SHA: baseline,
            CURRENT_SHA: current,
            FORCE_BUILD: "false",
            GH_TOKEN: "fixture",
            GITHUB_OUTPUT: output,
            GITHUB_REPOSITORY: "cpheinrich/example",
            GITHUB_STEP_SUMMARY: summary,
            WATCH_PATHS: "apps/ios\npackages/shared",
            WORKFLOW_FILE: "testflight.yml",
          },
        });
        return readFile(output, "utf8");
      };

      expect(await run()).toContain("build=false");

      await writeFile(join(repo, "apps/ios/app.txt"), "two\n", "utf8");
      await execFileAsync("git", ["add", "."], { cwd: repo });
      await execFileAsync("git", ["commit", "--quiet", "-m", "ios"], { cwd: repo });
      expect(await run()).toContain("build=true");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("gates signed upload on exact-main preflight and independent tests", async () => {
    const wf = (await read("ios-nightly-build.yml")) as NightlyIosBuild;
    const preflight = wf.jobs?.preflight;
    const test = wf.jobs?.test;
    const upload = wf.jobs?.upload;
    const steps = upload?.steps ?? [];
    const checkout = steps.find((step) => step.name === "Check out verified main commit");
    const validate = steps.find(
      (step) => step.name === "Validate release inputs and select Xcode",
    );
    const release = steps.find((step) => step.name === "Archive, sign, and upload to TestFlight");

    expect(preflight?.uses).toBe(
      "cpheinrich/morpheus/.github/workflows/release-preflight.yml@main",
    );
    expect(test?.uses).toBe("cpheinrich/morpheus/.github/workflows/ios-ci.yml@main");
    expect(test?.with?.["run-tests"]).toBe(true);
    expect(test?.with?.["parallel-testing"]).toBe("${{ inputs.parallel-testing }}");
    expect(test?.with?.["maximum-parallel-testing-workers"]).toBe(
      "${{ inputs.parallel-testing && inputs.maximum-parallel-testing-workers || 0 }}",
    );
    expect(test?.with?.["firebase-emulators"]).toBe("${{ inputs.firebase-emulators }}");
    expect(test?.with?.["firebase-cli-version"]).toBe("${{ inputs.firebase-cli-version }}");
    expect(test?.with?.["firebase-config"]).toBe("${{ inputs.firebase-config }}");
    expect(test?.with?.["firebase-project"]).toBe("${{ inputs.firebase-project }}");
    expect(test?.with?.["firebase-only"]).toBe("${{ inputs.firebase-only }}");
    expect(test?.with?.["pre-test-script"]).toBe("${{ inputs.pre-test-script }}");
    expect(upload?.needs).toEqual(["changes", "preflight", "test"]);
    expect(upload?.if).toContain("inputs.run-upload");
    expect(upload?.environment).toBe("${{ inputs.environment }}");
    expect(checkout?.with?.ref).toBe("${{ needs.preflight.outputs.sha }}");
    expect(upload?.env?.BUILD_NUMBER).toBeUndefined();
    expect(upload?.env?.ASC_APP_ID).toBe("${{ inputs.app-store-connect-app-id }}");
    expect(upload?.env?.TESTFLIGHT_BETA_GROUP_IDS).toBe(
      "${{ inputs.testflight-beta-group-ids }}",
    );
    expect(upload?.env?.SOURCE_PACKAGES_PATH).toBeUndefined();
    expect(validate?.run).toContain(
      'echo "SOURCE_PACKAGES_PATH=$RUNNER_TEMP/$SOURCE_PACKAGES_DIRECTORY" >> "$GITHUB_ENV"',
    );
    expect(release?.env?.ASC_API_KEY_ID).toBe("${{ secrets.APP_STORE_CONNECT_KEY_ID }}");
    expect(release?.env?.IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64).toBe(
      "${{ secrets.IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64 }}",
    );
    expect(release?.run).toBe('"$GITHUB_WORKSPACE/$UPLOAD_SCRIPT"');
    expect(steps.indexOf(release!)).toBeGreaterThan(
      steps.findIndex((step) => step.name === "Install release tooling"),
    );
    expect(
      steps.find((step) => step.name === "Install release tooling")?.run,
    ).toContain("brew install openssl@3 asccli");

    for (const step of steps) {
      expect(step.run ?? "").not.toContain("${{ inputs.upload-script }}");
    }
  });
});

/**
 * `ios-testflight-upload` is a composite action rather than a reusable
 * workflow, and the distinction is the whole design. GitHub gives a
 * cross-repository reusable workflow none of the caller's environment secrets:
 * a job there reads every one as an empty string, with no error. An action runs
 * inside the caller's own job, where `secrets.*` resolve, so the credentials
 * can be handed in as inputs.
 *
 * Everything asserted here has already cost a release. The archive must stay
 * unsigned — `-allowProvisioningUpdates` minted a permanent Apple Development
 * certificate on every run until the shared team hit its account limit and
 * archiving stopped for two projects at once. The distribution checks must run
 * on the exported IPA, because the archive deliberately has no signature to
 * check. And the artifact that is verified must be the artifact that is
 * uploaded.
 */
describe("ios-testflight-upload action", () => {
  const ACTION_DIR = join(import.meta.dirname, "../.github/actions/ios-testflight-upload");

  type CompositeAction = {
    name?: string;
    description?: string;
    inputs?: Record<string, { description?: string; required?: boolean; default?: unknown }>;
    runs?: {
      using?: string;
      steps?: Array<{
        name?: string;
        uses?: string;
        shell?: string;
        with?: Record<string, unknown>;
        env?: Record<string, string>;
        run?: string;
      }>;
    };
  };

  const action = async (): Promise<CompositeAction> =>
    load(await readFile(join(ACTION_DIR, "action.yml"), "utf8")) as CompositeAction;
  const script = async (): Promise<string> =>
    readFile(join(ACTION_DIR, "upload-testflight.sh"), "utf8");

  it("is a composite action taking every credential as an input", async () => {
    const wf = await action();

    expect(wf.runs?.using).toBe("composite");
    for (const required of [
      "project",
      "scheme",
      "apple-team-id",
      "ios-bundle-id",
      "app-store-connect-app-id",
      "testflight-beta-group-ids",
      "asc-api-key-id",
      "asc-api-key-issuer-id",
      "asc-api-key-p8-base64",
      "ios-distribution-p12-base64",
      "ios-distribution-p12-password",
      "ios-distribution-profile-base64",
    ]) {
      expect(wf.inputs?.[required]?.required, `${required} is required`).toBe(true);
    }
    // Optional by default, so a project with no Firebase plist, no Sentry and
    // no extra assertions passes none of them.
    for (const optional of [
      "archive-build-settings",
      "google-service-info-plist-path",
      "google-service-info-plist-base64",
      "validate-app-script",
      "sentry-auth-token",
    ]) {
      expect(wf.inputs?.[optional]?.default, `${optional} defaults to empty`).toBe("");
    }
    expect(wf.inputs?.["beta-group-policy"]?.default).toBe("any");
    expect(wf.inputs?.["xcode-version"]?.default).toBe("26.6");
    expect(wf.inputs?.["source-packages-directory"]?.default).toBe("TestFlightSourcePackages");
  });

  it("hands the caller's inputs to the script through the environment", async () => {
    const steps = (await action()).runs?.steps ?? [];
    const release = steps.find(
      (step) => step.name === "Archive, sign, verify, and upload to TestFlight",
    );

    expect(release?.run).toBe('"$GITHUB_ACTION_PATH/upload-testflight.sh"');
    expect(release?.env?.ASC_API_KEY_ID).toBe("${{ inputs.asc-api-key-id }}");
    expect(release?.env?.IOS_DISTRIBUTION_P12_PASSWORD).toBe(
      "${{ inputs.ios-distribution-p12-password }}",
    );
    expect(release?.env?.ARCHIVE_BUILD_SETTINGS).toBe("${{ inputs.archive-build-settings }}");
    expect(release?.env?.VALIDATE_APP_SCRIPT).toBe("${{ inputs.validate-app-script }}");
    // The credentials are the last thing to enter a process, after the
    // toolchain and the project layout have been proven good.
    expect(steps.indexOf(release!)).toBe(steps.length - 1);
    expect(steps.findIndex((step) => step.name === "Install release tooling")).toBeLessThan(
      steps.length - 1,
    );

    // No caller value is ever spliced into a shell; every step reads env.
    for (const step of steps) {
      expect(step.run ?? "").not.toContain("${{ inputs.");
    }
  });

  it("selects an exact Xcode and caches SwiftPM, so the caller does neither", async () => {
    const steps = (await action()).runs?.steps ?? [];
    const validate = steps.find((step) => step.name === "Validate release inputs and select Xcode");
    const cache = steps.find((step) => step.uses?.startsWith("actions/cache@"));
    const tooling = steps.find((step) => step.name === "Install release tooling");

    expect(validate?.run).toContain('xcode_app="/Applications/Xcode_${XCODE_VERSION}.app"');
    expect(validate?.run).toContain('echo "DEVELOPER_DIR=$xcode_app/Contents/Developer"');
    expect(validate?.run).toContain("-downloadComponent MetalToolchain");
    expect(cache?.with?.path).toBe("${{ runner.temp }}/${{ inputs.source-packages-directory }}");
    expect(tooling?.run).toContain("brew install openssl@3 asccli");
    expect(tooling?.run).toContain("brew install getsentry/tools/sentry-cli");
  });

  it("archives unsigned, and can never mint an Apple certificate", async () => {
    const raw = await script();
    // The comments name the flags they explain, so an assertion about what the
    // script no longer *does* has to read past them.
    const executable = raw.replace(/^[ \t]*#.*$/gm, "");
    const archive = raw.slice(
      raw.indexOf("xcodebuild archive \\"),
      raw.indexOf("ARCHIVED_APPLICATIONS_PATH="),
    );

    expect(archive).toContain('CODE_SIGN_IDENTITY=""');
    expect(archive).toContain("CODE_SIGNING_REQUIRED=NO");
    expect(archive).toContain("CODE_SIGNING_ALLOWED=NO");
    expect(archive).not.toContain("CODE_SIGN_STYLE=");
    expect(archive).not.toContain("-authenticationKey");
    expect(executable).not.toContain("-allowProvisioningUpdates");
    expect(executable).not.toContain("PROVISIONING_PROFILE_SPECIFIER=");
  });

  it("verifies the exported IPA and uploads that same file", async () => {
    const raw = await script();
    const exportOptions = raw.slice(
      raw.indexOf("plutil -create xml1"),
      raw.indexOf("xcodebuild archive \\"),
    );

    expect(exportOptions).toContain("plutil -insert destination -string export");
    expect(exportOptions).toContain("plutil -insert signingStyle -string manual");
    expect(exportOptions).toContain("testFlightInternalTestingOnly -bool false");
    expect(exportOptions).toContain("manageAppVersionAndBuildNumber -bool false");

    // Verification happens on the exported app; the upload sends the exported
    // IPA it came out of. A release that validated one artifact and shipped
    // another is the failure this ordering exists to prevent.
    expect(raw.indexOf("codesign --verify --strict")).toBeGreaterThan(
      raw.indexOf('IPA_PATH="${exported_ipas[0]}"'),
    );
    expect(raw.indexOf("run_asccli builds upload")).toBeGreaterThan(
      raw.indexOf("codesign --verify --strict"),
    );
    expect(raw).toContain('--file "$IPA_PATH"');
    expect(raw).toContain("builds next-number");
    expect(raw).toContain("builds add-beta-group");
    expect(raw).toContain("processingState");
  });

  it("keeps get-task-allow strict and reads dotted entitlement keys as one key", async () => {
    const raw = await script();

    // plutil treats `.` as a key-path separator, so the unescaped form asks for
    // four nested keys that do not exist and quietly returns nothing.
    expect(raw).toContain("plutil -extract 'com\\.apple\\.developer\\.team-identifier' raw");
    expect(raw).toContain('[[ "$exported_get_task_allow" == true ]]');
    expect(raw).toContain("get-task-allow:         '$exported_get_task_allow'");
  });

  it("keeps the runner's keychain, secrets, and temporary files contained", async () => {
    const raw = await script();

    expect(raw).toContain("umask 077");
    expect(raw).toContain("trap cleanup EXIT INT TERM");
    expect(raw).toContain("security default-keychain -d user -s \"$ORIGINAL_DEFAULT_KEYCHAIN\"");
    expect(raw).toContain('security list-keychains -d user -s "${original_keychains[@]}"');
    expect(raw).toContain("security delete-keychain");
    expect(raw).toContain("unset ASC_API_KEY_P8_BASE64 IOS_DISTRIBUTION_P12_BASE64");
    expect(raw).toContain("unset IOS_DISTRIBUTION_P12_PASSWORD");
    expect(raw).toContain("unset SIGNING_KEYCHAIN_PASSWORD");
    expect(raw).toContain('chmod 600 "$AUTHENTICATION_KEY_PATH"');
    expect(raw).toContain("Refusing to upload a TestFlight build outside main.");
    expect(raw).toContain(
      "Expected exactly one valid distribution signing identity in the release keychain.",
    );
    // The caller's own assertions see the app, and none of the credentials.
    expect(raw).toContain('run_without_release_secrets "$VALIDATE_APP_SCRIPT_PATH"');
  });

  it("rejects the caller-configuration mistakes before it spends a runner", async () => {
    const raw = await script();
    const root = await mkdtemp(join(tmpdir(), "morpheus-testflight-action-"));

    try {
      const workspace = join(root, "workspace");
      await mkdir(workspace, { recursive: true });
      const runner = join(root, "runner-temp");
      await mkdir(runner, { recursive: true });

      const base = {
        GITHUB_REF: "refs/heads/main",
        GITHUB_WORKSPACE: workspace,
        RUNNER_TEMP: runner,
        PROJECT_PATH: join(workspace, "App.xcodeproj"),
        SCHEME_NAME: "App",
        APPLE_TEAM_ID: "D495224G8R",
        IOS_BUNDLE_ID: "com.example.app",
        ASC_APP_ID: "6804832724",
        TESTFLIGHT_BETA_GROUP_IDS: "12de872e-297c-4a19-befc-03fa6d6eb87f",
        ASC_API_KEY_ID: "key",
        ASC_API_KEY_ISSUER_ID: "issuer",
        ASC_API_KEY_P8_BASE64: "cGxhY2Vob2xkZXI=",
        IOS_DISTRIBUTION_P12_BASE64: "cGxhY2Vob2xkZXI=",
        IOS_DISTRIBUTION_P12_PASSWORD: "placeholder",
        IOS_DISTRIBUTION_PROFILE_BASE64: "cGxhY2Vob2xkZXI=",
        OPENSSL_BINARY: "/bin/echo",
      };

      const run = async (overrides: Record<string, string>) => {
        try {
          await execFileAsync("bash", ["-c", raw], {
            cwd: workspace,
            env: { PATH: process.env.PATH ?? "", ...base, ...overrides },
          });
          return "";
        } catch (error) {
          return String((error as { stderr?: string }).stderr ?? error);
        }
      };

      expect(await run({ GITHUB_REF: "refs/heads/feature" })).toContain(
        "Refusing to upload a TestFlight build outside main",
      );
      expect(await run({ IOS_BUNDLE_ID: "" })).toContain(
        "Missing required release variable: IOS_BUNDLE_ID",
      );
      expect(await run({ TESTFLIGHT_BETA_GROUP_IDS: "not-a-uuid" })).toContain(
        "Invalid TestFlight beta-group id",
      );
      expect(
        await run({
          BETA_GROUP_POLICY: "one-internal-one-external",
          TESTFLIGHT_BETA_GROUP_IDS: "12de872e-297c-4a19-befc-03fa6d6eb87f",
        }),
      ).toContain("requires two distinct TestFlight beta-group ids");
      expect(await run({ BETA_GROUP_POLICY: "whatever" })).toContain(
        "beta-group-policy must be",
      );
      expect(await run({ ARCHIVE_BUILD_SETTINGS: "not a setting" })).toContain(
        "archive-build-settings entries must be KEY=VALUE",
      );
      expect(await run({ VALIDATE_APP_SCRIPT: "../escape.sh" })).toContain(
        "must be a repository-relative path without '..'",
      );
      expect(await run({ VALIDATE_APP_SCRIPT: "qa/missing.sh" })).toContain(
        "validate-app-script is missing or not executable",
      );
      expect(await run({ GOOGLE_SERVICE_PLIST_PATH: "apps/ios/App/GoogleService-Info.plist" })).toContain(
        "its base64 configuration is empty",
      );

      // An empty build-setting value is legitimate, and a fully valid
      // configuration gets all the way to looking for the Xcode project.
      expect(await run({ ARCHIVE_BUILD_SETTINGS: "APP_ENVIRONMENT=staging\nAPI_BASE_URL=" })).toContain(
        "Xcode project not found",
      );
      expect(await run({})).toContain("Xcode project not found");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

/**
 * `ios-ci.yml` is the native Apple equivalent of node-ci and python-ci. The
 * lock and simulator defaults are part of its public caller contract: if
 * package resolution mutates the lock, or the destination names a runtime the
 * runner does not carry, every delegated repository fails despite changing
 * nothing itself.
 */
describe("ios-ci.yml", () => {
  type IosCi = {
    on?: {
      workflow_call?: {
        inputs?: Record<string, { type?: string; default?: unknown }>;
        secrets?: Record<string, unknown>;
      };
    };
    permissions?: Record<string, string>;
    jobs?: Record<string, {
      "runs-on"?: string;
      "timeout-minutes"?: number | string;
      concurrency?: { group?: string; "cancel-in-progress"?: boolean };
      env?: Record<string, string>;
      steps?: Array<Record<string, unknown>>;
    }>;
  };

  it("is a secret-free reusable workflow with read-only source access", async () => {
    const wf = (await read("ios-ci.yml")) as IosCi;
    expect(wf.on).toHaveProperty("workflow_call");
    expect(wf.on?.workflow_call?.secrets).toBeUndefined();
    expect(wf.permissions).toEqual({ contents: "read" });
  });

  it("pins the current iOS 26 runner, Xcode, and simulator contract", async () => {
    const wf = (await read("ios-ci.yml")) as IosCi;
    const inputs = wf.on?.workflow_call?.inputs ?? {};
    expect(inputs.runner?.default).toBe("macos-26");
    expect(inputs["timeout-minutes"]?.default).toBe(30);
    expect(inputs["xcode-version"]?.default).toBe("26.6");
    expect(inputs.platform?.default).toBe("iOS Simulator");
    expect(inputs.destination?.default).toBe("OS=26.5,name=iPhone 17 Pro Max");
    expect(inputs["working-directory"]?.default).toBe("apps/ios");
    expect(inputs.project?.default).toBe("Evo.xcodeproj");
    expect(inputs.scheme?.default).toBe("Evo");
    expect(inputs["parallel-testing"]?.default).toBe(false);
    expect(inputs["maximum-parallel-testing-workers"]?.default).toBe(0);
    expect(inputs["firebase-emulators"]?.default).toBe(false);
    expect(inputs["pre-test-script"]?.default).toBe("");
    expect(inputs["swift-format-lint"]?.default).toBe(false);
    expect(inputs["swift-format-configuration"]?.default).toBe(".swift-format");
  });

  it("can enforce the selected Xcode toolchain's formatter on changed Swift sources", async () => {
    const wf = (await read("ios-ci.yml")) as IosCi;
    const steps = wf.jobs?.test?.steps ?? [];
    const checkout = steps.find((step) => step.uses === "actions/checkout@v7");
    const lint = steps.find((step) => step.name === "Lint changed Swift sources");
    const script = String(lint?.run);

    expect((checkout?.with as Record<string, unknown>)?.["fetch-depth"]).toBe(2);
    expect(lint?.if).toBe("${{ inputs.swift-format-lint }}");
    expect(lint?.env).toMatchObject({
      SWIFT_FORMAT_CONFIGURATION: "${{ inputs.swift-format-configuration }}",
      WORKING_DIRECTORY: "${{ inputs.working-directory }}",
    });
    expect(script).toContain("xcrun swift-format --version");
    expect(script).toContain("swift-format dump-configuration");
    expect(script).toContain("--effective");
    expect(script).toContain("git diff-tree");
    expect(script).toContain("--diff-filter=ACMR");
    expect(script).toContain("swift-format lint");
    expect(script).toContain("--parallel");
    expect(script).toContain("--strict");
    expect(script).not.toContain("brew install");
  });

  it("strictly lints added and modified Swift files without sweeping legacy source", async () => {
    const root = await mkdtemp(join(tmpdir(), "morpheus-swift-format-"));
    const repo = join(root, "repo");
    const bin = join(root, "bin");
    const log = join(root, "xcrun.log");

    try {
      await mkdir(join(repo, "apps/ios"), { recursive: true });
      await mkdir(bin, { recursive: true });
      await execFileAsync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: repo });
      await execFileAsync("git", ["config", "user.name", "Morpheus Test"], { cwd: repo });
      await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: repo });
      await writeFile(join(repo, "apps/ios/.swift-format"), '{"version":1}\n', "utf8");
      await writeFile(join(repo, "apps/ios/Changed.swift"), "let changed = 1\n", "utf8");
      await writeFile(join(repo, "apps/ios/Legacy.swift"), "let legacy = 1\n", "utf8");
      await writeFile(join(repo, "apps/ios/Removed.swift"), "let removed = 1\n", "utf8");
      await execFileAsync("git", ["add", "."], { cwd: repo });
      await execFileAsync("git", ["commit", "--quiet", "-m", "baseline"], { cwd: repo });

      await writeFile(join(repo, "apps/ios/Changed.swift"), "let changed = 2\n", "utf8");
      await writeFile(join(repo, "apps/ios/Added.swift"), "let added = 1\n", "utf8");
      await rm(join(repo, "apps/ios/Removed.swift"));
      await execFileAsync("git", ["add", "."], { cwd: repo });
      await execFileAsync("git", ["commit", "--quiet", "-m", "change Swift"], { cwd: repo });

      const fakeXcrun = join(bin, "xcrun");
      await writeFile(fakeXcrun, '#!/bin/bash\nprintf "%s\\n" "$*" >> "$XCRUN_LOG"\n', "utf8");
      await chmod(fakeXcrun, 0o755);

      const steps = ((await read("ios-ci.yml")) as IosCi).jobs?.test?.steps ?? [];
      const script = steps.find((step) => step.name === "Lint changed Swift sources")?.run;
      expect(script).toBeTruthy();
      await execFileAsync("bash", ["-c", String(script)], {
        cwd: join(repo, "apps/ios"),
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          GITHUB_WORKSPACE: repo,
          SWIFT_FORMAT_CONFIGURATION: ".swift-format",
          WORKING_DIRECTORY: "apps/ios",
          XCRUN_LOG: log,
        },
      });

      const invocations = await readFile(log, "utf8");
      const lint = invocations.split("\n").find((line) => line.startsWith("swift-format lint"));
      expect(lint).toContain("apps/ios/Added.swift");
      expect(lint).toContain("apps/ios/Changed.swift");
      expect(lint).not.toContain("apps/ios/Legacy.swift");
      expect(lint).not.toContain("apps/ios/Removed.swift");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("bounds and cancels superseded simulator runs", async () => {
    const job = ((await read("ios-ci.yml")) as IosCi).jobs?.test;
    expect(job?.["timeout-minutes"]).toBe("${{ inputs.timeout-minutes }}");
    expect(job?.concurrency?.["cancel-in-progress"]).toBe(true);
    expect(job?.concurrency?.group).toContain("${{ github.repository }}");
    // A release workflow calls this same job on refs/heads/main, where a
    // push-to-main CI run is already using it. Without the caller in the
    // group the two cancel each other.
    expect(job?.concurrency?.group).toContain("${{ github.workflow }}");
    expect(job?.concurrency?.group).toContain("${{ github.ref }}");
    expect(job?.concurrency?.group).toContain("${{ inputs.scheme }}");
  });

  it("skips compiler work no runner ever reads and restores a partial package cache", async () => {
    const steps = ((await read("ios-ci.yml")) as IosCi).jobs?.test?.steps ?? [];
    const buildForTesting = steps.find((step) => step.name === "Build for testing");
    const build = steps.find((step) => step.name === "Build");
    const test = steps.find((step) => step.name === "Run unit and UI tests");
    const cache = steps.find((step) => step.name === "Cache resolved Swift packages");

    // Index-while-building serves Xcode's editor; a runner has none and
    // discards the store with the machine.
    expect(String(buildForTesting?.run)).toContain("COMPILER_INDEX_STORE_ENABLE=NO");
    expect(String(build?.run)).toContain("COMPILER_INDEX_STORE_ENABLE=NO");
    // test-without-building compiles nothing, and its arguments are re-quoted
    // into the emulator exec string, so a build-setting override is noise there.
    expect(String(test?.run)).not.toContain("COMPILER_INDEX_STORE_ENABLE");

    // Without a prefix restore, bumping one dependency re-clones every package.
    expect(String((cache?.with as Record<string, unknown>)?.["restore-keys"])).toContain(
      "swiftpm-${{ runner.os }}-xcode-${{ inputs.xcode-version }}-",
    );
  });

  it("optimizes the test build only when the caller opts in, and never for local Xcode debugging", async () => {
    const wf = (await read("ios-ci.yml")) as IosCi;
    const inputs = wf.on?.workflow_call?.inputs ?? {};
    // Off by default: an existing caller's build is unchanged until it asks.
    expect(inputs["optimize-test-build"]?.default).toBe(false);

    const steps = wf.jobs?.test?.steps ?? [];
    const buildForTesting = steps.find((step) => step.name === "Build for testing");
    const build = steps.find((step) => step.name === "Build");
    const test = steps.find((step) => step.name === "Run unit and UI tests");

    // A command-line xcodebuild override reaches only this CI invocation — a
    // developer's own Debug build in Xcode never passes these, so -Onone
    // stays intact for local breakpoint debugging regardless of this input.
    for (const step of [buildForTesting, build]) {
      expect(String(step?.run)).toContain("SWIFT_OPTIMIZATION_LEVEL=-O");
      expect(String(step?.run)).toContain("SWIFT_COMPILATION_MODE=wholemodule");
      expect(String(step?.run)).toContain("GCC_OPTIMIZATION_LEVEL=s");
      expect(String((step?.env as Record<string, unknown> | undefined)?.OPTIMIZE_TEST_BUILD)).toBe(
        "${{ inputs.optimize-test-build }}",
      );
    }
    // test-without-building compiles nothing, so an optimization override is noise there.
    expect(String(test?.run)).not.toContain("SWIFT_OPTIMIZATION_LEVEL");
  });

  it("can exclude specific tests from a run without affecting the build", async () => {
    const wf = (await read("ios-ci.yml")) as IosCi;
    const inputs = wf.on?.workflow_call?.inputs ?? {};
    // Empty by default: an existing caller's test selection is unchanged.
    expect(inputs["skip-testing"]?.default).toBe("");

    const steps = wf.jobs?.test?.steps ?? [];
    const buildForTesting = steps.find((step) => step.name === "Build for testing");
    const test = steps.find((step) => step.name === "Run unit and UI tests");

    // build-for-testing compiles the whole scheme regardless of which subset
    // will execute — only the run step needs to know what to exclude.
    expect(String(buildForTesting?.run)).not.toContain("SKIP_TESTING");
    expect(String(test?.env && (test.env as Record<string, unknown>).SKIP_TESTING)).toBe(
      "${{ inputs.skip-testing }}",
    );
    expect(String(test?.run)).toContain("-skip-testing:");
    expect(String(test?.run)).toContain('while IFS= read -r identifier');
  });

  it("does not expose the checkout credential to caller-controlled test code", async () => {
    const steps = ((await read("ios-ci.yml")) as IosCi).jobs?.test?.steps ?? [];
    const checkout = steps.find((step) => step.uses === "actions/checkout@v7");

    expect((checkout?.with as Record<string, unknown>)?.["persist-credentials"]).toBe(false);
  });

  it("requires a committed SwiftPM lock and forbids package updates", async () => {
    const wf = (await read("ios-ci.yml")) as IosCi;
    const steps = wf.jobs?.test?.steps ?? [];
    const validate = steps.find((step) => step.name === "Validate locked project inputs");
    const resolve = steps.find((step) => step.name === "Resolve locked Swift packages");

    expect(String(validate?.run)).toContain("Package.resolved is required");
    expect(String(validate?.run)).toContain("git ls-files --error-unmatch");
    expect(String(resolve?.run)).toContain("-onlyUsePackageVersionsFromResolvedFile");
    expect(String(resolve?.run)).toContain("-resolvePackageDependencies");
  });

  it("keeps packages, build products, results, and logs in isolated paths", async () => {
    const job = ((await read("ios-ci.yml")) as IosCi).jobs?.test;
    const prepare = job?.steps?.find((step) => step.name === "Prepare isolated build directories");
    expect(String(prepare?.run)).toContain('$RUNNER_TEMP/ios-ci');
    expect(String(prepare?.run)).toContain('SOURCE_PACKAGES=$ios_ci_root/SourcePackages');
    expect(String(prepare?.run)).toContain('DERIVED_DATA=$ios_ci_root/DerivedData');
    expect(String(prepare?.run)).toContain('RESULTS=$ios_ci_root/Results');
    expect(String(prepare?.run)).toContain('LOGS=$ios_ci_root/Logs');
    expect(String(prepare?.run)).toContain('SCREENSHOTS=$ios_ci_root/Screenshots');

    const raw = await readFile(join(DIR, "ios-ci.yml"), "utf8");
    expect(raw).toContain("${{ runner.temp }}/ios-ci/SourcePackages");
    expect(raw).toContain("hashFiles(format('{0}/**/Package.resolved'");
    expect(raw).toContain('"$RESULTS/Build.xcresult"');
    expect(raw).toContain('"$RESULTS/Tests.xcresult"');
  });

  it("builds once, then runs the scheme's unit and UI tests without rebuilding", async () => {
    const steps = ((await read("ios-ci.yml")) as IosCi).jobs?.test?.steps ?? [];
    const build = steps.find((step) => step.name === "Build for testing");
    const test = steps.find((step) => step.name === "Run unit and UI tests");
    expect(String(build?.run)).toContain("xcodebuild build-for-testing");
    expect(String(test?.run)).toContain("xcodebuild test-without-building");
    expect(String(build?.run)).toContain("-disableAutomaticPackageResolution");
    expect(String(test?.run)).toContain("-disableAutomaticPackageResolution");
    expect(String(test?.run)).toContain('-parallel-testing-enabled "$PARALLEL_TESTING"');
    expect(String(test?.run)).toContain(
      '-maximum-parallel-testing-workers "$MAXIMUM_PARALLEL_TESTING_WORKERS"',
    );
    expect(build?.if).toBe("${{ inputs.run-tests }}");
    expect(test?.if).toBe("${{ inputs.run-tests }}");
  });

  it("can run app tests inside locked Firebase emulators with an in-context fixture", async () => {
    const wf = (await read("ios-ci.yml")) as IosCi;
    const inputs = wf.on?.workflow_call?.inputs ?? {};
    const steps = wf.jobs?.test?.steps ?? [];
    const java = steps.find((step) => step.name === "Use Java 21 for Firebase emulators");
    const install = steps.find((step) => step.name === "Install the locked Firebase emulator CLI");
    const test = steps.find((step) => step.name === "Run unit and UI tests");

    expect(inputs["firebase-cli-version"]?.default).toBe("15.28.1");
    expect(inputs["firebase-config"]?.default).toBe("firebase.json");
    expect(inputs["firebase-only"]?.default).toBe("auth,firestore");
    expect(String(java?.if)).toContain("inputs.firebase-emulators");
    expect(String(install?.run)).toContain('firebase-tools@$FIREBASE_CLI_VERSION');
    expect(String(test?.run)).toContain("firebase emulators:exec");
    expect(String(test?.run)).toContain('test_command="$pre_test_command && $test_command"');
    expect(String(test?.run)).toContain('--config "$GITHUB_WORKSPACE/$FIREBASE_CONFIG"');

    const diagnostics = steps.find(
      (step) => step.name === "Collect Firebase emulator diagnostics",
    );
    expect(String(diagnostics?.if)).toContain("inputs.firebase-emulators");
    expect(String(diagnostics?.run)).toContain("firebase-debug.log");
  });

  it("preserves rendered test attachments independently of test success", async () => {
    const steps = ((await read("ios-ci.yml")) as IosCi).jobs?.test?.steps ?? [];
    const exportStep = steps.find((step) => step.name === "Export rendered test attachments");
    const upload = steps.find((step) => step.name === "Upload rendered test attachments");

    expect(String(exportStep?.if)).toContain("always()");
    expect(String(exportStep?.run)).toContain("xcresulttool export attachments");
    expect(String(upload?.if)).toContain("always()");
    expect(String(upload?.uses)).toContain("actions/upload-artifact@v7");
    expect(String((upload?.with as Record<string, unknown>)?.path)).toContain(
      "${{ runner.temp }}/ios-ci/Screenshots",
    );
  });

  it("uploads both xcresults and raw logs only when the run fails", async () => {
    const steps = ((await read("ios-ci.yml")) as IosCi).jobs?.test?.steps ?? [];
    const upload = steps.find((step) => step.name === "Upload Xcode failure evidence");
    expect(upload?.if).toBe("failure()");
    expect(String(upload?.uses)).toContain("actions/upload-artifact@v7");
    const withBlock = upload?.with as Record<string, unknown> | undefined;
    expect(String(withBlock?.path)).toContain("${{ runner.temp }}/ios-ci/Results");
    expect(String(withBlock?.path)).toContain("${{ runner.temp }}/ios-ci/Logs");
  });

  it("passes caller-controlled values through env rather than script substitution", async () => {
    const steps = ((await read("ios-ci.yml")) as IosCi).jobs?.test?.steps ?? [];
    for (const step of steps) {
      if (typeof step.run !== "string") continue;
      expect(step.run, String(step.name)).not.toContain("${{ inputs.");
    }
  });

  it("selects the hosted Xcode directly instead of adding a third-party action", async () => {
    const raw = await readFile(join(DIR, "ios-ci.yml"), "utf8");
    expect(raw).toContain('/Applications/Xcode_${XCODE_VERSION}.app');
    expect(raw).not.toContain("setup-xcode@");
  });

  it("uses the current official Node 24 action majors", async () => {
    const steps = ((await read("ios-ci.yml")) as IosCi).jobs?.test?.steps ?? [];
    const actionUses = steps.flatMap((step) =>
      typeof step.uses === "string" ? [step.uses] : [],
    );

    expect(actionUses).toContain("actions/checkout@v7");
    expect(actionUses).toContain("actions/cache@v6");
    expect(actionUses).toContain("actions/setup-java@v6");
    expect(actionUses).toContain("actions/upload-artifact@v7");
  });
});

/**
 * `python-ci.yml` is the Python half of the pair `node-ci.yml` opens. It ships
 * to every project that has a uv surface, so the same rule applies: a mistake
 * here breaks repositories that changed nothing.
 *
 * Coverage is the part worth pinning. A coverage flag that silently measures
 * the wrong thing is worse than no coverage at all — it reports a number
 * somebody will put in a README, and `--cov` with no source measures whatever
 * happens to be imported, dependency tree included.
 */
describe("python-ci", () => {
  interface PythonCi {
    on?: { workflow_call?: { inputs?: Record<string, { default?: unknown; type?: string }> } };
    jobs?: Record<string, {
      strategy?: { "fail-fast"?: boolean; matrix?: Record<string, unknown> };
      steps?: Array<Record<string, unknown>>;
    }>;
  }

  it("refuses to measure coverage without being told what to measure", async () => {
    const wf = (await read("python-ci.yml")) as PythonCi;
    const step = wf.jobs?.check?.steps?.find((s) => s["name"] === "Test with coverage");
    expect(step, "python-ci must have a coverage step").toBeDefined();
    expect(String(step?.["run"])).toContain("coverage-source is required when coverage is enabled");
    // Not `--cov` bare: that measures every imported module, which is a number
    // about the dependency tree rather than about the project.
    expect(String(step?.["run"])).toContain('--cov="$COVERAGE_SOURCE"');
  });

  it("defaults coverage off, and its threshold to reporting rather than gating", async () => {
    const inputs = (await read("python-ci.yml") as PythonCi).on?.workflow_call?.inputs ?? {};
    expect(inputs["coverage"]?.default).toBe(false);
    // A project that has never measured cannot know its floor. Shipping a
    // non-zero default would fail repositories on their first delegation and
    // teach them to lower it, which is how a threshold stops meaning anything.
    expect(inputs["coverage-fail-under"]?.default).toBe(0);
  });

  it("installs from the lockfile rather than resolving afresh", async () => {
    const wf = (await read("python-ci.yml")) as PythonCi;
    const step = wf.jobs?.check?.steps?.find((s) => s["name"] === "Install dependencies");
    expect(String(step?.["run"])).toContain("--locked");
  });

  it("runs the whole interpreter matrix even after one fails", async () => {
    const wf = (await read("python-ci.yml")) as PythonCi;
    // One version failing is a fact worth having about the others; cancelling
    // the siblings turns a two-line answer into a second CI run.
    expect(wf.jobs?.check?.strategy?.["fail-fast"]).toBe(false);
    expect(String(wf.jobs?.check?.strategy?.matrix?.["python-version"]))
      .toContain("fromJSON(inputs.python-versions)");
  });

  it("uploads one coverage report rather than one per interpreter", async () => {
    const wf = (await read("python-ci.yml")) as PythonCi;
    const upload = wf.jobs?.check?.steps?.find((s) =>
      String(s["uses"] ?? "").startsWith("actions/upload-artifact"));
    expect(upload).toBeDefined();
    // Every matrix leg measures the same lines, and identical artifact names
    // across a matrix collide rather than merge.
    expect(String(upload?.["if"])).toContain("fromJSON(inputs.python-versions)[0]");
  });
});

/**
 * A job with no `timeout-minutes` runs a hung step to GitHub's six-hour default
 * on billed minutes. That has already happened here once, to a Playwright
 * install that hung for forty. Every reusable job must bound itself, and every
 * job that gates a pull request must cancel rather than run beside its
 * replacement.
 */
describe("every reusable job", () => {
  type Bounded = {
    jobs?: Record<
      string,
      {
        uses?: string;
        "timeout-minutes"?: number | string;
        concurrency?: { group?: string; "cancel-in-progress"?: boolean };
      }
    >;
  };

  const GATES = ["web-ci.yml", "pm-check.yml", "pr-check.yml", "firebase-tests.yml", "ios-ci.yml"];

  it("bounds its own runtime", async () => {
    for (const file of GATES) {
      const jobs = ((await read(file)) as Bounded).jobs ?? {};
      for (const [name, job] of Object.entries(jobs)) {
        // A job that only delegates inherits the callee's ceiling.
        if (job.uses) continue;
        expect(job["timeout-minutes"], `${file} job ${name} needs a ceiling`).toBeDefined();
      }
    }
  });

  it("cancels a superseded push on the checks that gate a pull request", async () => {
    for (const file of GATES) {
      const jobs = ((await read(file)) as Bounded).jobs ?? {};
      for (const [name, job] of Object.entries(jobs)) {
        if (job.uses) continue;
        expect(job.concurrency?.["cancel-in-progress"], `${file} job ${name}`).toBe(true);
        expect(job.concurrency?.group, `${file} job ${name}`).toContain("${{ github.ref }}");
      }
    }
  });
});
