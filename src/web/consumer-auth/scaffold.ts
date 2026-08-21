import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import type { WebSurvey } from "../survey.js";
import { firestoreValue, waitlistThrottle } from "../templates.js";
import { addJwksJoseOverride, CATCH_ALL, mergeDependencies } from "../scaffold.js";
import type { ConsumerAuthContext } from "./context.js";
import * as libs from "./templates-lib.js";
import * as app from "./templates-app.js";
import * as suites from "./templates-tests.js";
import * as config from "./templates-config.js";

/**
 * Write consumer accounts into a project that already ran `morpheus web init`
 * — cpheinrich/morpheus#135, extracted from Evo (darwin-health/evo#58, #62).
 *
 * **Never overwrites**, the same contract as `web init`. The consequence is
 * sharper here, because several files are the *consumer* versions of files
 * `web init` writes in an HQ-only shape — the session route that authenticates
 * without authorising, the two-branch route gate, the two-environment Firebase
 * config. Where one of those exists and differs from this scaffold's version
 * it is reported as **drift**, with the same recovery `web init` prescribes
 * for its own stale files: if the file is unedited scaffold output, delete it
 * and re-run; if it carries local edits, fold the template's changes in by
 * hand (`--check` names each drifted file). Overwriting would be simpler, and
 * would silently destroy exactly the edits that matter.
 *
 * Layers, from the extraction (#135):
 *   A — plumbing, copied verbatim with placeholders (lib/, the shared schema)
 *   B — codified policy (the API routes, the route gate, the rules block)
 *   C — starter surfaces the project owns after scaffold (pages, CSS)
 *   D — the contract: the three suites travel with the scaffold
 *
 * `--check` diffs layers A and B against the current templates. C is excluded
 * because the project owns it; D because projects extend the suites in place,
 * and flagging every added spec as drift would train people to ignore the
 * report.
 */

export type Layer = "plumbing" | "policy" | "starter" | "contract";

export interface PlannedFile {
  /** Repository-relative path. */
  path: string;
  content: string;
  layer: Layer;
}

export interface ConsumerAuthOptions {
  root: string;
  survey: WebSurvey;
  ctx: ConsumerAuthContext;
  /**
   * `web init`'s own rendering of `lib/firebase/config.ts` for this project.
   * When the file on disk is byte-identical to it, it is unedited scaffold
   * output and the one safe upgrade-in-place this command performs: the
   * two-environment config *replaces* it. Without this, the prescribed
   * delete-and-re-run recovery is a dead end for exactly this file — deleting
   * it destroys the only source of the production facts the re-run needs.
   */
  webInitConfig?: string;
}

export interface ConsumerAuthResult {
  written: string[];
  skipped: string[];
  merged: string[];
  /** Files replaced because they were unedited output of an older scaffold. */
  upgraded: string[];
  /** Existing files that differ from the current template. */
  drifted: string[];
  notes: string[];
}

/** Dependencies the generated code imports. */
const APP_DEPENDENCIES = {
  firebase: "^12.16.0",
  "firebase-admin": "^14.2.0",
  jose: "^6.2.4",
  "@vercel/functions": "^3.7.6",
  "google-auth-library": "^10.9.1",
};
const APP_DEV_DEPENDENCIES = { "@playwright/test": "^1.62.1" };
/** The rules suite runs from the repository root. */
const ROOT_DEV_DEPENDENCIES = {
  "@firebase/rules-unit-testing": "^5.0.1",
  firebase: "^12.17.1",
};

/**
 * Plumbing files excluded from drift reporting and `--check`.
 *
 * `deliver()` is a seam by design. The shipped Resend transport is the
 * canonical choice for customer email (architecture §6, decided 2026-08-19),
 * but the seam exists precisely so a project can put a different provider
 * behind it — recording a `deviations` entry — and a drift check that flags a
 * deliberate, recorded swap as permanent drift inverts the report's meaning
 * for exactly this file. The load-bearing part (generate only after
 * `canDeliver()`) is pinned by the templates' own tests, not by
 * byte-comparison here.
 */
