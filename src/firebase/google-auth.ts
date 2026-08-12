import { execFile } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const NETWORK_TIMEOUT_MS = 10_000;

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface CommandOptions {
  timeoutMs?: number;
}

/** Injectable boundary so setup behaviour is covered without a live cloud account. */
export type CommandRunner = (
  command: string,
  args: string[],
  cwd: string,
  options?: CommandOptions,
) => Promise<CommandResult>;

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface GoogleAuthConfigInput {
  project: string;
  /** Public app origin or hostname, for example `https://example.com`. */
  domain?: string;
  supportEmail: string;
  brand: string;
}

export interface GoogleAuthSetupOptions {
  root: string;
  project: string;
  domain?: string;
  supportEmail?: string;
  brand: string;
  /** Defaults to true. Opens Firebase's console only when recovery is needed. */
  openBrowser?: boolean;
  runner?: CommandRunner;
  fetcher?: Fetcher;
}

export interface GoogleAuthCheckOptions {
  root: string;
  project: string;
  domain?: string;
  runner?: CommandRunner;
  fetcher?: Fetcher;
}

export interface GoogleAuthCheck {
  project: string;
  googleEnabled: boolean;
  authorizedDomains: string[];
  expectedDomains: string[];
  missingDomains: string[];
  ready: boolean;
}

export interface GoogleAuthSetupResult extends GoogleAuthCheck {
  configPath: string;
  supportEmail: string;
}

type Json = Record<string, unknown>;

async function systemRunner(
  command: string,
  args: string[],
  cwd: string,
  options?: CommandOptions,
): Promise<CommandResult> {
  const { stdout, stderr } = await exec(command, args, { cwd, timeout: options?.timeoutMs });
  return { stdout, stderr };
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function restoreFile(path: string, previous: string | null): Promise<void> {
  if (previous === null) {
    try {
      await unlink(path);
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    }
    return;
  }
  await writeFile(path, previous, "utf8");
}

function asObject(value: unknown, label: string): Json {
  if (value && typeof value === "object" && !Array.isArray(value)) return { ...(value as Json) };
  throw new Error(`${label} must be a JSON object; refusing to overwrite it.`);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean)
    : [];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Turn a hostname or bare origin into a stable, deployable HTTP(S) origin. */
export function normalizeOrigin(value: string): string {
  const candidate = value.trim();
  if (!candidate) throw new Error("A Firebase Auth domain cannot be empty.");

  const url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`Firebase Auth domain must be an origin, not a path: ${value}`);
  }
  return url.origin;
}

/** Domains Firebase Auth must recognize before a web app can return from Google. */
export function expectedAuthorizedDomains(project: string, domain?: string): string[] {
  const customHost = domain ? new URL(normalizeOrigin(domain)).hostname : undefined;
  // Morpheus supports local web/HQ development as a first-class flow, so
  // localhost is deliberately restored rather than merely tolerated remotely.
  return unique([
    "localhost",
    `${project}.firebaseapp.com`,
    `${project}.web.app`,
    ...(customHost ? [customHost] : []),
  ]);
}

/** Origins Firebase's Google-provider configuration should carry as code. */
export function expectedRedirectUris(project: string, domain?: string): string[] {
  // Keep this paired with the localhost authorized-domain policy above.
  // Port 3000 remains Morpheus's required local default; projects may add a
  // non-default local port alongside it, but setup deliberately restores 3000.
  return unique([
    "http://localhost:3000",
    `https://${project}.firebaseapp.com`,
    `https://${project}.web.app`,
    ...(domain ? [normalizeOrigin(domain)] : []),
  ]);
}

export function mergeGoogleProviderConfig(existing: Json, input: GoogleAuthConfigInput): Json {
  // Firebase CLI supports Authentication provider configuration as code. Keep
  // this structure isolated so we neither overwrite unrelated deploy settings
  // nor ask every new project to repeat the console workflow.
  const auth = existing.auth === undefined ? {} : asObject(existing.auth, "firebase.json auth");
  const providers = auth.providers === undefined ? {} : asObject(auth.providers, "firebase.json auth.providers");
  const previousGoogle = providers.googleSignIn === undefined
    ? {}
    : asObject(providers.googleSignIn, "firebase.json auth.providers.googleSignIn");

  const configuredUris = stringArray(previousGoogle.authorizedRedirectUris);
  const googleSignIn: Json = {
    ...previousGoogle,
    // The Firebase CLI schema enables Google Sign-In by the presence of this
    // object. `enabled` belongs to the remote Identity Platform resource and
    // is deliberately not written into firebase.json.
    oAuthBrandDisplayName: input.brand,
    supportEmail: input.supportEmail,
    authorizedRedirectUris: unique([...configuredUris, ...expectedRedirectUris(input.project, input.domain)]),
  };

  return {
    ...existing,
    auth: {
      ...auth,
      providers: {
        ...providers,
        googleSignIn,
      },
    },
  };
}

