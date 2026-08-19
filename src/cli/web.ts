import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { scaffoldWeb } from "../web/scaffold.js";
import { outstanding, provisionWeb, type StepResult } from "../web/provision.js";
import { readFirebaseFacts, surveyWeb, type WebSurvey } from "../web/survey.js";
import { firebaseConfigFile, type FirebaseFacts } from "../web/templates.js";
import { buildContext, environmentFacts } from "../web/consumer-auth/context.js";
import { readTwoEnvFacts } from "../web/consumer-auth/facts.js";
import { checkConsumerAuth, scaffoldConsumerAuth } from "../web/consumer-auth/scaffold.js";
import { configureGoogleAuth } from "./firebase.js";

/**
 * `morpheus web init` — the website initializer.
 *
 * Two halves, in this order: provision the cloud resources, then write the code
 * that depends on them. The order is the point. A sign-in page whose
 * `firebaseConfig` holds placeholders, or a waitlist route pointed at a project
 * that does not exist, would compile and deploy and look finished — and this
 * repository has written down four times what happens when something reports
 * success it did not verify.
 *
 * Deliberately separate from `morpheus init`, which scaffolds the repository
 * and provisions nothing so that it can never be blocked on a token (§12.11).
 * That property survives because the provisioning lives here.
 */

interface Manifest {
  name?: string;
  displayName?: string;
  description?: string;
  domain?: string;
  publicDomain?: string;
  stagingDomain?: string;
  supportEmail?: string;
  prefix?: string;
  kind?: string;
  accounts?: Record<string, string>;
  hq?: { allowlist?: string[]; admins?: string[] };
}

export interface WebInitOptions {
  root: string;
  /** Firebase / GCP project id. Defaults to the manifest's. */
  project?: string;
  /** Public origin, e.g. `https://evo.med`. Defaults to the manifest's. */
  domain?: string;
  /** Google account to provision as. */
  account?: string;
  /** GCP organisation id for a project this run creates. */
  organization?: string;
  /** Vercel team slug. Defaults to `accounts.vercel`. */
  vercelTeam?: string;
  provision: boolean;
  waitlist: boolean;
  hq: boolean;
  openBrowser: boolean;
}

async function manifest(root: string): Promise<Manifest> {
  try {
    return JSON.parse(await readFile(join(root, "morpheus.json"), "utf8")) as Manifest;
  } catch (error) {
    throw new Error(
      `Could not read morpheus.json: ${error instanceof Error ? error.message : String(error)}. ` +
        "Run `morpheus init` first — the website is scaffolded into a Morpheus project, not " +
        "into a bare directory.",
    );
  }
}

const MARK: Record<StepResult["state"], string> = {
  already: "·",
  created: "+",
  skipped: "~",
  blocked: "✗",
};

function printSteps(steps: StepResult[]): void {
  if (!steps.length) return;
  console.log("\n\x1b[1mProvisioning\x1b[0m");
  for (const entry of steps) {
    console.log(`  ${MARK[entry.state]} ${entry.title} \x1b[2m— ${entry.detail}\x1b[0m`);
  }
}

