import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import * as t from "./templates.js";
import type { FirebaseFacts } from "./templates.js";
import { importPath, waitlistSchemaLocation, type WebSurvey } from "./survey.js";

/**
 * Write the website: a Next.js app, the waitlist, and the `/hq` gate.
 *
 * **Never overwrites**, the same contract as `morpheus init` — every existing
 * file is skipped and reported. That is what makes "create the website" and
 * "add the missing half to a site that has been live for months" the same
 * command: Evo already had a home page, a token pipeline and a Vercel link, and
 * a scaffold that could only run on an empty directory would have been useless
 * to it.
 *
 * Three files are *merged* rather than skipped, because skipping them would
 * leave the generated code unable to resolve: the app's `package.json`
 * dependencies, the shared package's `exports` map, and the Firestore rules.
 * Each merge adds only what is missing and each is reported.
 *
 * **The Firebase-dependent half is written only when a Firebase project is
 * real.** A sign-in page whose `firebaseConfig` holds placeholder strings looks
 * finished and cannot work, which is the failure mode this repository keeps
 * writing rules against — a check that reports an empty thing as correct.
 */

export interface ScaffoldOptions {
  root: string;
  survey: WebSurvey;
  /** Display name, e.g. `Evo`. */
  name: string;
  /** One line for the home page and metadata, when a new app is created. */
  description: string;
  /** Package scope for a new app, e.g. `@evo`. */
  scope: string;
  /** Present once a Firebase project exists and its SDK config was read. */
  firebase?: FirebaseFacts;
  /** Email domain named on the sign-in page, e.g. `darwin.health`. */
  emailDomain?: string;
  waitlist: boolean;
  hq: boolean;
}

export interface ScaffoldResult {
  written: string[];
  skipped: string[];
  merged: string[];
  notes: string[];
}