export async function writeGoogleProviderConfig(
  root: string,
  input: GoogleAuthConfigInput,
): Promise<string> {
  const configPath = join(root, "firebase.json");
  let existing: Json = {};
  try {
    existing = asObject(JSON.parse(await readFile(configPath, "utf8")), "firebase.json");
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }

  const next = mergeGoogleProviderConfig(existing, input);
  await writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return configPath;
}

async function gcloudToken(runner: CommandRunner, root: string, allowBrowserLogin: boolean): Promise<string> {
  try {
    const { stdout } = await runner(
      "gcloud",
      ["auth", "print-access-token"],
      root,
      { timeoutMs: NETWORK_TIMEOUT_MS },
    );
    if (stdout.trim()) return stdout.trim();
  } catch (error) {
    if (!allowBrowserLogin) {
      throw new Error(`Could not read a Google access token: ${errorMessage(error)}`);
    }
  }

  if (!allowBrowserLogin) throw new Error("Could not read a Google access token.");

  try {
    await runner("gcloud", ["auth", "login"], root);
    const { stdout } = await runner(
      "gcloud",
      ["auth", "print-access-token"],
      root,
      { timeoutMs: NETWORK_TIMEOUT_MS },
    );
    if (!stdout.trim()) throw new Error("gcloud returned an empty access token after login.");
    return stdout.trim();
  } catch (error) {
    throw new Error(
      `Google browser authorization could not complete: ${errorMessage(error)}. ` +
      "Run `gcloud auth login`, then retry `morpheus firebase auth setup`.",
    );
  }
}

async function gcloudEmail(runner: CommandRunner, root: string): Promise<string> {
  const { stdout } = await runner(
    "gcloud",
    ["config", "get-value", "account"],
    root,
    { timeoutMs: NETWORK_TIMEOUT_MS },
  );
  const email = stdout.trim();
  if (!email || email === "(unset)") {
    throw new Error("No active Google account. Run `gcloud auth login`, then retry.");
  }
  return email;
}

async function ensureFirebaseLogin(
  runner: CommandRunner,
  root: string,
  allowBrowserLogin: boolean,
): Promise<void> {
  try {
    await runner(
      "firebase",
      ["projects:list", "--json"],
      root,
      { timeoutMs: NETWORK_TIMEOUT_MS },
    );
    return;
  } catch {
    // The Firebase CLI owns its OAuth session. Let it open the browser now,
    // instead of reporting "configured" and deferring the first human step to
    // a later deploy.
  }

  if (!allowBrowserLogin) {
    throw new Error(
      "Firebase CLI is not authenticated. Run `firebase login`, then retry without --no-browser.",
    );
  }

  try {
    await runner("firebase", ["login"], root);
    await runner(
      "firebase",
      ["projects:list", "--json"],
      root,
      { timeoutMs: NETWORK_TIMEOUT_MS },
    );
  } catch (error) {
    throw new Error(
      `Firebase browser authorization could not complete: ${errorMessage(error)}. ` +
      "Install firebase-tools if needed, complete the browser sign-in, then retry.",
    );
  }
}

async function json<T>(response: Response, context: string): Promise<T> {
  const text = await response.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { message: text };
    }
  }
  if (!response.ok) {
    const detail = body && typeof body === "object" && "error" in body
      ? JSON.stringify((body as { error: unknown }).error)
      : text;
    throw new Error(`${context} failed (${response.status}): ${detail || response.statusText}`);
  }
  return body as T;
}

function projectConfigUrl(project: string): string {
  return `https://identitytoolkit.googleapis.com/v2/projects/${encodeURIComponent(project)}/config`;
}

function googleProviderUrl(project: string): string {
  return `https://identitytoolkit.googleapis.com/v2/projects/${encodeURIComponent(project)}/defaultSupportedIdpConfigs/google.com`;
}

async function fetchProjectConfig(
  project: string,
  token: string,
  fetcher: Fetcher,
): Promise<{ authorizedDomains?: unknown }> {
  const response = await fetcher(projectConfigUrl(project), {
    headers: { Authorization: `Bearer ${token}`, "x-goog-user-project": project },
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  });
  return json(response, "Reading Firebase Auth project configuration");
}

async function fetchGoogleProvider(
  project: string,
  token: string,
  fetcher: Fetcher,
): Promise<{ enabled?: unknown } | null> {
  const response = await fetcher(googleProviderUrl(project), {
    headers: { Authorization: `Bearer ${token}`, "x-goog-user-project": project },
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  });
  if (response.status === 404) return null;
  return json(response, "Reading Firebase Google provider configuration");
}