export async function webInit(opts: WebInitOptions): Promise<number> {
  let config: Manifest;
  try {
    config = await manifest(opts.root);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const name = config.displayName?.trim() || config.name?.trim() || "The project";
  const project = opts.project ?? config.accounts?.firebase ?? config.accounts?.gcpProject;
  const domain = opts.domain ?? config.publicDomain ?? config.domain;
  const survey = await surveyWeb(opts.root);

  let firebase: FirebaseFacts | undefined;
  let steps: StepResult[] = [];

  if (opts.provision) {
    if (!project) {
      console.error(
        "No Firebase project id. Pass --project, or set accounts.firebase in morpheus.json.\n" +
          "Ids are globally unique across all of GCP, so the convention is <org>-<app>: dh-evo.",
      );
      return 1;
    }
    const result = await provisionWeb({
      root: opts.root,
      project,
      // Display names under four characters fail with an error that reads like
      // "id taken", which is the wrong thing to go and debug.
      displayName: name.length >= 4 ? name : `${name} app`,
      ...(opts.organization ? { organization: opts.organization } : {}),
      ...(opts.vercelTeam ?? config.accounts?.vercel
        ? { vercelTeam: opts.vercelTeam ?? config.accounts!.vercel! }
        : {}),
      ...(opts.account ? { account: opts.account } : {}),
    });
    steps = result.steps;
    firebase = result.firebase;
  } else {
    // Already scaffolded against a real project: read the facts back out of the
    // config rather than asking Google again. Without this a re-run to pick up
    // an improved template produces nothing at all, which is the opposite of
    // what a never-overwrite scaffold is for.
    firebase = (await readFirebaseFacts(opts.root, survey.webRoot)) ?? undefined;
    console.log(
      firebase
        ? `Skipping provisioning; using the recorded config for ${firebase.projectId}.`
        : "Skipping provisioning, and no usable lib/firebase/config.ts was found.",
    );
  }

  const { written, skipped, merged, notes } = await scaffoldWeb({
    root: opts.root,
    survey,
    name,
    description: config.description?.trim() || `${name} — coming soon.`,
    scope: `@${config.name ?? "app"}`,
    ...(firebase ? { firebase } : {}),
    waitlist: opts.waitlist,
    hq: opts.hq,
  });

  console.log(`\n\x1b[1m${name}\x1b[0m \x1b[2m· ${survey.webRoot}\x1b[0m`);
  printSteps(steps);

  if (written.length) {
    console.log(`\n\x1b[32mCreated ${written.length} file(s)\x1b[0m`);
    for (const file of written) console.log(`  ${file}`);
  }
  if (merged.length) {
    console.log(`\n\x1b[33mMerged into ${merged.length} existing file(s)\x1b[0m`);
    for (const file of merged) console.log(`  ${file}`);
  }
  if (skipped.length) {
    console.log(`\n\x1b[2mLeft ${skipped.length} existing file(s) untouched:\x1b[0m`);
    for (const file of skipped) console.log(`  \x1b[2m${file}\x1b[0m`);
  }
  for (const note of notes) console.log(`\n\x1b[2m${note}\x1b[0m`);

  // Google sign-in last: it is the only step that can need a human at a consent
  // screen, and everything before it is worth keeping even if this stops.
  let authExit = 0;
  if (opts.hq && firebase && domain) {
    console.log("\n\x1b[1mGoogle sign-in\x1b[0m");
    authExit = await configureGoogleAuth(opts.root, {
      project: firebase.projectId,
      domain,
      openBrowser: opts.openBrowser,
    });
  } else if (opts.hq && firebase && !domain) {
    console.log(
      "\n\x1b[2mSkipped Google sign-in setup: no public origin. Set `domain` in " +
        "morpheus.json or pass --domain, then run `morpheus firebase auth setup`.\x1b[0m",
    );
  }

  const blocked = outstanding(steps);
  if (blocked.length) {
    console.log("\n\x1b[33mStill outstanding\x1b[0m");
    for (const entry of blocked) console.log(`  ${MARK[entry.state]} ${entry.title} — ${entry.detail}`);
  }

  if (!survey.vercelLinked) {
    console.log(
      "\n\x1b[2mNo .vercel/project.json. Run `vercel link` in the web app, and set the " +
        "project's Root Directory — a monorepo deploys the wrong thing until it is set, " +
        "and the failure looks like a build error.\x1b[0m",
    );
  }

  return blocked.some((entry) => entry.state === "blocked") || authExit !== 0 ? 1 : 0;
}

function line(label: string, value: boolean | string | null): string {
  const mark = value === true ? "\x1b[32m✓\x1b[0m" : value === false || value === null ? "\x1b[33m·\x1b[0m" : " ";
  const detail = typeof value === "string" ? value : value ? "yes" : "no";
  return `  ${mark} ${label} \x1b[2m— ${detail}\x1b[0m`;
}

/** What the web surface has, and what it does not. Read-only. */
export async function webStatus(root: string): Promise<number> {
  const survey: WebSurvey = await surveyWeb(root);
  console.log(`\n\x1b[1mWeb surface\x1b[0m \x1b[2m· ${survey.webRoot}\x1b[0m`);
  console.log(line("Next.js app", survey.webAppExists));
  console.log(line("Firebase web config", survey.hasFirebaseConfig));
  console.log(line("Waitlist capture", survey.hasWaitlist));
  console.log(line("Google sign-in page", survey.hasSignIn));
  console.log(line("/hq route", survey.hasHqRoute));
  console.log(line("Route gate", survey.hasRouteGate));
  console.log(line("Firestore rules", survey.firestoreRulesPath ?? "none configured"));
  console.log(line("Vercel linked", survey.vercelLinked));
  if (survey.staticExport) {
    console.log(
      '\n\x1b[33mThis app sets `output: "export"` — HTML only, no route handlers, no route ' +
        "gate, no server rendering. The waitlist endpoint and /hq cannot run under it.\x1b[0m",
    );
  }

  const missing = !survey.hasWaitlist || !survey.hasHqRoute || !survey.hasFirebaseConfig;
  if (missing) console.log("\n\x1b[2mRun `morpheus web init` to add what is missing.\x1b[0m");
  return 0;
}

// ---------------------------------------------------------------------------
// morpheus web add-consumer-auth
// ---------------------------------------------------------------------------

export interface AddConsumerAuthOptions {
  root: string;
  /** Staging Firebase / GCP project id. Defaults to the manifest's pair. */
  stagingProject?: string;
  /** Google account to provision the staging project as. */
  account?: string;
  provision: boolean;
  /** Report drift against the current templates instead of writing. */
  check: boolean;
}

/**
 * `morpheus web add-consumer-auth` — consumer accounts on the Morpheus stack
 * contract, extracted from Evo (cpheinrich/morpheus#135).
 *
 * Builds on `web init` the way Evo's consumer accounts built on its HQ auth:
 * the app, the shared package, the `@/` alias, the production Firebase project
 * and its Workload Identity are all assumed to exist, because `web init` (and
 * the console runbook) is where they come from. What this adds is the second
 * Firebase project's config, the auth plumbing, the consumer policy routes,
 * the starter surfaces, and the three test suites that hold it all.
 */
export async function webAddConsumerAuth(opts: AddConsumerAuthOptions): Promise<number> {
  let config: Manifest;
  try {
    config = await manifest(opts.root);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const name = config.displayName?.trim() || config.name?.trim();
  const publicDomain = config.publicDomain ?? config.domain;
  const { stagingDomain, supportEmail } = config;

  const missing: string[] = [];
  if (!name) missing.push("name (or displayName)");
  if (!publicDomain) missing.push("publicDomain");
  if (!stagingDomain) missing.push("stagingDomain");
  if (!supportEmail) missing.push("supportEmail");
  if (missing.length) {
    console.error(
      `morpheus.json is missing ${missing.join(", ")}. Consumer auth reads all of them: the ` +
        "two origins anchor the known-host allowlist and the mailed action links, and the " +
        "support email lands in firebase.json's OAuth brand block.",
    );
    return 1;
  }

  const survey = await surveyWeb(opts.root);
  if (!survey.webAppExists) {
    console.error("No web app found. Run `morpheus web init` first — consumer auth extends it.");
    return 1;
  }
  if (survey.webRoot === ".") {
    // A root-level app makes the app manifest and the root manifest one file,
    // so the app's `test:e2e` would claim the name before the emulator-wrapped
    // root script could — and CI would run Playwright against no emulators,
    // silently. The scripts, the pnpm --filter calls and the CI caller all
    // assume the canonical layout; refusing is a sentence, threading a special
    // case through all three is a standing hazard.
    console.error(
      "This app lives at the repository root. Consumer auth assumes the canonical " +
        "apps/web layout (§3) — the root package.json must stay free for the " +
        "emulator-wrapping scripts. Move the app to apps/web and re-run.",
    );
    return 1;
  }
  if (survey.alias !== "@/") {
    console.error(
      "The web app's tsconfig does not declare the `@/*` path alias, which every generated " +
        "file imports through. Add it (\"@/*\": [\"./*\"] under compilerOptions.paths) and re-run.",
    );
    return 1;
  }
  if (!survey.shared) {
    console.error(
      "No packages/shared workspace package. The user schema is product vocabulary and lives " +
        "there (§14.1), and the generated code imports it — scaffold the package and re-run.",
    );
    return 1;
  }
  if (survey.staticExport) {
    console.error(
      'This app sets `output: "export"` — HTML only, no route handlers, no route gate. ' +
        "Consumer auth cannot run under it; see `morpheus web status`.",
    );
    return 1;
  }

  // --- the two projects' facts ----------------------------------------------

  const recorded = await readTwoEnvFacts(opts.root, survey.webRoot);
  const single = recorded.production ? null : await readFirebaseFacts(opts.root, survey.webRoot);
  const production = recorded.production ?? (single ? environmentFacts(single) : null);
  const workloadIdentity =
    recorded.workloadIdentity ?? single?.workloadIdentity ?? null;

  if (!production || !workloadIdentity) {
    console.error(
      "Could not read the production Firebase facts (including Workload Identity) from " +
        "lib/firebase/config.ts. Run `morpheus web init` first — it provisions the production " +
        "project and federation, and writes the config this command extends.",
    );
    return 1;
  }

  let staging = recorded.staging;
  let steps: StepResult[] = [];
  const stagingProject =
    opts.stagingProject ??
    config.accounts?.["firebaseStaging"] ??
    config.accounts?.["gcpProjectStaging"];

  if (!staging) {
    if (!stagingProject) {
      console.error(
        "No staging project id. Pass --staging-project, or set accounts.firebaseStaging in " +
          "morpheus.json. Ids are globally unique, so the convention is <prod-id>-staging.",
      );
      return 1;
    }
    if (opts.check) {
      console.error(
        "--check needs both environments readable from lib/firebase/config.ts, and the " +
          "staging block is missing — scaffold first, then check.",
      );
      return 1;
    }
    if (!opts.provision) {
      console.error(
        "The staging project's SDK config is not recorded and --no-provision was passed, so " +
          "there is nothing to write the two-environment config from.",
      );
      return 1;
    }
    // Same provisioning as `web init`, pointed at the staging id. No
    // vercelTeam, deliberately: federation is a production-only credential, and
    // staging authenticates with a key scoped to Vercel's Preview environment
    // (the runbook says why — in Production that key silently reroutes
    // production traffic to staging data).
    const result = await provisionWeb({
      root: opts.root,
      project: stagingProject,
      displayName: `${name!} Staging`,
      ...(opts.account ? { account: opts.account } : {}),
    });
    steps = result.steps;
    staging = result.firebase ? environmentFacts(result.firebase) : null;
    if (!staging) {
      printSteps(steps);
      console.error("\nProvisioning did not produce the staging SDK config; nothing written.");
      return 1;
    }
  }

  const ctx = buildContext({
    name: name!,
    sharedPackageName: survey.shared.name,
    publicDomain: publicDomain!,
    stagingDomain: stagingDomain!,
    supportEmail: supportEmail!,
    production,
    staging,
    workloadIdentity,
    webRoot: survey.webRoot,
  });

  if (opts.check) {
    console.log(`\n\x1b[1mConsumer auth — template drift\x1b[0m \x1b[2m· ${survey.webRoot}\x1b[0m`);
    return checkConsumerAuth({ root: opts.root, survey, ctx });
  }

  // What `web init` would have written for this project's facts. If the file
  // on disk matches it byte-for-byte, it is unedited scaffold output and the
  // scaffold may upgrade it in place to the two-environment shape — the one
  // file where "delete and re-run" would otherwise destroy the facts the
  // re-run needs.
  const webInitConfig = single ? firebaseConfigFile(single) : undefined;

  const { written, skipped, merged, upgraded, drifted, notes } = await scaffoldConsumerAuth({
    root: opts.root,
    survey,
    ctx,
    ...(webInitConfig !== undefined ? { webInitConfig } : {}),
  });

  console.log(`\n\x1b[1m${name} · consumer auth\x1b[0m \x1b[2m· ${survey.webRoot}\x1b[0m`);
  printSteps(steps);

  if (written.length) {
    console.log(`\n\x1b[32mCreated ${written.length} file(s)\x1b[0m`);
    for (const file of written) console.log(`  ${file}`);
  }
  if (merged.length) {
    console.log(`\n\x1b[33mMerged into ${merged.length} existing file(s)\x1b[0m`);
    for (const file of merged) console.log(`  ${file}`);
  }
  if (upgraded.length) {
    console.log(`\n\x1b[33mUpgraded ${upgraded.length} unedited scaffold file(s) in place\x1b[0m`);
    for (const file of upgraded) console.log(`  ${file}`);
  }
  if (drifted.length) {
    console.log(`\n\x1b[33m${drifted.length} existing file(s) differ from the templates:\x1b[0m`);
    for (const file of drifted) console.log(`  ≠ ${file}`);
  }
  if (skipped.length) {
    console.log(`\n\x1b[2mLeft ${skipped.length} existing file(s) untouched:\x1b[0m`);
    for (const file of skipped) console.log(`  \x1b[2m${file}\x1b[0m`);
  }
  for (const note of notes) console.log(`\n\x1b[2m${note}\x1b[0m`);

  const blocked = outstanding(steps);
  if (blocked.length) {
    console.log("\n\x1b[33mStill outstanding\x1b[0m");
    for (const entry of blocked) console.log(`  ${MARK[entry.state]} ${entry.title} — ${entry.detail}`);
  }

  return blocked.some((entry) => entry.state === "blocked") ? 1 : 0;
}