const CHECK_EXEMPT = new Set(["lib/email/send.ts", "lib/email/templates.ts"]);

function checkExempt(survey: WebSurvey, path: string): boolean {
  const prefix = survey.webRoot === "." ? "" : `${survey.webRoot}/`;
  return [...CHECK_EXEMPT].some((rel) => path === `${prefix}${rel}`);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Where a unit-test file lands, which depends on the project's test runner.
 *
 * On a `node --test` project the files keep Evo's names. On a vitest project
 * `*.test.mjs` is inside vitest's default include, and vitest cannot run
 * `node:test` suites — it collects the file, finds no tests it recognises, and
 * fails the project's own `pnpm test` the moment the file exists. So there
 * they are named `*.node-test.mjs`, which vitest's default include does not
 * match, and the `test:auth` script names them explicitly — `node --test`
 * runs whatever paths it is given and does not care about the suffix.
 */
export function unitTestPath(survey: WebSurvey, base: string): string {
  const suffix = survey.testRunner === "node" ? "test.mjs" : "node-test.mjs";
  return `__tests__/${base}.${suffix}`;
}

const UNIT_TEST_BASES = ["auth-config", "action-link", "request-safety", "user-profile"] as const;

/**
 * Everything the scaffold writes whole, as (path, content, layer).
 *
 * One list shared by the writer and `--check`, so the two cannot disagree
 * about what the current templates say a file should be.
 */
export function plannedFiles(survey: WebSurvey, ctx: ConsumerAuthContext): PlannedFile[] {
  const web = (rel: string): string =>
    survey.webRoot === "." ? rel : posix.join(survey.webRoot, rel);
  const rulesDir = survey.firestoreRulesPath ? posix.dirname(survey.firestoreRulesPath) : "infra/firebase";

  const plumbing: Array<[string, string]> = [
    [web("lib/firebase/config.ts"), libs.libFirebaseConfig(ctx)],
    [web("lib/firebase/admin.ts"), libs.libFirebaseAdmin(ctx)],
    [web("lib/firebase/client.ts"), libs.libFirebaseClient(ctx)],
    [web("lib/firebase/emulator.ts"), libs.libFirebaseEmulator(ctx)],
    [web("lib/auth/roles.ts"), libs.libAuthRoles(ctx)],
    [web("lib/auth/session-cookie.ts"), libs.libAuthSessionCookie(ctx)],
    [web("lib/auth/current-user.ts"), libs.libAuthCurrentUser(ctx)],
    [web("lib/auth/writing-user.ts"), libs.libAuthWritingUser(ctx)],
    [web("lib/auth/request-origin.ts"), libs.libAuthRequestOrigin(ctx)],
    [web("lib/auth/safe-next.ts"), libs.libAuthSafeNext(ctx)],
    [web("lib/auth/action-link.ts"), libs.libAuthActionLink(ctx)],
    [web("lib/auth/send-action-email.ts"), libs.libAuthSendActionEmail(ctx)],
    [web("lib/auth/session-client.ts"), libs.libAuthSessionClient(ctx)],
    [web("lib/auth/errors.ts"), libs.libAuthErrors(ctx)],
    [web("lib/email/send.ts"), libs.libEmailSend(ctx)],
    [web("lib/email/templates.ts"), libs.libEmailTemplates(ctx)],
    [web("lib/users/decode.ts"), libs.libUsersDecode(ctx)],
    [web("lib/users/store.ts"), libs.libUsersStore(ctx)],
    ["packages/shared/schema/user.ts", libs.sharedUserSchema(ctx)],
    // The store and the reset route lean on two modules `web init` also
    // writes; rendered from its templates so the two scaffolds cannot drift.
    [web("lib/waitlist/firestore-value.ts"), firestoreValue()],
    [web("lib/waitlist/throttle.ts"), waitlistThrottle()],
  ];

  const policy: Array<[string, string]> = [
    [web("app/api/auth/session/route.ts"), app.apiAuthSessionRoute(ctx)],
    [web("app/api/auth/reset-password/route.ts"), app.apiResetPasswordRoute(ctx)],
    [web("app/api/account/route.ts"), app.apiAccountRoute(ctx)],
    [web("app/api/account/verify-email/route.ts"), app.apiVerifyEmailRoute(ctx)],
    [web("proxy.ts"), app.routeGate(ctx)],
  ];

  const starter: Array<[string, string]> = [
    [web("app/sign-in/page.tsx"), app.signInPage(ctx)],
    [web("app/sign-in/SignInForm.tsx"), app.signInForm(ctx)],
    [web("app/sign-in/GoogleButton.tsx"), app.googleButton(ctx)],
    [web("app/sign-up/page.tsx"), app.signUpPage(ctx)],
    [web("app/sign-up/SignUpForm.tsx"), app.signUpForm(ctx)],
    [web("app/reset-password/page.tsx"), app.resetPasswordPage(ctx)],
    [web("app/reset-password/ResetPasswordForm.tsx"), app.resetPasswordForm(ctx)],
    [web("app/auth/action/page.tsx"), app.authActionPage(ctx)],
    [web("app/auth/action/ActionHandler.tsx"), app.authActionHandler(ctx)],
    [web("app/app/layout.tsx"), app.appLayout(ctx)],
    [web("app/app/page.tsx"), app.appPage(ctx)],
    [web("app/app/VerifyBanner.tsx"), app.verifyBanner(ctx)],
    [web("app/app/DisplayNameForm.tsx"), app.displayNameForm(ctx)],
    [web("app/NavAuth.tsx"), app.navAuth(ctx)],
    [web("app/hq/SignOutButton.tsx"), app.signOutButton(ctx)],
    [web("app/consumer-auth.css"), config.consumerAuthCss()],
  ];

  const contract: Array<[string, string]> = [
    [web(unitTestPath(survey, "auth-config")), suites.unitAuthConfigTest(ctx)],
    [web(unitTestPath(survey, "action-link")), suites.unitActionLinkTest(ctx)],
    [web(unitTestPath(survey, "request-safety")), suites.unitRequestSafetyTest(ctx)],
    [web(unitTestPath(survey, "user-profile")), suites.unitUserProfileTest(ctx)],
    [posix.join(rulesDir, "firestore-rules.test.mjs"), suites.rulesTest(ctx)],
    [web("e2e/helpers/emulator.ts"), suites.e2eEmulatorHelper(ctx)],
    [web("e2e/helpers/accounts.ts"), suites.e2eAccountsHelper(ctx)],
    [web("e2e/sign-in.spec.ts"), suites.e2eSignInSpec(ctx)],
    [web("e2e/sign-up-verify.spec.ts"), suites.e2eSignUpVerifySpec(ctx)],
    [web("e2e/password-reset.spec.ts"), suites.e2ePasswordResetSpec(ctx)],
    [web("e2e/session-security.spec.ts"), suites.e2eSessionSecuritySpec(ctx)],
    [web("e2e/unverified-lockout.spec.ts"), suites.e2eUnverifiedLockoutSpec(ctx)],
    [web("playwright.config.ts"), suites.playwrightConfig(ctx)],
    [".firebaserc", config.firebaserc(ctx)],
    [".github/workflows/firebase-tests.yml", config.ciCaller()],
  ];

  const withLayer = (entries: Array<[string, string]>, layer: Layer): PlannedFile[] =>
    entries.map(([path, content]) => ({ path, content, layer }));

  return [
    ...withLayer(plumbing, "plumbing"),
    ...withLayer(policy, "policy"),
    ...withLayer(starter, "starter"),
    ...withLayer(contract, "contract"),
  ];
}

export async function scaffoldConsumerAuth(
  opts: ConsumerAuthOptions,
): Promise<ConsumerAuthResult> {
  const { root, survey, ctx } = opts;
  const written: string[] = [];
  const skipped: string[] = [];
  const merged: string[] = [];
  const upgraded: string[] = [];
  const drifted: string[] = [];
  const notes: string[] = [];

  const configPath = survey.webRoot === "." ? "lib/firebase/config.ts" : `${survey.webRoot}/lib/firebase/config.ts`;

  for (const file of plannedFiles(survey, ctx)) {
    const abs = join(root, file.path);
    if (await exists(abs)) {
      const existing = await readFile(abs, "utf8").catch(() => null);
      if (existing === file.content) {
        skipped.push(file.path);
      } else if (
        file.path === configPath &&
        opts.webInitConfig !== undefined &&
        existing === opts.webInitConfig
      ) {
        // Unedited `web init` output, proven byte-for-byte — the one upgrade
        // in place. Anything else that differs is never touched.
        await writeFile(abs, file.content, "utf8");
        upgraded.push(file.path);
      } else if (
        (file.layer === "plumbing" || file.layer === "policy") &&
        !checkExempt(survey, file.path)
      ) {
        // Starter and contract files are the project's to change; the shared
        // plumbing and policy files are the ones worth naming when they lag.
        drifted.push(file.path);
      } else {
        skipped.push(file.path);
      }
      continue;
    }
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, file.content, "utf8");
    written.push(file.path);
  }

  if (drifted.includes(configPath)) {
    notes.push(
      `${configPath} carries local edits, so it was neither replaced nor safe to ` +
        "delete — it is the source of the production facts a re-run needs. Fold the " +
        "two-environment shape in by hand: PRODUCTION_CONFIG/STAGING_CONFIG, " +
        "resolveEnvironment(), credentialStrategy(), SESSION_COOKIE_NAME, " +
        "SIGNED_IN_HINT_COOKIE_NAME and SESSION_MAX_AGE_MS are what the rest of the " +
        "scaffold imports.",
    );
  }

  if (drifted.length) {
    notes.push(
      "Files marked ≠ exist with different content — usually `web init`'s HQ-only versions, " +
        "which this scaffold supersedes (the session route that also serves consumers, the " +
        "two-branch route gate, the two-environment Firebase config). If a file is unedited " +
        "scaffold output, delete it and re-run; if it carries local edits, fold the template's " +
        "changes in by hand. `morpheus web add-consumer-auth --check` re-prints this list.",
    );
  }

  // --- merges ---------------------------------------------------------------

  const rules = await addConsumerRules(root, survey.firestoreRulesPath);
  if (rules.kind === "merged") merged.push(`${rules.path} (+consumer accounts block)`);
  if (rules.kind === "note") notes.push(rules.message);

  const firebaseJson = await ensureEmulatorsBlock(root, survey.firestoreRulesPath);
  if (firebaseJson.kind === "written") written.push("firebase.json");
  if (firebaseJson.kind === "merged") merged.push("firebase.json (+emulators)");
  if (firebaseJson.kind === "note") notes.push(firebaseJson.message);

  const appDeps = await mergeDependencies(root, survey.webRoot, APP_DEPENDENCIES);
  const appManifest = survey.webRoot === "." ? "package.json" : `${survey.webRoot}/package.json`;
  if (appDeps.length) merged.push(`${appManifest} (+${appDeps.join(", ")})`);

  const appDevDeps = await mergeJson(join(root, appManifest), "devDependencies", APP_DEV_DEPENDENCIES);
  if (appDevDeps.length) merged.push(`${appManifest} (dev +${appDevDeps.join(", ")})`);

  const appScripts = await mergeJson(join(root, appManifest), "scripts", {
    "build:e2e": "NEXT_PUBLIC_USE_EMULATORS=1 next build",
    "test:e2e": "playwright test",
    // Explicit paths: `node --test` runs only the files it is handed, so a
    // suite nothing names runs nowhere — and this one guards the auth layer.
    "test:auth": `node --experimental-strip-types --test ${UNIT_TEST_BASES.map((base) => unitTestPath(survey, base)).join(" ")}`,
  });
  if (appScripts.length) merged.push(`${appManifest} (scripts +${appScripts.join(", ")})`);

  const rootDevDeps = await mergeJson(join(root, "package.json"), "devDependencies", ROOT_DEV_DEPENDENCIES);
  if (rootDevDeps.length) merged.push(`package.json (dev +${rootDevDeps.join(", ")})`);

  const rootScripts = await mergeJson(join(root, "package.json"), "scripts", rootScriptSet(survey, ctx));
  if (rootScripts.length) merged.push(`package.json (scripts +${rootScripts.join(", ")})`);

  if (await addJwksJoseOverride(root)) merged.push("pnpm-workspace.yaml (+jwks-rsa>jose override)");

  const tsconfig = await ensureTsExtensionImports(root, survey.webRoot);
  if (tsconfig.kind === "merged") {
    merged.push(`${survey.webRoot === "." ? "" : `${survey.webRoot}/`}tsconfig.json (+allowImportingTsExtensions)`);
  }
  if (tsconfig.kind === "note") notes.push(tsconfig.message);

  if (await addSharedUserExport(root)) {
    merged.push("packages/shared/package.json (+./schema/user)");
  }

  // --- what only the project can decide --------------------------------------

  if (appDeps.length || appDevDeps.length || rootDevDeps.length) {
    notes.push("Run `pnpm install` — the generated code imports dependencies just added.");
  }

  notes.push(
    "Import the starter styles once, from the app's global stylesheet: " +
      '`@import "./consumer-auth.css";` — then restyle it with the project\'s own tokens.',
  );

  notes.push(
    "Render `<NavAuth />` in the marketing header. It reads the readable hint cookie " +
      "client-side, so the header flips between Sign in and Dashboard without making a " +
      "single static page dynamic. Then extend e2e/sign-in.spec.ts's header assertions, " +
      "which are commented where they belong.",
  );

  if (written.some((path) => path.endsWith(".test.mjs"))) {
    notes.push(
      "Add the four files in __tests__/ to the web app's `test` script — a `node --test` " +
        "project names its files explicitly, so a new one runs nowhere until it is listed.",
    );
  }

  notes.push(
    `Keep ${ctx.stagingHost} out of the index: add an X-Robots-Tag header for it in ` +
      "next.config.ts —\n" +
      "    { source: \"/:path*\", has: [{ type: \"host\", value: \"" + ctx.stagingHost + "\" }],\n" +
      "      headers: [{ key: \"X-Robots-Tag\", value: \"noindex, nofollow\" }] }\n" +
      "  It serves the same pages as production from the same build, and a full duplicate of " +
      "the site on a second domain competes with the real one.",
  );

  notes.push(
    "The console half — the staging Firebase project, providers on both projects, the " +
      "service-account key scoped to Vercel Preview ONLY, Resend domain and keys, the staging " +
      "domain on the Vercel project — is a human runbook: docs/runbooks/consumer-auth.md in " +
      "the Morpheus repo.",
  );

  return { written, skipped, merged, upgraded, drifted, notes };
}

