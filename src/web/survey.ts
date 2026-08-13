import { access, readFile } from "node:fs/promises";
import type { FirebaseFacts } from "./templates.js";
import { join } from "node:path";

/**
 * What a repository's web surface already has.
 *
 * `web init` runs on established projects far more often than on empty ones —
 * Evo has a home page, a token pipeline and a Vercel link before it has any of
 * this — so every template decision is made from what is *there*, not from a
 * fixed idea of what a project looks like. The survey is the whole of that
 * reading, kept separate from the writing so it can be tested against fixture
 * trees with no filesystem mutation at all.
 *
 * Nothing here decides what to write. It answers *where does code live here*
 * and *what is already done*, and `scaffold.ts` decides.
 */

export interface SharedPackage {
  /** Directory relative to the repository root, e.g. `packages/shared`. */
  dir: string;
  /** Package name, e.g. `@evo/shared`. */
  name: string;
  /** True when `exports` is an explicit map that must gain an entry. */
  hasExportsMap: boolean;
  /** True when the waitlist schema is already exported. */
  exportsWaitlist: boolean;
}

export interface WebSurvey {
  /** Directory of the Next.js app relative to the root, e.g. `apps/web`. */
  webRoot: string;
  /** True when that directory already holds an app — anything but a bare path. */
  webAppExists: boolean;
  /**
   * Import prefix for the app's own modules. `@/` when the app's tsconfig
   * declares it, otherwise null, and generated files use relative specifiers.
   * Guessing `@/` where it is not configured produces files that do not
   * compile, which is the one failure a scaffold must not ship.
   */
  alias: string | null;
  shared: SharedPackage | null;
  /** `vitest` or `node:test`, from the app's devDependencies. */
  testRunner: "vitest" | "node" | null;
  hasTailwind: boolean;
  /** Already-present pieces. Each one is skipped rather than rewritten. */
  hasWaitlist: boolean;
  hasHqRoute: boolean;
  hasSignIn: boolean;
  hasFirebaseConfig: boolean;
  hasRouteGate: boolean;
  /** Path of the deployed Firestore rules, when one is configured. */
  firestoreRulesPath: string | null;
  /** `.vercel/project.json`, at the root or in the web root. */
  vercelLinked: boolean;
  /**
   * True when the app is a static export.
   *
   * `output: "export"` produces HTML files and nothing else: no route
   * handlers, no route gate, no server rendering. Every server-side thing this
   * scaffold writes would build locally and fail at `next build` — Evo's did,
   * with `export const dynamic = "force-dynamic" ... cannot be used with
   * "output: export"`. Detected so the refusal is a sentence rather than a
   * build log.
   */
  staticExport: boolean;
  /**
   * True when the app sets `trailingSlash: true`.
   *
   * Next then answers `/api/waitlist` with a 308 to `/api/waitlist/`. A browser
   * follows that and preserves the method, so a form posting to the unslashed
   * path *works* — at the cost of a second round trip on every signup, and of
   * looking wrong in a codebase where every other route carries the slash.
   * Cheap to get right, and invisible if you do not look.
   */
  trailingSlash: boolean;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Where the Next.js app lives.
 *
 * `apps/web` is the canonical answer (§3), and it is also the answer for a
 * repository that has nothing yet. A root-level `app/` directory is accepted
 * because two personal sites predate the convention, and writing a second app
 * beside a working one would be worse than following it.
 */
export async function findWebRoot(root: string): Promise<{ webRoot: string; exists: boolean }> {
  if (await exists(join(root, "apps/web/package.json"))) return { webRoot: "apps/web", exists: true };
  if (await exists(join(root, "app")) && (await exists(join(root, "package.json")))) {
    const pkg = await readJson<{ dependencies?: Record<string, string> }>(join(root, "package.json"));
    if (pkg?.dependencies?.["next"]) return { webRoot: ".", exists: true };
  }
  return { webRoot: "apps/web", exists: false };
}

/** The `@/*` alias, only when the app's own tsconfig actually declares it. */
async function readAlias(root: string, webRoot: string): Promise<string | null> {
  const tsconfig = await readJson<{ compilerOptions?: { paths?: Record<string, string[]> } }>(
    join(root, webRoot, "tsconfig.json"),
  );
  const paths = tsconfig?.compilerOptions?.paths;
  return paths && Object.keys(paths).includes("@/*") ? "@/" : null;
}

/**
 * The shared workspace package, if there is one.
 *
 * The waitlist record shape is product vocabulary, so it belongs beside
 * `schema/analytics.ts` under the same rule (§ analytics decision): one
 * meaning, many transports. Without a shared package the schema goes inside
 * the app instead — a project with one surface does not need a package
 * boundary invented for it.
 */
export async function findSharedPackage(root: string): Promise<SharedPackage | null> {
  for (const dir of ["packages/shared"]) {
    const pkg = await readJson<{ name?: string; exports?: unknown }>(join(root, dir, "package.json"));
    if (!pkg?.name) continue;
    const exportsMap =
      pkg.exports && typeof pkg.exports === "object" && !Array.isArray(pkg.exports)
        ? (pkg.exports as Record<string, unknown>)
        : null;
    return {
      dir,
      name: pkg.name,
      hasExportsMap: exportsMap !== null,
      exportsWaitlist: exportsMap !== null && "./schema/waitlist" in exportsMap,
    };
  }
  return null;
}

async function readTestRunner(
  root: string,
  webRoot: string,
): Promise<"vitest" | "node" | null> {
  const pkg = await readJson<{
    devDependencies?: Record<string, string>;
    dependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  }>(join(root, webRoot, "package.json"));
  if (!pkg) return null;
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps["vitest"]) return "vitest";
  // `node --test` leaves no dependency behind, so the script is the only
  // evidence it is the runner. Evo tests this way and has no vitest at all.
  if (Object.values(pkg.scripts ?? {}).some((script) => script.includes("--test"))) return "node";
  return null;
}

