import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderFirestoreRules } from "../src/hq/rules.js";
import { addWaitlistRules, mergeDependencies, scaffoldWeb } from "../src/web/scaffold.js";
import { importPath, surveyWeb, waitlistSchemaLocation } from "../src/web/survey.js";
import type { FirebaseFacts } from "../src/web/templates.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const FIREBASE: FirebaseFacts = {
  projectId: "dh-acme",
  apiKey: "AIza-test",
  authDomain: "dh-acme.firebaseapp.com",
  storageBucket: "dh-acme.firebasestorage.app",
  messagingSenderId: "12345",
  appId: "1:12345:web:abc",
  workloadIdentity: { poolId: "vercel", providerId: "vercel-oidc", serviceAccount: "vercel-hq@dh-acme.iam.gserviceaccount.com" },
};

async function write(root: string, rel: string, content: string): Promise<void> {
  const path = join(root, rel);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content, "utf8");
}

/** A repository shaped like Evo: a live web app, a shared package, rules, no auth. */
async function establishedProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "morpheus-web-"));
  roots.push(root);
  await write(root, "morpheus.json", JSON.stringify({ name: "acme", displayName: "Acme", kind: "company" }));
  await write(
    root,
    "apps/web/package.json",
    JSON.stringify({
      name: "@acme/web",
      scripts: { test: "node --test app/*.test.mjs" },
      dependencies: { next: "16.2.9", react: "19.2.4" },
    }),
  );
  await write(root, "apps/web/tsconfig.json", JSON.stringify({ compilerOptions: { paths: { "@/*": ["./*"] } } }));
  await write(root, "apps/web/app/page.tsx", "export default function Home() { return null; }\n");
  await write(
    root,
    "packages/shared/package.json",
    JSON.stringify({ name: "@acme/shared", exports: { "./analytics": "./schema/analytics.ts" } }),
  );
  await write(root, "firebase.json", JSON.stringify({ firestore: { rules: "infra/firebase/firestore.rules" } }));
  await write(root, "infra/firebase/firestore.rules", renderFirestoreRules());
  return root;
}

const options = (root: string, survey: Awaited<ReturnType<typeof surveyWeb>>) => ({
  root,
  survey,
  name: "Acme",
  description: "Acme does a thing.",
  scope: "@acme",
  firebase: FIREBASE,
  waitlist: true,
  hq: true,
});

describe("import specifiers", () => {
  it("uses the alias when the app's tsconfig declares one", () => {
    expect(importPath({ alias: "@/" }, "app/api/waitlist/route.ts", "lib/waitlist/record")).toBe(
      "@/lib/waitlist/record",
    );
  });

  it("falls back to a correct relative path when it does not", () => {
    // Guessing `@/` where it is not configured produces files that do not
    // compile, which is the one failure a scaffold must not ship.
    expect(importPath({ alias: null }, "app/api/waitlist/route.ts", "lib/waitlist/record")).toBe(
      "../../../lib/waitlist/record",
    );
    expect(importPath({ alias: null }, "lib/waitlist/store.ts", "lib/firebase/admin")).toBe(
      "../firebase/admin",
    );
    expect(importPath({ alias: null }, "proxy.ts", "lib/auth/roles")).toBe("./lib/auth/roles");
  });
});

describe("waitlist schema placement", () => {
  it("goes in the shared package when there is one", async () => {
    const root = await establishedProject();
    const survey = await surveyWeb(root);
    const location = waitlistSchemaLocation(survey);
    expect(location.path).toBe("packages/shared/schema/waitlist.ts");
    expect(location.specifier("lib/waitlist/record.ts")).toBe("@acme/shared/schema/waitlist");
  });

  it("goes in the app when there is not", async () => {
    const root = await mkdtemp(join(tmpdir(), "morpheus-web-"));
    roots.push(root);
    const survey = await surveyWeb(root);
    const location = waitlistSchemaLocation(survey);
    expect(location.path).toBe("apps/web/lib/waitlist/schema.ts");
  });
});