/**
 * `--check`: layers A and B against the current templates.
 *
 * The same regeneration philosophy as `morpheus hq rules --check`: the report
 * says which shared files have drifted from what the templates now say, and
 * exits non-zero so CI can hold a project to it if it chooses.
 */
export async function checkConsumerAuth(opts: ConsumerAuthOptions): Promise<number> {
  const { root, survey, ctx } = opts;
  let drift = 0;

  for (const file of plannedFiles(survey, ctx)) {
    if (file.layer !== "plumbing" && file.layer !== "policy") continue;
    if (checkExempt(survey, file.path)) continue;
    const abs = join(root, file.path);
    if (!(await exists(abs))) {
      console.log(`  – ${file.path} (missing)`);
      drift += 1;
      continue;
    }
    const existing = await readFile(abs, "utf8").catch(() => null);
    if (existing === file.content) {
      console.log(`  · ${file.path}`);
    } else {
      console.log(`  ≠ ${file.path}`);
      drift += 1;
    }
  }

  // The rules block is a merge rather than a whole file, and it is the one
  // security boundary here — so its presence is checked verbatim. No rules
  // file configured is itself drift: a check that skips what is absent
  // reports the empty thing as correct.
  if (survey.firestoreRulesPath) {
    const rules = await readFile(join(root, survey.firestoreRulesPath), "utf8").catch(() => null);
    if (rules?.includes(suites.CONSUMER_RULES_BLOCK.trimEnd())) {
      console.log(`  · ${survey.firestoreRulesPath} (consumer block)`);
    } else {
      console.log(`  ≠ ${survey.firestoreRulesPath} (consumer block absent or altered)`);
      drift += 1;
    }
  } else {
    console.log("  – firestore rules (no deployed rules file is configured)");
    drift += 1;
  }

  if (drift === 0) {
    console.log("\nEvery plumbing and policy file matches the current templates.");
    return 0;
  }
  console.log(
    `\n${drift} file(s) differ from the current templates (– missing, ≠ drifted). ` +
      "A drifted file that is unedited scaffold output can be deleted and re-scaffolded; " +
      "one with local edits needs the template's changes folded in by hand.",
  );
  return 1;
}

