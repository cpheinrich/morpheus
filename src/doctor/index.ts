import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { parseArtifact } from "../pm/parse.js";
import { parseInboxFile } from "../inbox/parse.js";
import { readRegistry } from "../registry/index.js";
import { INBOX_DIR, TEAM_RESERVED } from "../paths.js";
import { projectPolicy } from "../session/policy.js";

/**
 * Report drift without fixing it.
 *
 * Deliberately the cheap half of `upgrade`: saying what is missing needs no
 * templating, no merge strategy, and no knowledge of how to fix anything — so
 * it stays useful while conventions are still moving, which is exactly when an
 * `upgrade` command would be a liability.
 *
 * **Never writes.** Anything it cannot fix, it names.
 */

export const Kind = z.enum(["company", "personal", "internal"]);
export type Kind = z.infer<typeof Kind>;

export const Manifest = z.object({
  name: z.string(),
  prefix: z.string().regex(/^[A-Z]{2,4}$/).optional(),
  kind: Kind.optional(),
  /** Session-freshness config. Its absence is what `context` below reports. */
  /**
   * Every field `unknown`, and the shape checked where it is used.
   *
   * `Manifest.parse` failing returns early and reports **nothing else about
   * the project** — not the handle whose inbox is missing, not the trunk that
   * does not resolve, both of which name states that refuse every governed
   * command with no override. Meanwhile `projectPolicy` never throws: it
   * guards each field with a `typeof` and falls back. So a schema strict
   * enough to reject a hand-edit silences the only surface that would have
   * explained it, while the gate carries on with a default.
   */
  context: z.unknown().optional(),
  /**
   * Subtrees owned by a parent project rather than this one, e.g.
   * `{ "finance": "darwin" }`. Their directories are correctly absent, so
   * expecting them would report drift on a project that is right.
   */
  inherits: z.record(z.string(), z.string()).optional(),
});

export type Severity = "error" | "warning";

export interface Finding {
  severity: Severity;
  check: string;
  message: string;
}

/** Directories each kind is expected to have. */
export const EXPECTED: Record<Kind, string[]> = {
  company: [
    "hq/product/roadmap",
    "hq/product/goals",
    "hq/team",
    "hq/brand",
    "hq/marketing",
    "hq/finance",
    "hq/ops",
    // `qa/` feeds verifier rung 3 and `infra/` holds the generated Firestore
    // rules. Both were in the specification and in no project's scaffold, so
    // every repo grew them by hand or not at all.
    "qa/acceptance",
    "infra",
    ".agent/worklog",
    ".agent/inbox-archive",
  ],
  personal: [
    "hq/product/roadmap",
    "hq/product/goals",
    "hq/team",
    "hq/brand",
    "qa/acceptance",
    ".agent/worklog",
    ".agent/inbox-archive",
  ],
  internal: ["hq/product/roadmap", "qa/acceptance", ".agent/worklog"],
};

/** Files every project should carry regardless of kind. */
const EXPECTED_FILES = [
  "morpheus.json",
  "AGENTS.md",
  ".agent/decisions.md",
  ".agent/learned.md",
];

/**
 * Whether this project's freshness checks are measuring the right ref.
 *
 * Two failures, and the second is the quiet one. A **declared** trunk that
 * does not resolve locks every governed command with a message blaming the
 * network. An **undeclared** one on a fork resolves to the fork's own `main`,
 * which sits still while the real trunk moves — so the lease certifies fresh
 * indefinitely, with a ✓, which is the state the protocol exists to refuse.
 * `doctor` is the only place the second can be caught, and an `upstream`
 * remote beside `origin` is a cheap and specific signal for it.
 */
