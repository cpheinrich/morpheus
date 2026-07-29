import { access, readFile, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { packageStatus } from "../brand/package.js";
import { parseArtifact } from "../pm/parse.js";
import { readRegistry } from "../registry/index.js";

const exec = promisify(execFile);

/**
 * Everything a project needs before it is really set up.
 *
 * Two rules shape this list.
 *
 * **Anything Morpheus can see, Morpheus checks.** A checklist you tick by hand
 * drifts from reality the first time someone forgets, and a checklist that can
 * be wrong about things it could have verified stops being read. Manual state
 * exists only for work that happens outside the repo — a Cloudflare token, a
 * billing account — where there is nothing to look at.
 *
 * **Nothing is sequential and nothing is lost.** State lives in
 * `hq/onboarding.md`, so being interrupted halfway costs nothing. The single
 * most common failure of setup wizards is that they are a transaction: quit at
 * step nine and you begin again at step one.
 */

export type Detection = boolean | null;

/**
 * Which kinds of project a task applies to.
 *
 * Morpheus itself is `internal` — a tool, not a company. Showing it nine
 * infrastructure steps it will never take makes the checklist wrong for it,
 * and a checklist that is wrong for you is one you stop opening.
 */
export type Kind = "company" | "personal" | "internal";

export interface Task {
  id: string;
  title: string;
  /** Defaults to every kind. */
  kinds?: Kind[];
  /** Why it matters. One line — a reason nobody reads is a reason nobody has. */
  why: string;
  /** How to do it: a command, a URL, or a sentence. */
  how: string;
  group: string;
  optional?: boolean;
  /** Needs the network. Skipped under `--offline`. */
  network?: boolean;
  /**
   * True when done, false when not, **null when it cannot be determined** —
   * a missing tool or an unreachable API must never render as "not done".
   */
  detect?: (root: string) => Promise<Detection>;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(p, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Run a command, returning null when it fails or is missing. */
async function tryRun(cmd: string, args: string[], cwd: string): Promise<string | null> {
  try {
    const { stdout } = await exec(cmd, args, { cwd });
    return stdout;
  } catch {
    return null;
  }
}

/**
 * A file existing is not the step being done.
 *
 * The first version of these detectors checked for any `.md` that was not a
 * README, so an empty goal file or a blank inbox read as complete — the same
 * mistake `tokens.json` had, where an empty scaffold looked finished in a
 * listing. Every detector below parses what it finds.
 */
async function hasValidArtifact(
  root: string,
  kind: "roadmap" | "goals" | "requests",
): Promise<boolean> {
  const { items, issues } = await parseArtifact(join(root, "hq/product"), kind);
  return items.length > 0 && issues.length === 0;
}

/** Read the whole `.github/workflows` directory as one string. */
async function workflowText(root: string): Promise<string> {
  const dir = join(root, ".github/workflows");
  try {
    const files = await readdir(dir);
    const parts = await Promise.all(
      files.map((f) => readFile(join(dir, f), "utf8").catch(() => "")),
    );
    return parts.join("\n");
  } catch {
    return "";
  }
}

export const TASKS: Task[] = [
  // ---------------------------------------------------------------- repo ---
  {
    id: "manifest",
    group: "Repository",
    title: "morpheus.json with a name, prefix and kind",
    why: "The prefix namespaces every id. Without it, two projects' MO-001s collide.",
    how: "morpheus registry add --prefix XX",
    detect: async (root) => {
      const m = await readJson<{ prefix?: string; kind?: string; name?: string }>(
        join(root, "morpheus.json"),
      );
      return Boolean(m?.prefix && m?.kind && m?.name);
    },
  },
  {
    id: "agents-md",
    group: "Repository",
    title: "AGENTS.md, with CLAUDE.md symlinked to it",
    why: "One file so Claude and Codex read the same instructions rather than two that drift.",
    how: "Write AGENTS.md, then `ln -s AGENTS.md CLAUDE.md`",
    detect: async (root) => (await exists(join(root, "AGENTS.md")))
      && (await exists(join(root, "CLAUDE.md"))),
  },
  {
    id: "agent-records",
    group: "Repository",
    title: ".agent/ records: decisions, learned, worklog, inbox-archive",
    why: "Git history cannot hold a dead end that produced no code, and that is the expensive knowledge.",
    how: "morpheus doctor names whichever are missing",
    detect: async (root) =>
      (
        await Promise.all(
          [".agent/decisions.md", ".agent/learned.md", ".agent/worklog", ".agent/inbox-archive"].map(
            (p) => exists(join(root, p)),
          ),
        )
      ).every(Boolean),
  },
  {
    id: "registry",
    group: "Repository",
    title: "Registered on this machine",
    why: "Prefix collisions are caught at registration; discovering one later means renaming every id.",
    how: "morpheus registry add — from the project root",
    detect: async (root) => {
      const reg = await readRegistry();
      return reg.projects.some((p) => p.path === root);
    },
  },

  // ------------------------------------------------------------------ ci ---
  {
    id: "workflows",
    group: "CI and protection",
    title: "CI delegates to the Morpheus reusable workflows",
    why: "Improving CI everywhere becomes one commit here rather than a change in every repo.",
    how: "uses: cpheinrich/morpheus/.github/workflows/node-ci.yml@main",
    detect: async (root) => (await workflowText(root)).includes("cpheinrich/morpheus/.github/workflows"),
  },
  {
    id: "pm-check",
    group: "CI and protection",
    title: "pm and PR convention checks run in CI",
    why: "Instructions get ignored eventually; a failing check does not.",
    how: "Add the pm-check.yml and pr-check.yml reusable workflows",
    detect: async (root) => {
      const text = await workflowText(root);
      return text.includes("pm-check.yml") && text.includes("pr-check.yml");
    },
  },
  {
    id: "branch-protection",
    group: "CI and protection",
    title: "main is protected, with agent self-merge allowed",
    why: "Nothing reaches main unreviewed, and agents still merge their own green PRs unattended.",
    how: "Settings → Branches → add a rule for main requiring status checks",
    network: true,
    detect: async (root) => {
      const out = await tryRun(
        "gh",
        ["api", "repos/{owner}/{repo}/branches/main/protection", "--jq", ".required_status_checks.strict"],
        root,
      );
      // A 404 means unprotected, but so does a missing gh or no auth — and
      // tryRun cannot tell those apart, so an absent answer stays absent.
      return out === null ? null : out.trim().length > 0;
    },
  },
  {
    id: "actions-secrets",
    group: "CI and protection",
    title: "Deploy and API secrets set in GitHub Actions",
    why: "A workflow that needs a secret it does not have fails at the least convenient moment.",
    how: "gh secret set NAME — do this once at setup so no agent has to ask you for a token later",
    optional: true,
    network: true,
    detect: async (root) => {
      const out = await tryRun("gh", ["secret", "list"], root);
      return out === null ? null : out.trim().length > 0;
    },
  },

  // ------------------------------------------------------------- product ---
  {
    id: "goal",
    group: "Product",
    title: "At least one goal written down",
    why: "A roadmap with no goal is a list of work nobody can decline.",
    how: 'morpheus pm new goals "Ship the thing by Q4"',
    detect: async (root) => hasValidArtifact(root, "goals"),
  },
  {
    id: "roadmap",
    group: "Product",
    title: "At least one roadmap item",
    why: "The board is how agents pick up work without being told what to do.",
    how: 'morpheus pm new roadmap "First thing to build"',
    detect: async (root) => hasValidArtifact(root, "roadmap"),
  },
  {
    id: "inbox",
    kinds: ["company", "personal"],
    group: "Product",
    title: "An inbox file for each person",
    why: "Without one there is nowhere for an agent to hand you a question and get an answer back.",
    how: "Create hq/inbox/<github-handle>.md, one per person",
    detect: async (root) => {
      const dir = join(root, "hq/inbox");
      let files: string[];
      try {
        files = (await readdir(dir)).filter(
          (f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md",
        );
      } catch {
        return false;
      }
      if (!files.length) return false;

      // An inbox that does not validate is not an inbox — it would fail CI on
      // the first run, which is the opposite of a completed setup step.
      const { parseInboxFile } = await import("../inbox/parse.js");
      const parsed = await Promise.all(files.map((f) => parseInboxFile(join(dir, f))));
      return parsed.every((p) => p.issues.length === 0);
    },
  },

  // --------------------------------------------------------------- brand ---
  {
    id: "brand-answers",
    kinds: ["company", "personal"],
    group: "Brand",
    title: "Brand answers filled in",
    why: "Every generated brand document derives from these; nothing downstream can be written without them.",
    how: "morpheus brand init — or edit hq/brand/answers.md directly and run morpheus brand build",
    detect: async (root) => {
      const { readAnswers } = await import("../brand/answers.js");
      return (await readAnswers(join(root, "hq/brand"))) !== null;
    },
  },
  {
    id: "brand-package",
    kinds: ["company", "personal"],
    group: "Brand",
    title: "Design session done — tokens, visual system, logo, decisions",
    why: "A brand strategy with no visual system cannot be applied by anyone who was not in the room.",
    how: "Paste hq/brand/explore-prompt.md into a Claude or Codex session; morpheus brand status shows what is left",
    detect: async (root) => (await packageStatus(join(root, "hq/brand"))).complete,
  },

  // ---------------------------------------------------------- infra: web ---
  {
    id: "domain",
    kinds: ["company", "personal"],
    group: "Infrastructure",
    title: "Domain registered",
    why: "Everything below points at it, and transfers are slow when done late.",
    how: "Register it, then move DNS to Cloudflare",
  },
  {
    id: "cloudflare-dns",
    kinds: ["company", "personal"],
    group: "Infrastructure",
    title: "Cloudflare zone holding DNS",
    why: "One place for DNS, and the free tier covers everything a young project needs.",
    how: "Add the site in Cloudflare, then repoint nameservers at the registrar",
  },
  {
    id: "cloudflare-token",
    kinds: ["company", "personal"],
    group: "Infrastructure",
    title: "Cloudflare API token issued and stored",
    why: "Generate it once during setup so no agent ever has to ask you to go and make one.",
    how: "Cloudflare → My Profile → API Tokens. Scope it to the zone, then `gh secret set CLOUDFLARE_API_TOKEN`",
  },
  {
    id: "vercel",
    kinds: ["company", "personal"],
    group: "Infrastructure",
    title: "Vercel project linked, with the right root directory",
    why: "A monorepo deploys the wrong thing until the root directory is set, and the failure looks like a build error.",
    how: "vercel link, then Settings → General → Root Directory (apps/web in a monorepo)",
    detect: async (root) => exists(join(root, ".vercel/project.json")),
  },
  {
    id: "env-example",
    kinds: ["company", "personal"],
    group: "Infrastructure",
    title: "A checked-in .env.example",
    why: "The only record of which variables exist. Without it, a new machine finds out by crashing.",
    how: "Commit .env.example with every key and no values",
    detect: async (root) =>
      (await exists(join(root, ".env.example"))) || (await exists(join(root, "apps/web/.env.example"))),
  },

  // --------------------------------------------------------- infra: gcp ---
  {
    id: "gcp-project",
    kinds: ["company"],
    group: "Google Cloud",
    title: "GCP project created under the organisation",
    why: "Firebase, Auth and Firestore all hang off it, and moving a project between orgs later is painful.",
    how: "gcloud projects create <id> --organization=<org-id>",
  },
  {
    id: "gcp-billing",
    kinds: ["company"],
    group: "Google Cloud",
    title: "Billing account linked",
    why: "Spark covers Auth and Firestore, but anything beyond them fails silently until billing exists.",
    how: "console.cloud.google.com/billing — append ?authuser=<your email> to the link",
    optional: true,
  },
  {
    id: "firebase",
    kinds: ["company"],
    group: "Google Cloud",
    title: "Firebase enabled, with Auth turned on",
    why: "Custom claims gate both the Next.js middleware and the Firestore rules.",
    how: "Accept the Firebase terms first — a 403 here is usually unaccepted ToS, not a policy problem",
  },
  {
    id: "firebase-claims",
    kinds: ["company"],
    group: "Google Cloud",
    title: "Employee custom claims set",
    why: "Role gating in one place, checked by middleware and Firestore rules alike.",
    how: "morpheus access sync — reads hq/ops/employees and writes the claims",
    optional: true,
  },

  // ------------------------------------------------------------- optional ---
  {
    id: "analytics",
    kinds: ["company", "personal"],
    group: "Product telemetry",
    title: "Analytics installed",
    why: "Retrofitting events onto a shipped product means guessing what past users did.",
    how: "PostHog, self-hosted or cloud — install before launch, not after",
    optional: true,
  },
  {
    id: "errors",
    kinds: ["company", "personal"],
    group: "Product telemetry",
    title: "Error reporting installed",
    why: "Until this exists, you find out about breakage from users.",
    how: "Sentry — add the SDK to the web app and set SENTRY_DSN as an Actions secret",
    optional: true,
  },
  {
    id: "transactional-email",
    kinds: ["company", "personal"],
    group: "Product telemetry",
    title: "Transactional email sending",
    why: "Password resets and receipts are load-bearing long before marketing email is.",
    how: "Resend or Postmark, with SPF and DKIM on the Cloudflare zone",
    optional: true,
  },
];

export const appliesTo = (t: Task, kind: Kind): boolean =>
  !t.kinds || t.kinds.includes(kind);

export const tasksFor = (kind: Kind): Task[] => TASKS.filter((t) => appliesTo(t, kind));

export const groupsFor = (kind: Kind): string[] => [
  ...new Set(tasksFor(kind).map((t) => t.group)),
];

/** The project's declared kind, defaulting the way `doctor` does. */
export async function projectKind(root: string): Promise<Kind> {
  const m = await readJson<{ kind?: string }>(join(root, "morpheus.json"));
  const k = m?.kind;
  return k === "company" || k === "personal" || k === "internal" ? k : "personal";
}