/** Root scripts, written so a local run and a CI run are the same line. */
export function rootScriptSet(
  survey: WebSurvey,
  ctx: ConsumerAuthContext,
): Record<string, string> {
  const emulatorEntry =
    survey.webRoot === "."
      ? "lib/firebase/emulator.ts"
      : `${survey.webRoot}/lib/firebase/emulator.ts`;
  const rulesDir = survey.firestoreRulesPath
    ? posix.dirname(survey.firestoreRulesPath)
    : "infra/firebase";
  const rulesTest = posix.join(rulesDir, "firestore-rules.test.mjs");
  // The staging project id everywhere, including plain `emulators:start` —
  // nothing here should ever be one typo away from naming production. For E2E
  // it is also load-bearing: the exec project must match what the client
  // bundle resolves (staging, since VERCEL_ENV is absent at build time), or
  // the Auth emulator files key-based requests under the exec default and one
  // logical account splits across two project ids, 400ing admin lookups.
  const project = ctx.staging.projectId;

  return {
    emulators: `firebase emulators:start --project ${project}`,
    "test:emulator": `firebase emulators:exec --project ${project} "pnpm run test:emulator:run"`,
    // `test:auth` is in the chain even though it needs no emulator: it is how
    // the four unit suites run in CI at all — `node --test` files that nothing
    // names run nowhere, and on a vitest project the app's own `test` script
    // cannot collect them.
    "test:emulator:run": `node --experimental-strip-types ${emulatorEntry} && pnpm --filter ${ctx.scope}/web run --if-present test:auth && pnpm --filter ${ctx.scope}/web run --if-present test:emulator && pnpm run test:rules`,
    "test:rules": `if [ -f ${rulesTest} ]; then node --experimental-strip-types --test ${rulesTest}; fi`,
    "test:e2e": `pnpm --filter ${ctx.scope}/web run build:e2e && firebase emulators:exec --project ${project} "pnpm --filter ${ctx.scope}/web run test:e2e"`,
  };
}

