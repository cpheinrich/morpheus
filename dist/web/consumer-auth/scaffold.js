import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { firestoreValue, waitlistThrottle } from "../templates.js";
import { addJwksJoseOverride, CATCH_ALL, mergeDependencies } from "../scaffold.js";
import * as libs from "./templates-lib.js";
import * as app from "./templates-app.js";
import * as suites from "./templates-tests.js";
import * as config from "./templates-config.js";
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
 * `deliver()` is a seam by design, and the provider behind it is a live
 * decision: the standing record names Cloudflare Email Sending as canonical
 * while the extracted implementation is Evo's verified Resend. A project that
 * swaps the transport is doing the intended thing, and a check that reports
 * the canonical choice as permanent drift — while the non-canonical default
 * reads clean — inverts the report's meaning for exactly this file. The
 * load-bearing part (generate only after `canDeliver()`) is pinned by the
 * templates' own tests, not by byte-comparison here.
 */
const CHECK_EXEMPT = new Set(["lib/email/send.ts", "lib/email/templates.ts"]);
function checkExempt(survey, path) {
    const prefix = survey.webRoot === "." ? "" : `${survey.webRoot}/`;
    return [...CHECK_EXEMPT].some((rel) => path === `${prefix}${rel}`);
}
async function exists(path) {
    try {
        await access(path);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Everything the scaffold writes whole, as (path, content, layer).
 *
 * One list shared by the writer and `--check`, so the two cannot disagree
 * about what the current templates say a file should be.
 */
export function plannedFiles(survey, ctx) {
    const web = (rel) => survey.webRoot === "." ? rel : posix.join(survey.webRoot, rel);
    const rulesDir = survey.firestoreRulesPath ? posix.dirname(survey.firestoreRulesPath) : "infra/firebase";
    const plumbing = [
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
    const policy = [
        [web("app/api/auth/session/route.ts"), app.apiAuthSessionRoute(ctx)],
        [web("app/api/auth/reset-password/route.ts"), app.apiResetPasswordRoute(ctx)],
        [web("app/api/account/route.ts"), app.apiAccountRoute(ctx)],
        [web("app/api/account/verify-email/route.ts"), app.apiVerifyEmailRoute(ctx)],
        [web("proxy.ts"), app.routeGate(ctx)],
    ];
    const starter = [
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
    const contract = [
        [web("__tests__/auth-config.test.mjs"), suites.unitAuthConfigTest(ctx)],
        [web("__tests__/action-link.test.mjs"), suites.unitActionLinkTest(ctx)],
        [web("__tests__/request-safety.test.mjs"), suites.unitRequestSafetyTest(ctx)],
        [web("__tests__/user-profile.test.mjs"), suites.unitUserProfileTest(ctx)],
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
    const withLayer = (entries, layer) => entries.map(([path, content]) => ({ path, content, layer }));
    return [
        ...withLayer(plumbing, "plumbing"),
        ...withLayer(policy, "policy"),
        ...withLayer(starter, "starter"),
        ...withLayer(contract, "contract"),
    ];
}
export async function scaffoldConsumerAuth(opts) {
    const { root, survey, ctx } = opts;
    const written = [];
    const skipped = [];
    const merged = [];
    const upgraded = [];
    const drifted = [];
    const notes = [];
    const configPath = survey.webRoot === "." ? "lib/firebase/config.ts" : `${survey.webRoot}/lib/firebase/config.ts`;
    for (const file of plannedFiles(survey, ctx)) {
        const abs = join(root, file.path);
        if (await exists(abs)) {
            const existing = await readFile(abs, "utf8").catch(() => null);
            if (existing === file.content) {
                skipped.push(file.path);
            }
            else if (file.path === configPath &&
                opts.webInitConfig !== undefined &&
                existing === opts.webInitConfig) {
                // Unedited `web init` output, proven byte-for-byte — the one upgrade
                // in place. Anything else that differs is never touched.
                await writeFile(abs, file.content, "utf8");
                upgraded.push(file.path);
            }
            else if ((file.layer === "plumbing" || file.layer === "policy") &&
                !checkExempt(survey, file.path)) {
                // Starter and contract files are the project's to change; the shared
                // plumbing and policy files are the ones worth naming when they lag.
                drifted.push(file.path);
            }
            else {
                skipped.push(file.path);
            }
            continue;
        }
        await mkdir(dirname(abs), { recursive: true });
        await writeFile(abs, file.content, "utf8");
        written.push(file.path);
    }
    if (drifted.includes(configPath)) {
        notes.push(`${configPath} carries local edits, so it was neither replaced nor safe to ` +
            "delete — it is the source of the production facts a re-run needs. Fold the " +
            "two-environment shape in by hand: PRODUCTION_CONFIG/STAGING_CONFIG, " +
            "resolveEnvironment(), credentialStrategy(), SESSION_COOKIE_NAME, " +
            "SIGNED_IN_HINT_COOKIE_NAME and SESSION_MAX_AGE_MS are what the rest of the " +
            "scaffold imports.");
    }
    if (drifted.length) {
        notes.push("Files marked ≠ exist with different content — usually `web init`'s HQ-only versions, " +
            "which this scaffold supersedes (the session route that also serves consumers, the " +
            "two-branch route gate, the two-environment Firebase config). If a file is unedited " +
            "scaffold output, delete it and re-run; if it carries local edits, fold the template's " +
            "changes in by hand. `morpheus web add-consumer-auth --check` re-prints this list.");
    }
    // --- merges ---------------------------------------------------------------
    const rules = await addConsumerRules(root, survey.firestoreRulesPath);
    if (rules.kind === "merged")
        merged.push(`${rules.path} (+consumer accounts block)`);
    if (rules.kind === "note")
        notes.push(rules.message);
    const firebaseJson = await ensureEmulatorsBlock(root, survey.firestoreRulesPath);
    if (firebaseJson.kind === "written")
        written.push("firebase.json");
    if (firebaseJson.kind === "merged")
        merged.push("firebase.json (+emulators)");
    if (firebaseJson.kind === "note")
        notes.push(firebaseJson.message);
    const appDeps = await mergeDependencies(root, survey.webRoot, APP_DEPENDENCIES);
    const appManifest = survey.webRoot === "." ? "package.json" : `${survey.webRoot}/package.json`;
    if (appDeps.length)
        merged.push(`${appManifest} (+${appDeps.join(", ")})`);
    const appDevDeps = await mergeJson(join(root, appManifest), "devDependencies", APP_DEV_DEPENDENCIES);
    if (appDevDeps.length)
        merged.push(`${appManifest} (dev +${appDevDeps.join(", ")})`);
    const appScripts = await mergeJson(join(root, appManifest), "scripts", {
        "build:e2e": "NEXT_PUBLIC_USE_EMULATORS=1 next build",
        "test:e2e": "playwright test",
    });
    if (appScripts.length)
        merged.push(`${appManifest} (scripts +${appScripts.join(", ")})`);
    const rootDevDeps = await mergeJson(join(root, "package.json"), "devDependencies", ROOT_DEV_DEPENDENCIES);
    if (rootDevDeps.length)
        merged.push(`package.json (dev +${rootDevDeps.join(", ")})`);
    const rootScripts = await mergeJson(join(root, "package.json"), "scripts", rootScriptSet(survey, ctx));
    if (rootScripts.length)
        merged.push(`package.json (scripts +${rootScripts.join(", ")})`);
    if (await addJwksJoseOverride(root))
        merged.push("pnpm-workspace.yaml (+jwks-rsa>jose override)");
    if (await addSharedUserExport(root)) {
        merged.push("packages/shared/package.json (+./schema/user)");
    }
    // --- what only the project can decide --------------------------------------
    if (appDeps.length || appDevDeps.length || rootDevDeps.length) {
        notes.push("Run `pnpm install` — the generated code imports dependencies just added.");
    }
    notes.push("Import the starter styles once, from the app's global stylesheet: " +
        '`@import "./consumer-auth.css";` — then restyle it with the project\'s own tokens.');
    notes.push("Render `<NavAuth />` in the marketing header. It reads the readable hint cookie " +
        "client-side, so the header flips between Sign in and Dashboard without making a " +
        "single static page dynamic. Then extend e2e/sign-in.spec.ts's header assertions, " +
        "which are commented where they belong.");
    if (written.some((path) => path.endsWith(".test.mjs"))) {
        notes.push("Add the four files in __tests__/ to the web app's `test` script — a `node --test` " +
            "project names its files explicitly, so a new one runs nowhere until it is listed.");
    }
    notes.push(`Keep ${ctx.stagingHost} out of the index: add an X-Robots-Tag header for it in ` +
        "next.config.ts —\n" +
        "    { source: \"/:path*\", has: [{ type: \"host\", value: \"" + ctx.stagingHost + "\" }],\n" +
        "      headers: [{ key: \"X-Robots-Tag\", value: \"noindex, nofollow\" }] }\n" +
        "  It serves the same pages as production from the same build, and a full duplicate of " +
        "the site on a second domain competes with the real one.");
    notes.push("The console half — the staging Firebase project, providers on both projects, the " +
        "service-account key scoped to Vercel Preview ONLY, Resend domain and keys, the staging " +
        "domain on the Vercel project — is a human runbook: docs/runbooks/consumer-auth.md in " +
        "the Morpheus repo.");
    return { written, skipped, merged, upgraded, drifted, notes };
}
/**
 * `--check`: layers A and B against the current templates.
 *
 * The same regeneration philosophy as `morpheus hq rules --check`: the report
 * says which shared files have drifted from what the templates now say, and
 * exits non-zero so CI can hold a project to it if it chooses.
 */
export async function checkConsumerAuth(opts) {
    const { root, survey, ctx } = opts;
    let drift = 0;
    for (const file of plannedFiles(survey, ctx)) {
        if (file.layer !== "plumbing" && file.layer !== "policy")
            continue;
        if (checkExempt(survey, file.path))
            continue;
        const abs = join(root, file.path);
        if (!(await exists(abs))) {
            console.log(`  – ${file.path} (missing)`);
            drift += 1;
            continue;
        }
        const existing = await readFile(abs, "utf8").catch(() => null);
        if (existing === file.content) {
            console.log(`  · ${file.path}`);
        }
        else {
            console.log(`  ≠ ${file.path}`);
            drift += 1;
        }
    }
    // The rules block is a merge rather than a whole file, and it is the one
    // security boundary here — so its presence is checked verbatim.
    if (survey.firestoreRulesPath) {
        const rules = await readFile(join(root, survey.firestoreRulesPath), "utf8").catch(() => null);
        if (rules?.includes(suites.CONSUMER_RULES_BLOCK.trimEnd())) {
            console.log(`  · ${survey.firestoreRulesPath} (consumer block)`);
        }
        else {
            console.log(`  ≠ ${survey.firestoreRulesPath} (consumer block absent or altered)`);
            drift += 1;
        }
    }
    if (drift === 0) {
        console.log("\nEvery plumbing and policy file matches the current templates.");
        return 0;
    }
    console.log(`\n${drift} file(s) differ from the current templates (– missing, ≠ drifted). ` +
        "A drifted file that is unedited scaffold output can be deleted and re-scaffolded; " +
        "one with local edits needs the template's changes folded in by hand.");
    return 1;
}
/** Root scripts, written so a local run and a CI run are the same line. */
export function rootScriptSet(survey, ctx) {
    const emulatorEntry = survey.webRoot === "."
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
        "test:emulator:run": `node --experimental-strip-types ${emulatorEntry} && pnpm --filter ${ctx.scope}/web run --if-present test:emulator && pnpm run test:rules`,
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
export async function mergeJson(path, field, required) {
    let manifest;
    try {
        manifest = JSON.parse(await readFile(path, "utf8"));
    }
    catch {
        return [];
    }
    const current = (manifest[field] ?? {});
    const added = [];
    for (const [key, value] of Object.entries(required)) {
        if (current[key] !== undefined)
            continue;
        current[key] = value;
        added.push(key);
    }
    if (!added.length)
        return [];
    manifest[field] =
        field === "devDependencies"
            ? Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)))
            : current;
    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    return added;
}
/**
 * Insert the consumer-accounts block into the deployed rules, above the
 * catch-all — the same anchored merge as the waitlist block, for the same
 * reason: rules are a security boundary, and writing into one at a guessed
 * position is how a `match` lands outside the scope it was meant for.
 */
export async function addConsumerRules(root, rulesPath) {
    if (!rulesPath) {
        return {
            kind: "note",
            message: "No deployed Firestore rules file is configured, so the consumer accounts block was " +
                "not written. Run `morpheus init` to scaffold one, then re-run.",
        };
    }
    const path = join(root, rulesPath);
    let existing;
    try {
        existing = await readFile(path, "utf8");
    }
    catch {
        return {
            kind: "note",
            message: `Could not read ${rulesPath}; the consumer accounts block was not written.`,
        };
    }
    // Idempotency and "someone else's block" are different answers, split
    // deliberately: our own block present verbatim is a clean re-run; a foreign
    // /users match means the collection is governed by rules this scaffold has
    // not seen, which is exactly what must not pass silently.
    if (existing.includes(suites.CONSUMER_RULES_BLOCK.trimEnd()))
        return { kind: "none" };
    if (/match\s+\/users\/\{uid\}/.test(existing)) {
        return {
            kind: "note",
            message: `${rulesPath} already declares match /users/{uid}, and it is not this scaffold's ` +
                "block — the consumer rules were NOT inserted, and the users collection is governed " +
                "by whatever that match says. Compare it against the scaffold's block by hand:\n" +
                suites.CONSUMER_RULES_BLOCK.trimEnd(),
        };
    }
    const match = CATCH_ALL.exec(existing);
    if (!match) {
        return {
            kind: "note",
            message: `${rulesPath} does not carry the generated catch-all comment, so the consumer ` +
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
/**
 * Make sure `firebase.json` declares the emulators the suites depend on.
 *
 * Ports are load-bearing: the rules suite dials a literal 127.0.0.1:8080, so
 * an existing emulators block is left alone and *reported* when its ports
 * disagree — rewriting a project's ports would break whatever chose them.
 */
export async function ensureEmulatorsBlock(root, rulesPath) {
    const path = join(root, "firebase.json");
    const raw = await readFile(path, "utf8").catch(() => null);
    if (raw === null) {
        await writeFile(path, config.firebaseJson(rulesPath ?? "infra/firebase/firestore.rules"), "utf8");
        return { kind: "written" };
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return {
            kind: "note",
            message: "firebase.json is not valid JSON, so the emulators block was not merged. Fix the " +
                "file and re-run, or add the block by hand (auth 9099, firestore 8080, " +
                "singleProjectMode off).",
        };
    }
    if (parsed.emulators !== undefined) {
        const current = parsed.emulators;
        // A declared port that disagrees is a real conflict — the rules suite
        // dials the literals, so rewriting would break whatever chose the ports
        // and keeping them would make the suite hang. An *absent* emulator is not
        // a conflict; a block that declares only `ui` just gains the two it lacks.
        const conflicts = (current.auth !== undefined && current.auth.port !== 9099) ||
            (current.firestore !== undefined && current.firestore.port !== 8080);
        if (conflicts) {
            return {
                kind: "note",
                message: "firebase.json already declares the auth or firestore emulator on different " +
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
        if (!added)
            return { kind: "none" };
        await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
        return { kind: "merged" };
    }
    parsed.emulators = config.EMULATORS_BLOCK;
    await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    return { kind: "merged" };
}
/**
 * Add `./schema/user` to the shared package's explicit exports map — the
 * whitelist that silently makes a file unimportable is worth checking before
 * concluding a pipeline is broken, and this is that check done at write time.
 */
export async function addSharedUserExport(root) {
    const path = join(root, "packages/shared/package.json");
    let manifest;
    try {
        manifest = JSON.parse(await readFile(path, "utf8"));
    }
    catch {
        return false;
    }
    const exportsMap = manifest.exports;
    if (!exportsMap || typeof exportsMap !== "object" || Array.isArray(exportsMap))
        return false;
    const map = exportsMap;
    if ("./schema/user" in map)
        return false;
    manifest.exports = { ...map, "./schema/user": "./schema/user.ts" };
    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    return true;
}
//# sourceMappingURL=scaffold.js.map