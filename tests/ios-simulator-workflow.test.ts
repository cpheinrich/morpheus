import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);
type Step = { name: string; id?: string; if?: string; run?: string; env?: Record<string, string> };
async function steps(): Promise<Step[]> {
  const workflow = load(await readFile(new URL("../.github/workflows/ios-ci.yml", import.meta.url), "utf8")) as
    { jobs: { test: { steps: Step[] } } };
  return workflow.jobs.test.steps;
}

async function harness() {
  const root = await mkdtemp(join(tmpdir(), "morpheus simulator "));
  await mkdir(join(root, "bin"));
  const inventory = {
    runtimes: [
      { identifier: "ios-26-5", version: "26.5", platform: "iOS", isAvailable: true },
      { identifier: "ios-26-6", version: "26.6", platform: "iOS", isAvailable: false },
    ],
    devicetypes: [{ name: "iPhone 17 Pro Max", identifier: "iphone-max" }],
    devices: { "ios-26-5": [{ name: "Shared phone", udid: "11111111-1111-4111-8111-111111111111",
      deviceTypeIdentifier: "iphone-max", state: "Booted", isAvailable: true }] },
  };
  await writeFile(join(root, "inventory.json"), JSON.stringify(inventory));
  await writeFile(join(root, "bin/xcrun"), `#!/usr/bin/env python3
import json, os, pathlib, sys, uuid
root = pathlib.Path(os.environ['FAKE_SIM_ROOT'])
args = sys.argv[1:]
with (root / 'commands').open('a') as f: f.write(json.dumps(args) + '\\n')
if args == ['simctl', 'list', '--json']:
 print((root / 'inventory.json').read_text())
elif args[:2] == ['simctl', 'create']:
 if os.environ.get('FAIL_CREATE'): sys.exit(1)
 assert args[3:] == ['iphone-max', 'ios-26-5'], args
 device = str(uuid.uuid4()).upper()
 (root / device).write_text('Booted')
 print(device)
elif args[:2] == ['simctl', 'shutdown']:
 (root / args[2]).write_text('Shutdown')
elif args[:2] == ['simctl', 'delete']:
 (root / args[2]).unlink()
else:
 raise Exception(args)
`);
  await chmod(join(root, "bin/xcrun"), 0o755);
  const workflow = await steps();
  const prepare = workflow.find(s => s.name === "Prepare owned simulator");
  const cleanup = workflow.find(s => s.name === "Delete owned simulator");
  const env = { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}`, FAKE_SIM_ROOT: root,
    GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "1" };
  return {
    root, inventory,
    async prepare(destination = "OS=26.5,name=iPhone 17 Pro Max", overrides = {}) {
      expect(prepare?.run).toBeTypeOf("string");
      const output = join(await mkdtemp(join(root, "invocation-")), "output");
      await writeFile(output, "");
      await exec("bash", ["-euo", "pipefail", "-c", prepare!.run!], {
        env: { ...env, DESTINATION: destination, GITHUB_OUTPUT: output, ...overrides },
      });
      return Object.fromEntries((await readFile(output, "utf8")).trim().split("\n").map(line => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }));
    },
    async cleanup(udid: string) {
      expect(cleanup?.run).toBeTypeOf("string");
      await exec("bash", ["-euo", "pipefail", "-c", cleanup!.run!], { env: { ...env, OWNED_SIMULATOR: udid } });
    },
    async commands(): Promise<string[][]> {
      return (await readFile(join(root, "commands"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
    },
  };
}

describe("iOS simulator ownership", () => {
  it("routes both test phases to the owned destination, including serial tests, and cleans up on failure", async () => {
    const workflow = await steps();
    const prepare = workflow.find(s => s.name === "Prepare owned simulator");
    expect(prepare?.id).toBe("ios_simulator");
    expect(prepare?.if).toBe("${{ inputs.run-tests && inputs.platform == 'iOS Simulator' }}");
    for (const name of ["Build for testing", "Run unit and UI tests"]) {
      expect(workflow.find(s => s.name === name)?.env?.DESTINATION)
        .toBe("${{ steps.ios_simulator.outputs.destination || inputs.destination }}");
    }
    expect(workflow.find(s => s.name === "Build")?.env?.DESTINATION).toBe("${{ inputs.destination }}");
    const cleanup = workflow.find(s => s.name === "Delete owned simulator");
    expect(cleanup?.if).toBe("${{ always() && steps.ios_simulator.outputs.udid != '' }}");
    expect(cleanup?.env?.OWNED_SIMULATOR).toBe("${{ steps.ios_simulator.outputs.udid }}");
    expect(workflow.indexOf(cleanup!)).toBeGreaterThan(workflow.findIndex(s => s.name === "Upload Xcode failure evidence"));
  });

  it("keeps an overlapping lane alive when the first job cleans up, without touching the shared base", async () => {
    const h = await harness();
    try {
      const [a, b] = await Promise.all([h.prepare(), h.prepare()]);
      expect(a.udid).toMatch(/^[0-9A-F-]{36}$/);
      expect(b.udid).not.toBe(a.udid);
      expect(a.destination).toBe(`id=${a.udid}`);
      expect(b.destination).toBe(`id=${b.udid}`);
      await h.cleanup(a.udid!);
      expect(await readFile(join(h.root, b.udid!), "utf8")).toBe("Booted");
      expect(await readdir(h.root)).not.toContain(a.udid);
      await h.cleanup(b.udid!);
      expect((await h.commands()).filter(a => ["shutdown", "delete"].includes(a[1]!)))
        .toEqual([["simctl", "shutdown", a.udid], ["simctl", "delete", a.udid],
          ["simctl", "shutdown", b.udid], ["simctl", "delete", b.udid]]);
    } finally { await rm(h.root, { recursive: true, force: true }); }
  });

  it("uses only the type and runtime of an explicit booted device, preserving arch", async () => {
    const h = await harness();
    try {
      const output = await h.prepare("id=11111111-1111-4111-8111-111111111111,arch=arm64");
      expect(output.destination).toBe(`id=${output.udid},arch=arm64`);
      expect(output.udid).not.toBe("11111111-1111-4111-8111-111111111111");
      expect((await h.commands()).map(a => a[1])).toEqual(["list", "create"]);
    } finally { await rm(h.root, { recursive: true, force: true }); }
  });

  it("selects the latest available runtime and refuses missing or ambiguous input without creating a device", async () => {
    const h = await harness();
    try {
      await h.prepare("OS=latest,name=iPhone 17 Pro Max");
      for (const destination of ["OS=99,name=iPhone 17 Pro Max", "OS=26.6,name=iPhone 17 Pro Max",
        "name=Absent", "id=missing", "name=iPhone 17 Pro Max,variant=unknown", "name=a,name=b", "id=all"]) {
        await expect(h.prepare(destination)).rejects.toThrow();
      }
      expect((await h.commands()).filter(a => a[1] === "create")).toHaveLength(1);
      await expect(h.cleanup("all")).rejects.toThrow();
      expect((await h.commands()).filter(a => a[1] === "delete")).toEqual([]);
    } finally { await rm(h.root, { recursive: true, force: true }); }
  });

  it("fails allocation when simctl fails instead of falling back to a shared device", async () => {
    const h = await harness();
    try { await expect(h.prepare(undefined, { FAIL_CREATE: "1" })).rejects.toThrow(); }
    finally { await rm(h.root, { recursive: true, force: true }); }
  });
});