/**
 * Add missing entries to one object field of a JSON manifest.
 *
 * Only ever adds, the same contract as `mergeDependencies`: a value the
 * project already has is the project's decision.
 */
export async function mergeJson(
  path: string,
  field: "scripts" | "devDependencies",
  required: Record<string, string>,
): Promise<string[]> {
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    return [];
  }

  const current = (manifest[field] ?? {}) as Record<string, string>;
  const added: string[] = [];
  for (const [key, value] of Object.entries(required)) {
    if (current[key] !== undefined) continue;
    current[key] = value;
    added.push(key);
  }
  if (!added.length) return [];

  manifest[field] =
    field === "devDependencies"
      ? Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)))
      : current;
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return added;
}

type RulesOutcome =
  | { kind: "merged"; path: string }
  | { kind: "note"; message: string }
  | { kind: "none" };

/**
 * Insert the consumer-accounts block into the deployed rules, above the
 * catch-all — the same anchored merge as the waitlist block, for the same
 * reason: rules are a security boundary, and writing into one at a guessed
 * position is how a `match` lands outside the scope it was meant for.
 */
export async function addConsumerRules(
  root: string,
  rulesPath: string | null,
): Promise<RulesOutcome> {
  if (!rulesPath) {
    return {
      kind: "note",
      message:
        "No deployed Firestore rules file is configured, so the consumer accounts block was " +
        "not written. Run `morpheus init` to scaffold one, then re-run.",
    };
  }

  const path = join(root, rulesPath);
  let existing: string;
  try {
    existing = await readFile(path, "utf8");
  } catch {
    return {
      kind: "note",
      message: `Could not read ${rulesPath}; the consumer accounts block was not written.`,
    };
  }

  // Idempotency and "someone else's block" are different answers, split
  // deliberately: our own block present verbatim is a clean re-run; a foreign
  // /users match means the collection is governed by rules this scaffold has
  // not seen, which is exactly what must not pass silently.
  if (existing.includes(suites.CONSUMER_RULES_BLOCK.trimEnd())) return { kind: "none" };
  if (/match\s+\/users\/\{uid\}/.test(existing)) {
    return {
      kind: "note",
      message:
        `${rulesPath} already declares match /users/{uid}, and it is not this scaffold's ` +
        "block — the consumer rules were NOT inserted, and the users collection is governed " +
        "by whatever that match says. Compare it against the scaffold's block by hand:\n" +
        suites.CONSUMER_RULES_BLOCK.trimEnd(),
    };
  }

  const match = CATCH_ALL.exec(existing);
  if (!match) {
    return {
      kind: "note",
      message:
        `${rulesPath} does not carry the generated catch-all comment, so the consumer ` +
        "accounts block was not inserted at a guessed position. Add it by hand, inside the " +
        "database match scope:\n" +
        suites.CONSUMER_RULES_BLOCK.trimEnd(),
    };
  }

  const insertAt = match.index;
  const content = `${existing.slice(0, insertAt)}\n${suites.CONSUMER_RULES_BLOCK.trimEnd()}\n${existing.slice(insertAt)}`;
  await writeFile(path, content, "utf8");
  return { kind: "merged", path: rulesPath };
}

