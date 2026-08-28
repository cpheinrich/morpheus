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
  "morpheus-kit": "github:cpheinrich/morpheus#main",
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
    relative: (from, to) => importPath({ alias: null }, from, to),
    waitlistEndpoint: survey.trailingSlash ? "/api/waitlist/" : "/api/waitlist",
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

  // A static export has no server at all, so both halves below would be
  // written, compile, and then fail the project's next build. Refusing here
  // makes that a sentence instead of a build log — and the fix is a decision
  // about how the site deploys, which is not one a scaffold may take.
  const serverless = survey.staticExport && survey.webAppExists;
  if (serverless && (opts.waitlist || opts.hq)) {
    notes.push(
      "This app sets `output: \"export\"`, which builds HTML and nothing else — no route " +
        "handlers, no route gate, no server rendering. The waitlist endpoint and /hq cannot " +
        "run under it, so neither was written. Removing `output: \"export\"` puts the app on " +
        "the canonical Vercel stack (§10.2) and keeps every page that has no dynamic API " +
        "statically prerendered; keep `trailingSlash` as it is so no live URL moves.",
    );
  }

  // --- waitlist -------------------------------------------------------------
  if (opts.waitlist && !serverless) {
    if (!opts.firebase) {
      notes.push(
        "Skipped the waitlist: it writes to Firestore, and no Firebase project is known " +
          "yet. Provision one (`morpheus web init` without --no-provision), then re-run.",
      );
    } else {
      await put(schema.path, t.waitlistSchema());
      await app("lib/waitlist/record.ts", t.waitlistRecord(ctx));
      await app("lib/waitlist/firestore-value.ts", t.firestoreValue());
      await app("lib/waitlist/throttle.ts", t.waitlistThrottle());
      await app("lib/waitlist/store.ts", t.waitlistStore(ctx));
      await app("app/api/waitlist/route.ts", t.waitlistRoute(ctx));
      await app("app/WaitlistForm.tsx", t.waitlistForm(ctx));

      if (survey.testRunner) {
        const test = t.waitlistRecordTest(ctx, survey.testRunner);
        await app(test.path, test.content);
        if (survey.testRunner === "node") {
          notes.push(
            `Add ${test.path} to the web app's \`test\` script — a \`node --test\` project ` +
              "names its files explicitly, so a new one runs nowhere until it is listed.",
          );
        }
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

      notes.push(
        "The signup write needs `roles/datastore.user` on whichever identity the deployment " +
          "runs as. It goes over the Firestore REST API rather than through " +
          "`firebase-admin`'s Firestore client, which rejects a federated credential — so a " +
          "403 here is a missing role, not the credential shape.",
      );
    }
  }

  // --- /hq and Google sign-in ----------------------------------------------
  if (opts.hq && !serverless) {
    if (!opts.firebase) {
      notes.push(
        "Skipped /hq: Google sign-in needs a Firebase project, and none is known yet. " +
          "A sign-in page with a placeholder config looks finished and cannot work.",
      );
    } else {
      await app("lib/firebase/config.ts", t.firebaseConfigFile(opts.firebase));

      // Never-overwrite has one sharp edge, and this is it. An earlier run whose
      // federation step failed wrote a config with no `WORKLOAD_IDENTITY` block;
      // a later run that provisions federation successfully then *keeps* that
      // file, and the deployment silently falls back to Application Default
      // Credentials — which do not exist on Vercel. Local dev works, production
      // does not, and nothing says so. Reported rather than rewritten: the file
      // may have been edited since.
      if (opts.firebase.workloadIdentity) {
        const stale: string[] = [];
        for (const [file, marker] of [
          ["lib/firebase/config.ts", "WORKLOAD_IDENTITY"],
          ["lib/firebase/admin.ts", "workloadIdentity"],
        ] as const) {
          const path = join(root, survey.webRoot === "." ? file : `${survey.webRoot}/${file}`);
          const existing = await readFile(path, "utf8").catch(() => "");
          if (existing && !existing.includes(marker)) stale.push(file);
        }
        if (stale.length) {
          notes.push(
            `${stale.join(" and ")} predate${stale.length === 1 ? "s" : ""} this run's Workload ` +
              "Identity setup and carr" +
              (stale.length === 1 ? "ies" : "y") +
              " no federation branch, so the deployment would fall back to Application Default " +
              "Credentials — which Vercel does not have. Delete them and re-run; they are " +
              "generated, and nothing here rewrites a file you may have edited.",
          );
        }
      }
      await app("lib/firebase/client.ts", t.firebaseClient(ctx));
      await app("lib/firebase/admin.ts", t.firebaseAdmin(ctx, opts.firebase));
      await app("lib/auth/roles.ts", t.authRoles());
      await app("lib/auth/session-cookie.ts", t.authSessionCookie(ctx));
      await app("lib/auth/current-user.ts", t.authCurrentUser(ctx));
      await app("app/api/auth/session/route.ts", t.apiAuthSession(ctx, name));
      await app("app/sign-in/page.tsx", t.signInPage(ctx, name));
      await app("app/sign-in/SignInForm.tsx", t.signInForm(ctx));
      await app("app/hq/layout.tsx", t.hqLayout(ctx, name));
      await app("app/hq/page.tsx", t.hqPage(ctx, name));
      await app("app/hq/HqSearch.tsx", t.hqSearch(name));
      await app("app/hq/search-index/route.ts", t.hqSearchRoute(ctx));
      await app("app/hq/SignOutButton.tsx", t.signOutButton(ctx));
      await app("app/hq/no-access/page.tsx", t.noAccessPage());
      await app("lib/hq/search.ts", t.hqSearchBuild(name));

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

  // Documents server credentials, so it belongs to the half a static export
  // does not have.
  if (!serverless) await app(".env.example", t.envExample(opts.firebase));

  // --- merges ---------------------------------------------------------------
  if (opts.firebase && !serverless) {
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

    if (opts.hq) {
      const override = await addJwksJoseOverride(root);
      if (override) merged.push("pnpm-workspace.yaml (+jwks-rsa>jose override)");
    }

    if (survey.shared && !survey.shared.exportsWaitlist && survey.shared.hasExportsMap) {
      const path = `${survey.shared.dir}/package.json`;
      if (await addSharedExport(root, path)) merged.push(`${path} (+./schema/waitlist)`);
    }
  }

  if (opts.waitlist && opts.firebase && !serverless) {
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

/**
 * Pin `jose@5` for `jwks-rsa` in the workspace.
 *
 * This is the difference between `/hq` working and returning 500 in production,
 * and nothing in the repository would tell you why. `firebase-admin@14` pulls
 * `jwks-rsa@4`, which is CommonJS and does a plain `require('jose')`; `jose@6`
 * is ESM-only, so that require needs `require(esm)` — and Vercel's Node runtime
 * launches functions with `--no-experimental-require-module`, so it is off there
 * whatever the Node version. `firebase-admin/auth` then cannot load at all, and
 * the session route fails before it reaches the credential or the role check.
 *
 * `jose@5` ships a real CJS build and `jwks-rsa` only uses `importJWK` and
 * `exportSPKI`, unchanged between 5 and 6. The pin is scoped to `jwks-rsa`, so
 * the app keeps `jose@6` for its own Edge route gate.
 *
 * Darwin found this in production and carried the fix in its own workspace file.
 * It is here because the second project to need it should not have to find it
 * the same way. Appended textually rather than through a YAML round-trip: this
 * file carries comments that explain a lockfile, and a rewrite would drop them.
 */
export async function addJwksJoseOverride(root: string): Promise<boolean> {
  const path = join(root, "pnpm-workspace.yaml");
  const existing = await readFile(path, "utf8").catch(() => null);
  if (existing === null || /jwks-rsa>jose/.test(existing)) return false;

  // Only when the file has no `overrides:` block of its own. Merging into one
  // means understanding its indentation, and getting that wrong silently
  // changes which package the pin applies to.
  if (/^overrides:/m.test(existing)) return false;

  const block = [
    "",
    "# firebase-admin@14 pulls jwks-rsa@4, which is CommonJS and does a plain",
    "# `require('jose')`. jose@6 is ESM-only, and Vercel's Node runtime disables",
    "# require(esm), so firebase-admin/auth cannot load in a function at all and",
    "# the session route returns 500 before it reaches the role check.",
    "#",
    "# jose@5 ships a real CJS build and jwks-rsa only uses importJWK/exportSPKI,",
    "# unchanged between 5 and 6. Scoped to jwks-rsa; the app keeps jose@6 for its",
    "# own Edge route gate. Remove when firebase-admin ships a jwks-rsa that does",
    "# not require(esm).",
    "overrides:",
    "  jwks-rsa>jose: ^5.10.0",
    "",
  ].join("\n");

  await writeFile(path, `${existing.trimEnd()}\n${block}`, "utf8");
  return true;
}

/**
 * Anchor the insertion on the catch-all, which every generated rules file ends
 * with. Exported for the consumer-auth scaffold, whose rules merge anchors on
 * the same comment — two copies of a security-boundary anchor would drift.
 */
export const CATCH_ALL = /\n([ \t]*)\/\/ Anything not named above is closed/;

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