/**
 * Whether the Next config asks for a static export.
 *
 * Read as text rather than imported: the config is TypeScript, may import from
 * the project, and evaluating a repository's code to answer a question about it
 * is a much larger thing to do than matching one key. A commented-out line
 * would be a false positive; the comment stripping keeps that from happening
 * for the one shape that actually occurs.
 */
export function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

export async function readsStaticExport(source: string): Promise<boolean> {
  return /output\s*:\s*["']export["']/.test(withoutComments(source));
}

/** Whether the config asks Next to canonicalise every route with a trailing slash. */
export function readsTrailingSlash(source: string): boolean {
  return /trailingSlash\s*:\s*true/.test(withoutComments(source));
}

/** The Firestore rules file Firebase actually deploys, when one is configured. */
export async function deployedRulesPath(root: string): Promise<string | null> {
  const config = await readJson<{ firestore?: { rules?: unknown } }>(join(root, "firebase.json"));
  const configured = config?.firestore?.rules;
  if (typeof configured === "string" && configured.trim()) return configured.trim();
  if (await exists(join(root, "firestore.rules"))) return "firestore.rules";
  return null;
}

export async function surveyWeb(root: string): Promise<WebSurvey> {
  const { webRoot, exists: webAppExists } = await findWebRoot(root);
  const app = (path: string) => join(root, webRoot, path);

  const [
    alias,
    shared,
    testRunner,
    hasTailwindConfig,
    hasWaitlist,
    hasHqRoute,
    hasSignIn,
    hasFirebaseConfig,
    proxyGate,
    middlewareGate,
    firestoreRulesPath,
    vercelRoot,
    vercelApp,
  ] = await Promise.all([
    readAlias(root, webRoot),
    findSharedPackage(root),
    readTestRunner(root, webRoot),
    exists(app("postcss.config.mjs")),
    exists(app("app/api/waitlist/route.ts")),
    exists(app("app/hq")),
    exists(app("app/sign-in")),
    exists(app("lib/firebase/config.ts")),
    exists(app("proxy.ts")),
    exists(app("middleware.ts")),
    deployedRulesPath(root),
    exists(join(root, ".vercel/project.json")),
    exists(app(".vercel/project.json")),
  ]);

  const nextConfig = await Promise.all(
    ["next.config.ts", "next.config.mjs", "next.config.js"].map((name) =>
      readFile(app(name), "utf8").catch(() => ""),
    ),
  );
  const staticExport = (
    await Promise.all(nextConfig.map((source) => readsStaticExport(source)))
  ).some(Boolean);
  const trailingSlash = nextConfig.some((source) => readsTrailingSlash(source));

  return {
    webRoot,
    webAppExists,
    alias,
    shared,
    testRunner,
    hasTailwind: hasTailwindConfig,
    hasWaitlist,
    hasHqRoute,
    hasSignIn,
    hasFirebaseConfig,
    hasRouteGate: proxyGate || middlewareGate,
    firestoreRulesPath,
    vercelLinked: vercelRoot || vercelApp,
    staticExport,
    trailingSlash,
  };
}

/**
 * Import specifier for one of the app's own modules.
 *
 * `from` is the generated file's path inside the web root; `to` is the target.
 * With an alias configured the result is idiomatic; without one it is relative
 * and still correct, which is the property that matters.
 */
export function importPath(survey: Pick<WebSurvey, "alias">, from: string, to: string): string {
  if (survey.alias) return `${survey.alias}${to}`;

  const fromParts = from.split("/").slice(0, -1);
  const toParts = to.split("/");
  let shared = 0;
  while (shared < fromParts.length && shared < toParts.length - 1 && fromParts[shared] === toParts[shared]) {
    shared += 1;
  }
  const up = fromParts.length - shared;
  const prefix = up === 0 ? "./" : "../".repeat(up);
  return `${prefix}${toParts.slice(shared).join("/")}`;
}

/**
 * Read the Firebase facts back out of a config this scaffold already wrote.
 *
 * Re-running to pick up an improved template is the whole point of a scaffold
 * that never overwrites, and without this `--no-provision` could not do it: the
 * Firebase-dependent half is written only when the facts are known, and with
 * provisioning skipped they were known to nobody — so a re-run silently
 * produced nothing.
 *
 * Parsed rather than imported: the file is TypeScript, and reading a
 * repository's code to answer a question about it is a much larger thing to do
 * than matching the keys we generated. Any missing key returns null, so a
 * hand-edited or foreign config is treated as unknown rather than
 * half-understood.
 */
export async function readFirebaseFacts(
  root: string,
  webRoot: string,
): Promise<FirebaseFacts | null> {
  const source = await readFile(
    join(root, webRoot === "." ? "lib/firebase/config.ts" : `${webRoot}/lib/firebase/config.ts`),
    "utf8",
  ).catch(() => null);
  if (!source) return null;

  const read = (key: string): string | undefined =>
    new RegExp(`${key}\\s*:\\s*"([^"]+)"`).exec(source)?.[1];

  const projectId = read("projectId");
  const apiKey = read("apiKey");
  const authDomain = read("authDomain");
  const storageBucket = read("storageBucket");
  const messagingSenderId = read("messagingSenderId");
  const appId = read("appId");
  if (!projectId || !apiKey || !authDomain || !storageBucket || !messagingSenderId || !appId) {
    return null;
  }

  const poolId = read("poolId");
  const providerId = read("providerId");
  const serviceAccount = read("serviceAccount");

  return {
    projectId,
    apiKey,
    authDomain,
    storageBucket,
    messagingSenderId,
    appId,
    ...(poolId && providerId && serviceAccount
      ? { workloadIdentity: { poolId, providerId, serviceAccount } }
      : {}),
  };
}

/** Where the waitlist schema lives, and how the app imports it. */
export function waitlistSchemaLocation(survey: WebSurvey): {
  path: string;
  specifier: (from: string) => string;
} {
  if (survey.shared) {
    return {
      path: `${survey.shared.dir}/schema/waitlist.ts`,
      specifier: () => `${survey.shared!.name}/schema/waitlist`,
    };
  }
  return {
    path: `${survey.webRoot}/lib/waitlist/schema.ts`,
    specifier: (from: string) => importPath(survey, from, "lib/waitlist/schema"),
  };
}