/** Dependencies the generated code imports, by what it is generated for. */
const WAITLIST_DEPENDENCIES = { "firebase-admin": "^14.2.0" };
const HQ_DEPENDENCIES = {
  firebase: "^12.16.0",
  "firebase-admin": "^14.2.0",
  jose: "^6.2.4",
};
const WORKLOAD_IDENTITY_DEPENDENCIES = {
  "@vercel/functions": "^3.7.6",
  "google-auth-library": "^10.9.1",
};

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function scaffoldWeb(opts: ScaffoldOptions): Promise<ScaffoldResult> {
  const { root, survey, name } = opts;
  const written: string[] = [];
  const skipped: string[] = [];
  const merged: string[] = [];
  const notes: string[] = [];

  const schema = waitlistSchemaLocation(survey);
  const ctx: t.TemplateContext = {
    name,
    imp: (from, to) => importPath(survey, from, to),
    schema: (from) => schema.specifier(from),
    ...(opts.firebase ? { firebase: opts.firebase } : {}),
  };

  /** Write a repository-relative path, or report that it was already there. */
  const put = async (rel: string, content: string): Promise<void> => {
    const abs = join(root, rel);
    if (await exists(abs)) {
      skipped.push(rel);
      return;
    }
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
    written.push(rel);
  };

  /** Write a path inside the web app. */
  const app = (rel: string, content: string): Promise<void> =>
    put(survey.webRoot === "." ? rel : `${survey.webRoot}/${rel}`, content);

  // --- a new app, only when there is not one already ------------------------
  if (!survey.webAppExists) {
    await app("package.json", t.appPackageJson(opts.scope, survey.shared?.name));
    await app("tsconfig.json", t.appTsconfig());
    await app("next.config.ts", t.nextConfig());
    await app("postcss.config.mjs", t.postcssConfig());
    await app("app/globals.css", t.globalsCss());
    await app("app/layout.tsx", t.rootLayout(name, opts.description));
    notes.push(
      "Created a Next.js app. Run `pnpm install` from the repository root before " +
        "`pnpm dev`, and add the app to pnpm-workspace.yaml if it is not covered by an " +
        "existing glob.",
    );
  }

  // --- waitlist -------------------------------------------------------------
  if (opts.waitlist) {
    if (!opts.firebase) {
      notes.push(
        "Skipped the waitlist: it writes to Firestore, and no Firebase project is known " +
          "yet. Provision one (`morpheus web init` without --no-provision), then re-run.",
      );
    } else {
      await put(schema.path, t.waitlistSchema());
      await app("lib/waitlist/record.ts", t.waitlistRecord(ctx));
      await app("lib/waitlist/throttle.ts", t.waitlistThrottle());
      await app("lib/waitlist/store.ts", t.waitlistStore(ctx));
      await app("app/api/waitlist/route.ts", t.waitlistRoute(ctx));
      await app("app/WaitlistForm.tsx", t.waitlistForm(ctx));

      if (survey.testRunner) {
        await app(
          "__tests__/waitlist-record.test.ts",
          t.waitlistRecordTest(ctx, survey.testRunner),
        );
      } else {
        notes.push(
          "No test runner detected in the web app, so no test was generated. " +
            "`lib/waitlist/record.ts` is pure and is the module worth covering.",
        );
      }

      if (!survey.webAppExists) {
        await app("app/page.tsx", t.homePage(ctx, name, opts.description));
      } else {
        notes.push(
          "The home page was left alone. Render `<WaitlistForm source=\"hero\" />` where " +
            "the page currently asks for nothing — a `mailto:` link or an anchor to " +
            "another section is the usual thing it replaces.",
        );
      }

      notes.push(
        "Wire a `waitlist_joined` event into the project's analytics contract and pass " +
          "it to the form's `onJoined` prop. The form deliberately imports no analytics " +
          "module: the event name belongs to the project's vocabulary, not to Morpheus.",
      );
    }
  }

  // --- /hq and Google sign-in ----------------------------------------------
  if (opts.hq) {
    if (!opts.firebase) {
      notes.push(
        "Skipped /hq: Google sign-in needs a Firebase project, and none is known yet. " +
          "A sign-in page with a placeholder config looks finished and cannot work.",
      );
    } else {
      await app("lib/firebase/config.ts", t.firebaseConfigFile(opts.firebase));
      await app("lib/firebase/client.ts", t.firebaseClient(ctx));
      await app("lib/firebase/admin.ts", t.firebaseAdmin(ctx, opts.firebase));
      await app("lib/auth/roles.ts", t.authRoles());
      await app("lib/auth/session-cookie.ts", t.authSessionCookie(ctx));
      await app("lib/auth/current-user.ts", t.authCurrentUser(ctx));
      await app("app/api/auth/session/route.ts", t.apiAuthSession(ctx, name));
      await app("app/sign-in/page.tsx", t.signInPage(ctx, name, opts.emailDomain));
      await app("app/sign-in/SignInForm.tsx", t.signInForm(ctx));
      await app("app/hq/layout.tsx", t.hqLayout(ctx, name));
      await app("app/hq/page.tsx", t.hqPage(ctx, name));
      await app("app/hq/SignOutButton.tsx", t.signOutButton(ctx));
      await app("app/hq/no-access/page.tsx", t.noAccessPage());

      if (survey.hasRouteGate) {
        notes.push(
          "An existing proxy.ts or middleware.ts was left untouched. Add the `/hq` " +
            "matcher and the session check to it by hand — two gates on one route is " +
            "worse than one, and only one of them can be first.",
        );
      } else {
        await app("proxy.ts", t.routeGate(ctx));
      }

      notes.push(
        "Grant the team their roles with `morpheus access sync`. Until that runs, a " +
          "signed-in account has no `role` claim and /hq refuses it — which is the gate " +
          "working, not a broken sign-in.",
      );
    }
  }

  await app(".env.example", t.envExample(opts.firebase));

  // --- merges ---------------------------------------------------------------
  if (opts.firebase) {
    const dependencies = {
      ...(opts.waitlist ? WAITLIST_DEPENDENCIES : {}),
      ...(opts.hq ? HQ_DEPENDENCIES : {}),
      ...(opts.firebase.workloadIdentity ? WORKLOAD_IDENTITY_DEPENDENCIES : {}),
    };
    const added = await mergeDependencies(root, survey.webRoot, dependencies);
    if (added.length) {
      merged.push(
        `${survey.webRoot === "." ? "" : `${survey.webRoot}/`}package.json (+${added.join(", ")})`,
      );
      notes.push("Run `pnpm install` — the generated code imports dependencies just added.");
    }

    if (survey.shared && !survey.shared.exportsWaitlist && survey.shared.hasExportsMap) {
      const path = `${survey.shared.dir}/package.json`;
      if (await addSharedExport(root, path)) merged.push(`${path} (+./schema/waitlist)`);
    }
  }

  if (opts.waitlist && opts.firebase) {
    const rules = await addWaitlistRules(root, survey.firestoreRulesPath);
    if (rules.kind === "merged") merged.push(`${rules.path} (+waitlist deny block)`);
    if (rules.kind === "note") notes.push(rules.message);
  }

  return { written, skipped, merged, notes };
}

