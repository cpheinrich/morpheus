import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { afterAll, describe, expect, it } from "vitest";

/**
 * `node-ci.yml`'s opt-in `parallel-static-checks` mode, run for real.
 *
 * The step's own script and environment are read from the workflow and executed
 * by bash in a throwaway repository; only `pnpm` and `sudo` are stand-ins. A
 * parsed-YAML assertion alone would pass on a script that ran the checks one
 * after another, or that lost a failure.
 */
type Step = { name?: string; if?: string; run?: string; env?: Record<string, string> };
const root = fileURLToPath(new URL("../", import.meta.url));
const workflow = load(readFileSync(join(root, ".github/workflows/node-ci.yml"), "utf8")) as {
  on: { workflow_call: { inputs: Record<string, { default?: unknown }> } };
  jobs: { check: { steps: Step[] } };
};
const steps = workflow.jobs.check.steps;
const named = (name: string) => steps.find(step => step.name === name)!;
const parallel = named("Typecheck, lint and build concurrently");

const temps: string[] = [];
afterAll(() => temps.forEach(dir => rmSync(dir, { recursive: true, force: true })));

/**
 * Each stand-in check records that it started, then refuses to finish until
 * every check named in RENDEZVOUS has started too. Run one after another, the
 * first would wait out its deadline and fail — so a pass proves they overlapped.
 */
const PNPM = `#!/bin/sh
case "$1" in run) name=build ;; morpheus) name=context ;; *) name="$1" ;; esac
echo "$*" > "$MARKS/$name"
for other in $RENDEZVOUS; do
  tries=0
  until [ -e "$MARKS/$other" ]; do
    tries=$((tries + 1))
    if [ "$tries" -gt 400 ]; then echo "$name never overlapped $other" >&2; exit 97; fi
    sleep 0.05
  done
done
echo "$name output"
if [ "$name" = build ]; then mkdir -p dist && printf '%s' "$STUB_BUILD_OUTPUT" > dist/a.js; fi
if [ "$STUB_FAIL" = "$name" ]; then echo "$name problem" >&2; exit 2; fi
`;

function runStep(overrides: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "node-ci-parallel-"));
  temps.push(dir);
  const repo = join(dir, "repo"), bin = join(dir, "bin"), marks = join(dir, "marks"), runnerTemp = join(dir, "runner");
  for (const path of [join(repo, "dist"), bin, marks, runnerTemp]) mkdirSync(path, { recursive: true });
  writeFileSync(join(bin, "pnpm"), PNPM);
  writeFileSync(join(bin, "sudo"), '#!/bin/sh\necho "$*" >> "$MARKS/sudo"\n');
  for (const tool of ["pnpm", "sudo"]) chmodSync(join(bin, tool), 0o755);
  writeFileSync(join(repo, "dist/a.js"), "built\n");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
  git("init", "-q");
  git("add", ".");
  git("-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "-m", "fixture");

  const script = join(dir, "step.sh");
  writeFileSync(script, parallel.run!);
  // The alias values are the real serial scripts; only expression-valued inputs are supplied here.
  const literal = Object.fromEntries(Object.entries(parallel.env!).filter(([, value]) => !value.includes("${{")));
  const result = spawnSync("bash", ["-e", script], {
    cwd: repo,
    encoding: "utf8",
    timeout: 60_000,
    env: {
      ...process.env,
      ...literal,
      PATH: `${bin}${delimiter}${process.env.PATH}`,
      RUNNER_TEMP: runnerTemp,
      MARKS: marks,
      RUN_LINT: "true",
      RUN_CONTEXT_RUNTIME: "false",
      VERIFY_BUILD_CLEAN: "true",
      BUILD_SCRIPT: "compile",
      BUILD_OUTPUT_DIRECTORY: "dist",
      RENDEZVOUS: "typecheck lint build",
      STUB_BUILD_OUTPUT: "built\n",
      STUB_FAIL: "",
      ...overrides,
    },
  });
  const mark = (name: string) => (existsSync(join(marks, name)) ? readFileSync(join(marks, name), "utf8") : undefined);
  return { status: result.status, output: result.stdout + result.stderr, mark, repo, gitStatus: () => git("status", "--porcelain") };
}

