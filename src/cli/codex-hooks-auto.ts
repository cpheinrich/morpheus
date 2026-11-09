import { execFile, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";
import { codexHome } from "../doctor/codex-trust.js";
import { codexHookProject, requireMorpheusProject, withCodexHookApproval } from "./codex-hooks.js";

const exec = promisify(execFile);
const registryName = "morpheus-hook-projects.json";
const registry = z.array(z.object({ root: z.string(), gitIdentity: z.string() }));
type Enrollment = z.infer<typeof registry>[number];

async function enrolled(home: string): Promise<Enrollment[]> {
  try {
    return registry.parse(JSON.parse(await readFile(join(home, registryName), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writePrivate(path: string, contents: string): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, { mode: 0o600, flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

function saveEnrollment(home: string, projects: Enrollment[]): Promise<void> {
  return writePrivate(join(home, registryName), JSON.stringify(projects, null, 2) + "\n");
}

async function projectEnrollment(cwd: string): Promise<Enrollment> {
  const { root, gitDir } = await codexHookProject(cwd);
  // A different clone placed at the same path does not inherit enrollment.
  const { dev, ino } = await stat(gitDir, { bigint: true });
  return { root, gitIdentity: `${dev}:${ino}` };
}

function launchAgent(home: string) {
  const label = `local.morpheus.codex-hooks.${createHash("sha256").update(home).digest("hex").slice(0, 16)}`;
  const domain = `gui/${process.getuid?.()}`;
  const directory = join(homedir(), "Library", "LaunchAgents");
  return { label, domain, target: `${domain}/${label}`, directory, plist: join(directory, `${label}.plist`) };
}

async function jobLoaded(target: string): Promise<boolean> {
  return exec("/bin/launchctl", ["print", target], { timeout: 5_000 }).then(() => true, () => false);
}

async function setJob(home: string, enabled: boolean): Promise<void> {
  if (process.platform !== "darwin") throw new Error("Automatic Codex hook approval requires macOS.");
  const { label, domain, target, directory, plist } = launchAgent(home);
  const loaded = await jobLoaded(target);
  if (!enabled) {
    if (loaded) await exec("/bin/launchctl", ["bootout", target], { timeout: 5_000 });
    await rm(plist, { force: true });
    return;
  }
  if (loaded) return;

  const cli = fileURLToPath(new URL("./index.js", import.meta.url));
  await access(cli).catch(() => { throw new Error("Run the installed Morpheus CLI to enable automatic approval."); });
  const path = ["/opt/homebrew/bin", "/usr/local/bin", dirname(process.execPath), join(homedir(), ".local", "bin"), "/usr/bin", "/bin"].join(":");
  const input = JSON.stringify({
    Label: label,
    ProgramArguments: ["/usr/bin/env", "node", cli, "codex", "hooks", "scan"],
    WorkingDirectory: homedir(),
    EnvironmentVariables: { CODEX_HOME: home, PATH: path },
    StartInterval: 60,
    StandardOutPath: join(home, "morpheus-hook-approval.log"),
    StandardErrorPath: join(home, "morpheus-hook-approval.log"),
  });
  const xml = execFileSync("/usr/bin/plutil", ["-convert", "xml1", "-o", "-", "--", "-"], {
    input, encoding: "utf8", timeout: 5_000,
  });
  await mkdir(directory, { recursive: true });
  await writePrivate(plist, xml);
  try {
    await exec("/bin/launchctl", ["bootstrap", domain, plist], { timeout: 5_000 });
  } catch (error) {
    await rm(plist, { force: true });
    throw error;
  }
}

async function scan(projects: Enrollment[], approve: (root: string) => Promise<number>): Promise<number> {
  let failed = false;
  for (const entry of projects) {
    try {
      const current = await projectEnrollment(entry.root);
      if (current.root !== entry.root || current.gitIdentity !== entry.gitIdentity) {
        throw new Error("The enrolled checkout was replaced. Enable approval again from the new checkout.");
      }
      const count = await approve(entry.root);
      if (count) console.log(`Approved ${count} Codex hook(s) in ${entry.root}.`);
    } catch (error) {
      failed = true;
      console.error(`${entry.root}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return failed ? 1 : 0;
}

interface EnrollmentOptions {
  cwd?: string;
  binary?: string;
  setAgent?: typeof setJob;
}

export async function runCodexHookEnrollment(
  command: string, { cwd = process.cwd(), binary, setAgent = setJob }: EnrollmentOptions = {},
): Promise<number> {
  if (!["enable", "disable", "status", "scan"].includes(command)) {
    throw new Error("Usage: morpheus codex hooks <approve|enable|disable|status>");
  }
  const home = await realpath(codexHome());
  if (command === "status") {
    const entries = await enrolled(home);
    console.log(entries.map(({ root }) => root).join("\n") || "No projects enrolled for automatic Codex hook approval.");
    return 0;
  }
  return withCodexHookApproval(home, async (approve) => {
    const entries = await enrolled(home);
    if (command === "scan") return scan(entries, approve);
    const project = await projectEnrollment(cwd);
    const others = entries.filter(({ root }) => root !== project.root);
    if (command === "disable") {
      await saveEnrollment(home, others);
      if (!others.length) await setAgent(home, false);
      console.log(`Disabled automatic Codex hook approval for ${project.root}.`);
      return 0;
    }
    await requireMorpheusProject(project.root);
    await setAgent(home, true);
    await saveEnrollment(home, [...others, project]);
    console.log(`Enabled automatic Codex hook approval for ${project.root}.`);
    return scan([project], approve);
  }, binary);
}