/**
 * Add missing dependencies to the web app's manifest.
 *
 * Only ever adds. A version already pinned by the project is the project's
 * decision, and an initializer that quietly moved `next` would be changing the
 * thing it was asked to extend.
 */
export async function mergeDependencies(
  root: string,
  webRoot: string,
  required: Record<string, string>,
): Promise<string[]> {
  const path = join(root, webRoot === "." ? "package.json" : `${webRoot}/package.json`);
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    return [];
  }

  const current = (manifest.dependencies ?? {}) as Record<string, string>;
  const devCurrent = (manifest.devDependencies ?? {}) as Record<string, string>;
  const added: string[] = [];
  const next = { ...current };
  for (const [dependency, range] of Object.entries(required)) {
    if (current[dependency] || devCurrent[dependency]) continue;
    next[dependency] = range;
    added.push(dependency);
  }
  if (!added.length) return [];

  manifest.dependencies = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return added;
}

/**
 * Add `./schema/waitlist` to a shared package whose `exports` map is explicit.
 *
 * An explicit map is a closed list: a subpath it does not name cannot be
 * imported at all, so the schema file would exist and resolve nowhere.
 */
async function addSharedExport(root: string, relativePath: string): Promise<boolean> {
  const path = join(root, relativePath);
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    return false;
  }

  const exportsMap = manifest.exports;
  if (!exportsMap || typeof exportsMap !== "object" || Array.isArray(exportsMap)) return false;
  const map = exportsMap as Record<string, unknown>;
  if ("./schema/waitlist" in map) return false;

  manifest.exports = { ...map, "./schema/waitlist": "./schema/waitlist.ts" };
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return true;
}

/** Anchor the insertion on the catch-all, which every generated rules file ends with. */
const CATCH_ALL = /\n([ \t]*)\/\/ Anything not named above is closed/;

type RulesOutcome =
  | { kind: "merged"; path: string }
  | { kind: "note"; message: string }
  | { kind: "none" };

/**
 * Add the waitlist deny block to the deployed rules.
 *
 * Written out explicitly rather than left to the catch-all: a collection closed
 * by omission looks like an oversight, and the next person wanting a signup
 * form would "fix" it by opening it up.
 *
 * Inserted only above an anchor this function can actually find. Rules are a
 * security boundary, and writing into one at a guessed position is how a
 * `match` block ends up outside the `service` scope it was meant to be inside —
 * the same reason `updateRoleHelpers` refuses a file with no markers.
 */
export async function addWaitlistRules(
  root: string,
  rulesPath: string | null,
): Promise<RulesOutcome> {
  if (!rulesPath) {
    return {
      kind: "note",
      message:
        "No deployed Firestore rules file is configured, so the waitlist deny block was " +
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
      message: `Could not read ${rulesPath}; the waitlist deny block was not written.`,
    };
  }

  if (/match\s+\/waitlist\//.test(existing)) return { kind: "none" };

  const match = CATCH_ALL.exec(existing);
  if (!match) {
    return {
      kind: "note",
      message:
        `${rulesPath} does not carry the generated catch-all comment, so the waitlist ` +
        "deny block was not inserted at a guessed position. Add it by hand, inside the " +
        "database match scope:\n" +
        t.WAITLIST_RULES_BLOCK.trimEnd(),
    };
  }

  const insertAt = match.index;
  const content = `${existing.slice(0, insertAt)}\n${t.WAITLIST_RULES_BLOCK.trimEnd()}\n${existing.slice(insertAt)}`;
  await writeFile(path, content, "utf8");
  return { kind: "merged", path: rulesPath };
}
