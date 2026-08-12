import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  checkGoogleAuth,
  normalizeOrigin,
  setupGoogleAuth,
} from "../firebase/google-auth.js";

interface FirebaseManifest {
  name?: string;
  displayName?: string;
  /** Canonical public origin used by Firebase Google sign-in. */
  publicDomain?: string;
  accounts?: Record<string, string>;
}

async function manifest(root: string): Promise<FirebaseManifest> {
  try {
    return JSON.parse(await readFile(join(root, "morpheus.json"), "utf8")) as FirebaseManifest;
  } catch (error) {
    throw new Error(`Could not read morpheus.json: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function targetProject(config: FirebaseManifest, explicit?: string): string | null {
  return explicit ?? config.accounts?.firebase ?? config.accounts?.gcpProject ?? null;
}

function targetDomain(config: FirebaseManifest, explicit?: string): string | null {
  return explicit ?? config.publicDomain ?? null;
}

function printCheck(prefix: string, result: Awaited<ReturnType<typeof checkGoogleAuth>>): void {
  const domains = result.missingDomains.length ? `missing ${result.missingDomains.join(", ")}` : "all requested domains present";
  console.log(`${prefix} ${result.project}: Google provider ${result.googleEnabled ? "enabled" : "disabled"}; ${domains}.`);
}

export interface FirebaseAuthOptions {
  project?: string;
  domain?: string;
  supportEmail?: string;
  brand?: string;
  openBrowser: boolean;
}

async function recordPublicDomain(
  root: string,
  config: FirebaseManifest,
  domain: string,
): Promise<string> {
  const publicDomain = normalizeOrigin(domain);
  if (config.publicDomain === publicDomain) return publicDomain;
  await writeFile(
    join(root, "morpheus.json"),
    `${JSON.stringify({ ...config, publicDomain }, null, 2)}\n`,
    "utf8",
  );
  return publicDomain;
}

export async function configureGoogleAuth(
  root: string,
  opts: FirebaseAuthOptions,
): Promise<number> {
  try {
    const config = await manifest(root);
    const project = targetProject(config, opts.project);
    if (!project) {
      console.error("No Firebase project. Pass --project, or set accounts.firebase in morpheus.json.");
      return 1;
    }
    const domain = targetDomain(config, opts.domain);
    if (!domain) {
      console.error("No public app origin. Pass --domain, or set publicDomain in morpheus.json.");
      return 1;
    }
    const result = await setupGoogleAuth({
      root,
      project,
      domain,
      supportEmail: opts.supportEmail,
      brand: opts.brand ?? config.displayName ?? config.name ?? project,
      openBrowser: opts.openBrowser,
    });
    const publicDomain = await recordPublicDomain(root, config, domain);
    console.log(`✓ Firebase Google sign-in configured for ${result.project}.`);
    console.log(`  Firebase configuration: ${result.configPath}`);
    console.log(`  Support email: ${result.supportEmail}`);
    console.log(`  Public origin: ${publicDomain}`);
    console.log(`  Authorized domains: ${result.authorizedDomains.join(", ")}`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export async function checkGoogleAuthConfiguration(root: string, opts: FirebaseAuthOptions): Promise<number> {
  try {
    const config = await manifest(root);
    const project = targetProject(config, opts.project);
    if (!project) {
      console.error("No Firebase project. Pass --project, or set accounts.firebase in morpheus.json.");
      return 1;
    }
    const domain = targetDomain(config, opts.domain);
    if (!domain) {
      console.error("No public app origin. Pass --domain, or set publicDomain in morpheus.json.");
      return 1;
    }
    const result = await checkGoogleAuth({ root, project, domain });
    printCheck(result.ready ? "✓" : "✗", result);
    return result.ready ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