describe("scaffoldWeb", () => {
  it("adds the missing half to an established app without touching what is there", async () => {
    const root = await establishedProject();
    const before = await readFile(join(root, "apps/web/app/page.tsx"), "utf8");
    const survey = await surveyWeb(root);

    const result = await scaffoldWeb(options(root, survey));

    expect(result.written).toContain("apps/web/app/api/waitlist/route.ts");
    expect(result.written).toContain("apps/web/app/sign-in/page.tsx");
    expect(result.written).toContain("apps/web/app/hq/page.tsx");
    expect(result.written).toContain("apps/web/proxy.ts");
    expect(result.written).toContain("packages/shared/schema/waitlist.ts");
    // The live home page is the thing a project most needs kept.
    expect(result.written).not.toContain("apps/web/app/page.tsx");
    expect(await readFile(join(root, "apps/web/app/page.tsx"), "utf8")).toBe(before);
    expect(result.notes.some((note) => note.includes("home page was left alone"))).toBe(true);
  });

  it("is safe to run twice", async () => {
    const root = await establishedProject();
    await scaffoldWeb(options(root, await surveyWeb(root)));
    const second = await scaffoldWeb(options(root, await surveyWeb(root)));

    expect(second.written).toEqual([]);
    expect(second.skipped).toContain("apps/web/app/api/waitlist/route.ts");
    expect(second.merged).toEqual([]);
  });

  it("writes the test in the runner the app already uses", async () => {
    const root = await establishedProject();
    await scaffoldWeb(options(root, await surveyWeb(root)));
    const test = await readFile(join(root, "apps/web/__tests__/waitlist-record.test.ts"), "utf8");
    // Evo runs `node --test` and has no vitest at all; a scaffold that brought
    // its own runner would add a dependency to make its own output pass.
    expect(test).toContain('from "node:test"');
    expect(test).not.toContain('from "vitest"');
  });

  it("refuses the Firebase-dependent half when no project is known", async () => {
    const root = await establishedProject();
    const survey = await surveyWeb(root);
    const result = await scaffoldWeb({ ...options(root, survey), firebase: undefined });

    expect(result.written).not.toContain("apps/web/app/sign-in/page.tsx");
    expect(result.written).not.toContain("apps/web/app/api/waitlist/route.ts");
    // A sign-in page with a placeholder config looks finished and cannot work.
    expect(result.notes.some((note) => note.includes("Skipped /hq"))).toBe(true);
    expect(result.notes.some((note) => note.includes("Skipped the waitlist"))).toBe(true);
  });

  it("keeps an existing route gate rather than shipping a second one", async () => {
    const root = await establishedProject();
    await write(root, "apps/web/middleware.ts", "export default function middleware() {}\n");
    const result = await scaffoldWeb(options(root, await surveyWeb(root)));

    expect(result.written).not.toContain("apps/web/proxy.ts");
    expect(result.notes.some((note) => note.includes("two gates on one route"))).toBe(true);
  });

  it("creates a whole app when there is none", async () => {
    const root = await mkdtemp(join(tmpdir(), "morpheus-web-"));
    roots.push(root);
    const result = await scaffoldWeb(options(root, await surveyWeb(root)));

    expect(result.written).toContain("apps/web/package.json");
    expect(result.written).toContain("apps/web/app/layout.tsx");
    expect(result.written).toContain("apps/web/app/page.tsx");
    const home = await readFile(join(root, "apps/web/app/page.tsx"), "utf8");
    expect(home).toContain('<WaitlistForm source="hero" />');
  });
});

describe("merges", () => {
  it("adds only missing dependencies, never re-pins one the project chose", async () => {
    const root = await establishedProject();
    const added = await mergeDependencies(root, "apps/web", { next: "99.0.0", jose: "^6.2.4" });

    expect(added).toEqual(["jose"]);
    const manifest = JSON.parse(await readFile(join(root, "apps/web/package.json"), "utf8"));
    expect(manifest.dependencies.next).toBe("16.2.9");
    expect(manifest.dependencies.jose).toBe("^6.2.4");
  });

  it("opens the shared package's exports map for the schema", async () => {
    const root = await establishedProject();
    await scaffoldWeb(options(root, await surveyWeb(root)));
    const manifest = JSON.parse(await readFile(join(root, "packages/shared/package.json"), "utf8"));

    // An explicit exports map is a closed list: a subpath it does not name
    // cannot be imported at all.
    expect(manifest.exports["./schema/waitlist"]).toBe("./schema/waitlist.ts");
    expect(manifest.exports["./analytics"]).toBe("./schema/analytics.ts");
  });
});

describe("firestore rules", () => {
  it("denies the waitlist collection explicitly, above the catch-all", async () => {
    const root = await establishedProject();
    const outcome = await addWaitlistRules(root, "infra/firebase/firestore.rules");
    expect(outcome).toEqual({ kind: "merged", path: "infra/firebase/firestore.rules" });

    const rules = await readFile(join(root, "infra/firebase/firestore.rules"), "utf8");
    expect(rules).toContain("match /waitlist/{email}");
    // Inside the database match scope, and above the catch-all — a collection
    // placed after it would be closed by the wrong rule, and one placed outside
    // the scope would not deploy at all.
    const scope = rules.indexOf("match /databases/{database}/documents");
    const waitlist = rules.indexOf("match /waitlist/");
    const catchAll = rules.indexOf("Anything not named above");
    expect(scope).toBeGreaterThan(-1);
    expect(waitlist).toBeGreaterThan(scope);
    expect(waitlist).toBeLessThan(catchAll);
    // Braces still balance, so the block did not land mid-statement.
    expect(rules.split("{").length).toBe(rules.split("}").length);
  });

  it("does not write into rules it cannot place the block in", async () => {
    const root = await establishedProject();
    await write(root, "infra/firebase/firestore.rules", "rules_version = '2';\n// hand written\n");
    const outcome = await addWaitlistRules(root, "infra/firebase/firestore.rules");

    // Rules are a security boundary; writing into one at a guessed position is
    // how a match block ends up outside the scope it was meant to be inside.
    expect(outcome.kind).toBe("note");
    const rules = await readFile(join(root, "infra/firebase/firestore.rules"), "utf8");
    expect(rules).not.toContain("waitlist");
  });

  it("leaves an existing waitlist rule alone", async () => {
    const root = await establishedProject();
    await addWaitlistRules(root, "infra/firebase/firestore.rules");
    const once = await readFile(join(root, "infra/firebase/firestore.rules"), "utf8");
    const outcome = await addWaitlistRules(root, "infra/firebase/firestore.rules");

    expect(outcome.kind).toBe("none");
    expect(await readFile(join(root, "infra/firebase/firestore.rules"), "utf8")).toBe(once);
  });
});