type FirebaseJsonOutcome =
  | { kind: "written" }
  | { kind: "merged" }
  | { kind: "note"; message: string }
  | { kind: "none" };

/**
 * Make sure `firebase.json` declares the emulators the suites depend on.
 *
 * Ports are load-bearing: the rules suite dials a literal 127.0.0.1:8080, so
 * an existing emulators block is left alone and *reported* when its ports
 * disagree — rewriting a project's ports would break whatever chose them.
 */
export async function ensureEmulatorsBlock(
  root: string,
  rulesPath: string | null,
): Promise<FirebaseJsonOutcome> {
  const path = join(root, "firebase.json");
  const raw = await readFile(path, "utf8").catch(() => null);

  if (raw === null) {
    await writeFile(path, config.firebaseJson(rulesPath ?? "infra/firebase/firestore.rules"), "utf8");
    return { kind: "written" };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {
      kind: "note",
      message:
        "firebase.json is not valid JSON, so the emulators block was not merged. Fix the " +
        "file and re-run, or add the block by hand (auth 9099, firestore 8080, " +
        "singleProjectMode off).",
    };
  }

  if (parsed.emulators !== undefined) {
    const current = parsed.emulators as Record<string, unknown> & {
      auth?: { port?: number };
      firestore?: { port?: number };
    };
    // A declared port that disagrees is a real conflict — the rules suite
    // dials the literals, so rewriting would break whatever chose the ports
    // and keeping them would make the suite hang. An *absent* emulator is not
    // a conflict; a block that declares only `ui` just gains the two it lacks.
    // An absent `port` is the CLI default, which for auth and firestore *is*
    // 9099 / 8080 — not a conflict. Only a declared, different port is.
    const conflicts =
      (current.auth?.port !== undefined && current.auth.port !== 9099) ||
      (current.firestore?.port !== undefined && current.firestore.port !== 8080);
    if (conflicts) {
      return {
        kind: "note",
        message:
          "firebase.json already declares the auth or firestore emulator on different " +
          "ports. The scaffolded suites dial auth 9099 and firestore 8080 — align the " +
          "ports or update the suites, or the rules tests will hang rather than fail.",
      };
    }
    let added = false;
    if (current.auth === undefined) {
      current.auth = { ...config.EMULATORS_BLOCK.auth };
      added = true;
    }
    if (current.firestore === undefined) {
      current.firestore = { ...config.EMULATORS_BLOCK.firestore };
      added = true;
    }
    if (current["singleProjectMode"] === undefined) {
      current["singleProjectMode"] = false;
      added = true;
    }
    if (!added) return { kind: "none" };
    await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    return { kind: "merged" };
  }

  parsed.emulators = config.EMULATORS_BLOCK;
  await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return { kind: "merged" };
}