async function checkTrunk(
  root: string,
  declared: string | undefined,
  offline: boolean,
  add: (severity: Severity, check: string, message: string) => void,
): Promise<void> {
  const { resolveTrunk, trunkSha } = await import("../session/git.js");
  const trunk = await resolveTrunk(root, declared);
  const remotes = await gitLines(root, ["remote"]);

  if (remotes === null) {
    add(
      "warning",
      "context",
      `Could not ask git for this repo's remotes, so the session-freshness trunk ` +
        `"${trunk.remote}/${trunk.branch}" could not be checked. If this directory is not a git ` +
        `repository yet, \`git init\` first — every observation is "unknown" until it is.`,
    );
    return;
  }

  // Hoisted out of the `!declared` branch, because the worst case has *no*
  // remotes at all: `ls-remote origin main` then exits 128 rather than 2, so
  // `trunkSha` says `unreachable` and the `missing` branch below never runs.
  // A freshly scaffolded project before `git remote add` is exactly that
  // state — every observation `unknown`, both external commands refused with
  // no override, and nothing reporting it. Locally certain, so it needs no
  // network to diagnose.
  if (remotes.length && !remotes.includes(trunk.remote)) {
    add(
      "error",
      "context",
      `The session-freshness trunk is "${trunk.remote}/${trunk.branch}" but this repo has no ` +
        `remote named "${trunk.remote}" (it has ${remotes.join(", ")}). Every observation is ` +
        `"unknown", so pm claim and access sync are refused with a message blaming the network.`,
    );
    return;
  }
  if (!remotes.length) {
    add(
      "error",
      "context",
      `This repo has no git remotes, so the session-freshness trunk ` +
        `"${trunk.remote}/${trunk.branch}" can never resolve. Every observation is "unknown" and ` +
        `pm claim and access sync are refused permanently — MORPHEUS_OFFLINE=1 does not cover ` +
        `external actions. Add the remote, or set context.trunk once there is one.`,
    );
    return;
  }

  if (!declared) {
    const others = remotes.filter((r) => r !== "origin");
    if (others.length) {
      add(
        "warning",
        "context",
        `No "context.trunk" in morpheus.json, and this repo has remotes besides origin ` +
          `(${others.join(", ")}). If origin is a fork, session freshness is measured against ` +
          `the fork's ${trunk.branch} — which does not move when the real trunk does, so leases ` +
          `certify fresh indefinitely. Set context.trunk, e.g. "${others[0]}/${trunk.branch}".`,
      );
    }
  }

  if (offline) {
    // A skipped check reported as nothing is a skipped check reported as a
    // pass — `formatFindings` renders an empty list as an unqualified "No
    // drift.", and `doctor` is the adoption reporter, so it is the one
    // surface where that difference has to survive. The `.claude/settings.json`
    // check above is read rather than stat'd for the same reason.
    add(
      "warning",
      "context",
      `Offline: did not check that "${trunk.remote}/${trunk.branch}" resolves. A declared trunk ` +
        `whose branch does not exist refuses pm claim and access sync permanently, and this run ` +
        `cannot tell you whether that is the case.`,
    );
    return;
  }
  const observed = await trunkSha(root, trunk);
  if (observed.reason === "missing") {
    add(
      "error",
      "context",
      `The session-freshness trunk "${trunk.remote}/${trunk.branch}" does not exist on the ` +
        `remote. Every observation is "unknown", so pm claim, pm block and access sync are ` +
        `refused with a message blaming the network. Set context.trunk in morpheus.json.`,
    );
  }
}

/**
 * `null` when git could not be asked, `[]` when it answered nothing.
 *
 * `git remote` exits 0 with empty stdout in a real repo with no remotes, so
 * the two are cheaply distinguishable — and conflating them made "this repo
 * has no git remotes" fire, at *error* severity, for a directory that is not a
 * repo, for git missing from PATH, for a timeout, and for git's `dubious
 * ownership` refusal in a container. A failed lookup rendering as a confident
 * answer, in the check added because a previous failed lookup was doing that.
 */