describe("node-ci parallel static checks", () => {
  it("is off by default, so an @main caller keeps the serial steps unchanged", () => {
    expect(workflow.on.workflow_call.inputs["parallel-static-checks"]?.default).toBe(false);
    expect(parallel.if).toBe("${{ inputs.parallel-static-checks }}");
    expect(named("Typecheck").if).toBe("${{ !inputs.parallel-static-checks }}");
    expect(named("Lint").if).toBe("${{ !inputs.parallel-static-checks && inputs.run-lint }}");
    expect(named("Install Morpheus context search runtime").if).toBe(
      "${{ !inputs.parallel-static-checks && github.repository == 'cpheinrich/morpheus' && runner.os == 'Linux' }}",
    );
    expect(named("Clean committed build output").if).toBe(
      "${{ !inputs.parallel-static-checks && inputs.verify-build-clean && inputs.build-output-directory != '' }}",
    );
    expect(named("Build").if).toBe("${{ !inputs.parallel-static-checks }}");
    expect(named("Verify committed build output").if).toBe("${{ !inputs.parallel-static-checks && inputs.verify-build-clean }}");
    // The tests run in both modes, after the concurrent step.
    expect(named("Test").if).toBeUndefined();
    expect(named("Test").run).toBe("pnpm test");
    expect(steps.indexOf(parallel)).toBeLessThan(steps.indexOf(named("Test")));
  });

  it("runs the serial steps' own scripts under their own conditions", () => {
    expect(parallel.env).toMatchObject({
      TYPECHECK_STEP: "pnpm typecheck",
      LINT_STEP: "pnpm lint",
      BUILD_STEP: 'pnpm run "$BUILD_SCRIPT"',
      RUN_LINT: "${{ inputs.run-lint }}",
      RUN_CONTEXT_RUNTIME: "${{ github.repository == 'cpheinrich/morpheus' && runner.os == 'Linux' }}",
      VERIFY_BUILD_CLEAN: "${{ inputs.verify-build-clean }}",
      BUILD_SCRIPT: "${{ inputs.build-script }}",
      BUILD_OUTPUT_DIRECTORY: "${{ inputs.build-output-directory }}",
    });
    for (const [variable, name] of [
      ["TYPECHECK_STEP", "Typecheck"],
      ["LINT_STEP", "Lint"],
      ["CONTEXT_RUNTIME_STEP", "Install Morpheus context search runtime"],
      ["CLEAN_BUILD_STEP", "Clean committed build output"],
      ["BUILD_STEP", "Build"],
      ["VERIFY_BUILD_STEP", "Verify committed build output"],
    ] as const) {
      expect(parallel.env![variable], variable).toBe(named(name).run);
    }
  });

  it("Morpheus opts in from its own CI caller", () => {
    const caller = load(readFileSync(join(root, ".github/workflows/ci.yml"), "utf8")) as {
      jobs: { node: { with: Record<string, unknown> } };
    };
    expect(caller.jobs.node.with["parallel-static-checks"]).toBe(true);
  });

  it("overlaps every check, installs the context runtime, and leaves verified output clean", () => {
    const run = runStep({ RUN_CONTEXT_RUNTIME: "true", RENDEZVOUS: "typecheck lint build context" });
    expect(run.output).not.toContain("never overlapped");
    expect(run.status).toBe(0);
    for (const name of ["typecheck", "lint", "context-runtime", "build"]) {
      expect(run.output).toContain(`::group::${name} passed`);
    }
    expect(run.output).not.toContain("::error");
    expect(run.mark("typecheck")).toBe("typecheck\n");
    expect(run.mark("lint")).toBe("lint\n");
    expect(run.mark("build")).toBe("run compile\n");
    expect(run.mark("context")).toBe("morpheus context runtime install\n");
    expect(run.mark("sudo")).toBe("apt-get update -q\napt-get install -y ripgrep\n");
    expect(run.gitStatus()).toBe("");
  });

  it.each(["typecheck", "lint"])("fails when %s fails, after letting the other checks finish", (failing) => {
    const run = runStep({ STUB_FAIL: failing });
    expect(run.status).toBe(1);
    expect(run.output).toContain(`::error title=${failing} failed::`);
    for (const name of ["typecheck", "lint", "build"].filter(name => name !== failing)) {
      expect(run.output).toContain(`::group::${name} passed`);
    }
    expect(run.output).not.toContain(`::group::${failing} passed`);
    // wait-ci reports the tail of a failed step, so the failing output comes after every passing log.
    expect(run.output.indexOf(`${failing} problem`)).toBeGreaterThan(run.output.lastIndexOf("::endgroup::"));
  });

  it("reports every failure when more than one check fails", () => {
    const run = runStep({ STUB_FAIL: "typecheck", STUB_BUILD_OUTPUT: "changed\n" });
    expect(run.status).toBe(1);
    expect(run.output).toContain("::error title=typecheck failed::");
    expect(run.output).toContain("::error title=build failed::");
    expect(run.output).toContain("::group::lint passed");
  });

  it("fails when the build changes committed output", () => {
    const run = runStep({ STUB_BUILD_OUTPUT: "changed\n" });
    expect(run.status).toBe(1);
    expect(run.output).toContain("::error title=build failed::");
    expect(run.output).toContain("-built\n+changed");
    expect(run.output).toContain("::group::typecheck passed");
  });

  it("does not compare output when the caller did not ask for verification", () => {
    const run = runStep({ VERIFY_BUILD_CLEAN: "false", STUB_BUILD_OUTPUT: "changed\n" });
    expect(run.status).toBe(0);
    expect(run.mark("build")).toBe("run compile\n");
    // Neither cleaned nor staged: the serial path leaves the same unstaged edit.
    expect(run.gitStatus()).toBe(" M dist/a.js\n");
  });

  it("skips lint unless the caller enabled it", () => {
    const run = runStep({ RUN_LINT: "false", RENDEZVOUS: "typecheck build" });
    expect(run.status).toBe(0);
    expect(run.mark("lint")).toBeUndefined();
    expect(run.output).not.toContain("lint");
    expect(run.mark("context")).toBeUndefined();
    expect(run.mark("sudo")).toBeUndefined();
  });

  it("keeps the serial build guards: an unsafe or missing output directory fails before building", () => {
    const unsafe = runStep({ BUILD_OUTPUT_DIRECTORY: "../dist", RENDEZVOUS: "" });
    expect(unsafe.status).toBe(1);
    expect(unsafe.output).toContain("build-output-directory must be a safe relative path");
    expect(unsafe.mark("build")).toBeUndefined();
    expect(readFileSync(join(unsafe.repo, "dist/a.js"), "utf8")).toBe("built\n");

    const untracked = runStep({ BUILD_OUTPUT_DIRECTORY: "out", RENDEZVOUS: "" });
    expect(untracked.status).toBe(1);
    expect(untracked.output).toContain("build-output-directory 'out' has no tracked files");
    expect(untracked.mark("build")).toBeUndefined();

    const missing = runStep({ BUILD_OUTPUT_DIRECTORY: "", RENDEZVOUS: "" });
    expect(missing.status).toBe(1);
    expect(missing.output).toContain("verify-build-clean requires build-output-directory");
    expect(missing.mark("build")).toBe("run compile\n");
  });
});