type TsconfigOutcome = { kind: "merged" } | { kind: "note"; message: string } | { kind: "none" };

/**
 * Make sure the app's tsconfig allows explicit `.ts` import specifiers.
 *
 * The unit-testable modules import their siblings by `./x.ts` path, because
 * `node --experimental-strip-types` resolves neither tsconfig `paths` nor the
 * `@/` alias — and without `allowImportingTsExtensions`, `tsc` refuses those
 * specifiers (TS5097) and `pnpm typecheck` fails on a fresh scaffold. The
 * option requires `noEmit`, which a Next.js tsconfig already sets.
 */
export async function ensureTsExtensionImports(
  root: string,
  webRoot: string,
): Promise<TsconfigOutcome> {
  const path = join(root, webRoot === "." ? "tsconfig.json" : `${webRoot}/tsconfig.json`);
  const raw = await readFile(path, "utf8").catch(() => null);
  if (raw === null) return { kind: "none" };

  if (/allowImportingTsExtensions/.test(raw)) return { kind: "none" };

  let parsed: { compilerOptions?: Record<string, unknown> };
  try {
    parsed = JSON.parse(raw) as { compilerOptions?: Record<string, unknown> };
  } catch {
    // tsconfig.json legitimately carries comments, which JSON.parse refuses —
    // and a rewrite that dropped them would be worse than asking.
    return {
      kind: "note",
      message:
        "The app's tsconfig.json could not be parsed as plain JSON (comments, probably), so " +
        '"allowImportingTsExtensions": true was not added to compilerOptions. Add it by ' +
        "hand — without it, tsc refuses the `./x.ts` import specifiers the unit-testable " +
        "modules use (TS5097) and typecheck fails on the scaffolded code.",
    };
  }

  parsed.compilerOptions = { ...(parsed.compilerOptions ?? {}), allowImportingTsExtensions: true };
  await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return { kind: "merged" };
}

/**
 * Add `./schema/user` to the shared package's explicit exports map — the
 * whitelist that silently makes a file unimportable is worth checking before
 * concluding a pipeline is broken, and this is that check done at write time.
 */
export async function addSharedUserExport(root: string): Promise<boolean> {
  const path = join(root, "packages/shared/package.json");
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    return false;
  }

  const exportsMap = manifest.exports;
  if (!exportsMap || typeof exportsMap !== "object" || Array.isArray(exportsMap)) return false;
  const map = exportsMap as Record<string, unknown>;
  if ("./schema/user" in map) return false;

  manifest.exports = { ...map, "./schema/user": "./schema/user.ts" };
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return true;
}