async function gitLines(root: string, args: string[]): Promise<string[] | null> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  try {
    const { stdout } = await promisify(execFile)("git", args, { cwd: root, timeout: 10_000 });
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    return null;
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export interface DoctorOptions {
  root: string;
  /** Skip checks that need the network. */
  offline?: boolean;
}

export async function doctor(opts: DoctorOptions): Promise<Finding[]> {
  const { root } = opts;
  const findings: Finding[] = [];
  const add = (severity: Severity, check: string, message: string) =>
    findings.push({ severity, check, message });

  // --- manifest -----------------------------------------------------------
  let manifest: z.infer<typeof Manifest> | null = null;
  try {
    manifest = Manifest.parse(JSON.parse(await readFile(join(root, "morpheus.json"), "utf8")));
  } catch (err) {
    add(
      "error",
      "manifest",
      `morpheus.json missing or invalid — ${err instanceof Error ? err.message.split("\n")[0] : err}`,
    );
    return findings; // Everything else keys off the manifest.
  }

  if (!manifest.prefix) {
    add(
      "error",
      "prefix",
      'No "prefix" — ids would collide with other projects. Add 2-4 uppercase letters.',
    );
  }

  const kind = manifest.kind;
  if (!kind) {
    add("warning", "kind", 'No "kind" — defaulting expectations to personal.');
  }

  // --- context freshness ---------------------------------------------------
  // Adoption reporting, not enforcement. `doctor` never writes, so it says
  // which projects have the protocol wired and which are still open.
  // Checked here rather than in the schema, so a bad one is reported and the
  // rest of `doctor` still runs.
  const contextBlock = manifest.context;
  if (contextBlock !== undefined && (typeof contextBlock !== "object" || contextBlock === null || Array.isArray(contextBlock))) {
    // `.loose()` widens which *keys* are allowed, not the type — so a
    // `context` that is not an object still threw and still silenced every
    // other check. The rule has to reach the container, not stop at the
    // fields.
    add(
      "error",
      "context",
      `context is not an object, so every session-freshness setting in it is ignored and the ` +
        `defaults apply. Nothing else reports this: the gate falls back silently.`,
    );
  }
  const raw = (contextBlock && typeof contextBlock === "object" && !Array.isArray(contextBlock)
    ? contextBlock
    : {}) as Record<string, unknown>;
  for (const [key, expected, ok] of [
    ["handle", "a string", (v: unknown) => typeof v === "string"],
    ["trunk", "a string", (v: unknown) => typeof v === "string"],
    ["requiredInputs", "an array", (v: unknown) => Array.isArray(v)],
  ] as const) {
    if (raw[key] !== undefined && !ok(raw[key])) {
      add(
        "error",
        "context",
        `context.${key} is not ${expected}, so it is ignored entirely and the default applies. ` +
          `Nothing else reports this: the gate falls back silently.`,
      );
    }
  }

  const handle = typeof raw["handle"] === "string" ? raw["handle"] : undefined;
  if (handle && !(await exists(join(root, "hq", "team", `${handle}.md`)))) {
    // The one way this protocol locks a project out of itself: a declared
    // record that does not exist is ABSENT, therefore unresolvable, therefore
    // never fresh — and no flag or override reaches it. An error, not a
    // warning, because every governed command is already refused.
    add(
      "error",
      "context",
      `morpheus.json declares context.handle "${handle}" but hq/team/${handle}.md does not ` +
        `exist. It is in the session-freshness required set, so every governed command is ` +
        `refused until the file is there — create it, or remove the handle.`,
    );
  }
  if (!handle) {
    add(
      "warning",
      "context",
      'No "context.handle" in morpheus.json — `hq/team/<handle>.md` is not in the ' +
        "session-freshness required set, so an agent can resume without re-reading the " +
        "inbox a human replies in. Add the owner's GitHub handle.",
    );
  }
  // Read, not merely stat'd. A settings file that exists but wires nothing is
  // the "check skips what is absent and reports the empty thing as correct"
  // shape — and it would report the hook adopted in exactly the projects
  // where it does nothing.
  const hookPath = join(root, ".claude", "settings.json");
  const hook = await readFile(hookPath, "utf8").catch(() => null);
  if (hook === null) {
    add(
      "warning",
      "context",
      "No .claude/settings.json — a Claude session starts with no notice that its context " +
        "is stale. `morpheus init` scaffolds one; the CLI gate still refuses governed " +
        "actions either way.",
    );
  } else if (!hook.includes("context brief")) {
    add(
      "warning",
      "context",
      ".claude/settings.json has no `morpheus context brief` hook — the file is present but a " +
        "session still starts with no notice that its context is stale.",
    );
  }

  const { droppedInputs } = await projectPolicy(root);
  if (droppedInputs?.length) {
    add(
      "error",
      "context",
      `context.requiredInputs has ${droppedInputs.length} entr${droppedInputs.length === 1 ? "y" : "ies"} ` +
        `that are not strings (${droppedInputs.join(", ")}). They are silently not in the ` +
        `session-freshness required set, so every session certifies without them — which is the ` +
        `opposite of what declaring them was for.`,
    );
  }

  await checkTrunk(
    root,
    typeof raw["trunk"] === "string" ? raw["trunk"] : undefined,
    opts.offline === true,
    add,
  );

  // --- structure ----------------------------------------------------------
  const inherited = new Set(
    Object.keys(manifest.inherits ?? {}).map((k) => `hq/${k}`),
  );

  for (const dir of EXPECTED[kind ?? "personal"]) {
    if (inherited.has(dir)) continue; // owned by a parent project
    if (!(await exists(join(root, dir)))) {
      add("error", "structure", `Missing ${dir}/ — expected for kind "${kind ?? "personal"}".`);
    }
  }
  for (const file of EXPECTED_FILES) {
    if (!(await exists(join(root, file)))) {
      add("warning", "structure", `Missing ${file}.`);
    }
  }

  // --- registry -----------------------------------------------------------
  const reg = await readRegistry();
  const entry = reg.projects.find((p) => p.path === root);
  if (!entry) {
    add("warning", "registry", "Not registered on this machine — run `morpheus registry add`.");
  } else if (manifest.prefix && entry.prefix !== manifest.prefix) {
    add(
      "error",
      "registry",
      `Registry says prefix ${entry.prefix} but morpheus.json says ${manifest.prefix}. The manifest wins.`,
    );
  }

  // --- content ------------------------------------------------------------
  const productDir = join(root, "hq/product");
  if (await exists(productDir)) {
    for (const artifact of ["roadmap", "goals", "requests"] as const) {
      const { items, issues } = await parseArtifact(productDir, artifact);
      for (const i of issues) add("error", `pm:${artifact}`, i.message);

      if (manifest.prefix) {
        for (const item of items) {
          const id = (item.data as { id: string }).id;
          if (!id.startsWith(`${manifest.prefix}-`)) {
            add("error", `pm:${artifact}`, `${id} does not use this project's prefix.`);
          }
        }
      }
    }
  }

  const inboxDir = join(root, INBOX_DIR);
  if (await exists(inboxDir)) {
    const { readdir } = await import("node:fs/promises");
    // `TEAM_RESERVED`, not a local list: the roster now lives beside the
    // inboxes, and reading it as one reports three schema errors about a file
    // that is perfectly valid. Third reader of this rule, so it is shared.
    const files = (await readdir(inboxDir)).filter(
      (f) => f.endsWith(".md") && !TEAM_RESERVED.has(f.toLowerCase()),
    );
    if (files.length === 0) {
      add("warning", "inbox", `${INBOX_DIR}/ has no inbox files — nobody would receive status.`);
    }
    for (const f of files) {
      const { issues } = await parseInboxFile(join(inboxDir, f));
      for (const i of issues) add("error", "inbox", `${f}: ${i.message}`);
    }
  }

  return findings;
}

export function formatFindings(findings: Finding[], label?: string): string {
  const head = label ? `${label}\n` : "";
  if (findings.length === 0) return `${head}✓ No drift.`;

  const lines = findings.map(
    (f) => `${f.severity === "error" ? "✗" : "!"} [${f.check}] ${f.message}`,
  );
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.length - errors;
  return `${head}${lines.join("\n")}\n  ${errors} error(s), ${warnings} warning(s)`;
}