async function ensureAuthorizedDomains(
  project: string,
  token: string,
  requested: string[],
  fetcher: Fetcher,
): Promise<void> {
  const current = await fetchProjectConfig(project, token, fetcher);
  const existing = stringArray(current.authorizedDomains);
  const next = unique([...existing, ...requested]);
  if (requested.every((domain) => existing.includes(domain))) return;

  const response = await fetcher(`${projectConfigUrl(project)}?updateMask=authorizedDomains`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": project,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ authorizedDomains: next }),
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  });
  await json(response, "Updating Firebase Auth authorized domains");
}

async function inspectWithToken(
  project: string,
  domain: string | undefined,
  token: string,
  fetcher: Fetcher,
): Promise<GoogleAuthCheck> {
  const [config, provider] = await Promise.all([
    fetchProjectConfig(project, token, fetcher),
    fetchGoogleProvider(project, token, fetcher),
  ]);
  const authorizedDomains = stringArray(config.authorizedDomains);
  const expectedDomains = expectedAuthorizedDomains(project, domain);
  const missingDomains = expectedDomains.filter((entry) => !authorizedDomains.includes(entry));
  const googleEnabled = provider?.enabled === true;

  return {
    project,
    googleEnabled,
    authorizedDomains,
    expectedDomains,
    missingDomains,
    ready: googleEnabled && missingDomains.length === 0,
  };
}

async function tryOpenFirebaseAuthConsole(runner: CommandRunner, root: string, project: string): Promise<boolean> {
  try {
    await runner("firebase", ["open", "auth", "--project", project], root);
    return true;
  } catch {
    return false;
  }
}

async function throwSetupFailure(
  error: unknown,
  opts: GoogleAuthSetupOptions,
  runner: CommandRunner,
): Promise<never> {
  const opened = opts.openBrowser !== false && await tryOpenFirebaseAuthConsole(runner, opts.root, opts.project);
  const consoleUrl = `https://console.firebase.google.com/project/${encodeURIComponent(opts.project)}/authentication/providers`;
  throw new Error(
    `Firebase Google sign-in setup could not finish: ${errorMessage(error)}. ` +
    (opened
      ? "Morpheus opened Firebase Authentication in your browser; finish any Firebase consent or terms screen, then rerun the command."
      : `Open ${consoleUrl}, complete any Firebase consent or terms screen, then rerun the command.`),
  );
}

/**
 * Configure Google Auth as deployable Firebase configuration, then prove the
 * remote provider and app domains agree. Both CLIs receive one automatic,
 * browser-backed login attempt before we ask a human to intervene.
 */
export async function setupGoogleAuth(opts: GoogleAuthSetupOptions): Promise<GoogleAuthSetupResult> {
  const runner = opts.runner ?? systemRunner;
  const fetcher = opts.fetcher ?? fetch;

  const allowBrowserLogin = opts.openBrowser !== false;
  const token = await gcloudToken(runner, opts.root, allowBrowserLogin);
  const supportEmail = opts.supportEmail ?? await gcloudEmail(runner, opts.root);

  try {
    await ensureFirebaseLogin(runner, opts.root, allowBrowserLogin);
  } catch (error) {
    return throwSetupFailure(error, opts, runner);
  }

  // Authenticate first. If the browser-backed Firebase session cannot be
  // established, do not mutate a project's shared firebase.json at all.
  const configPath = join(opts.root, "firebase.json");
  const previousConfig = await readIfPresent(configPath);
  await writeGoogleProviderConfig(opts.root, {
    project: opts.project,
    domain: opts.domain,
    supportEmail,
    brand: opts.brand,
  });

  try {
    await runner("firebase", ["deploy", "--only", "auth", "--project", opts.project], opts.root);
  } catch (error) {
    try {
      await restoreFile(configPath, previousConfig);
    } catch (rollbackError) {
      throw new Error(
        `Firebase Auth deploy failed (${errorMessage(error)}) and firebase.json could not be restored: ${errorMessage(rollbackError)}`,
      );
    }
    return throwSetupFailure(error, opts, runner);
  }

  try {
    await ensureAuthorizedDomains(opts.project, token, expectedAuthorizedDomains(opts.project, opts.domain), fetcher);
    const check = await inspectWithToken(opts.project, opts.domain, token, fetcher);
    if (!check.ready) {
      throw new Error(
        `verification found Google enabled=${check.googleEnabled} and missing domains=${check.missingDomains.join(", ") || "none"}`,
      );
    }
    return { ...check, configPath, supportEmail };
  } catch (error) {
    return throwSetupFailure(error, opts, runner);
  }
}

/** Read-only verification for CI and for agents deciding whether setup is needed. */
export async function checkGoogleAuth(opts: GoogleAuthCheckOptions): Promise<GoogleAuthCheck> {
  const runner = opts.runner ?? systemRunner;
  const fetcher = opts.fetcher ?? fetch;
  const token = await gcloudToken(runner, opts.root, false);
  return inspectWithToken(opts.project, opts.domain, token, fetcher);
}
