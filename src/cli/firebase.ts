import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AuthorizedDomain, SupportEmail } from "../access/schema.js";
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
  /** User-visible support identity deployed to the Google OAuth brand. */
  supportEmail?: string;
  /** Additional intentional Firebase Auth hostnames. */
  authorizedDomains?: string[];
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

function validatedSupportEmail(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const parsed = SupportEmail.safeParse(value);
  if (!parsed.success) throw new Error(`supportEmail must be a valid email address: ${value}`);
  return parsed.data;
}

function validatedAuthorizedDomains(values: string[] | undefined): string[] {
  if (values === undefined) return [];
  const parsed = AuthorizedDomain.array().safeParse(values);
  if (!parsed.success) {
    throw new Error("authorizedDomains must contain hostnames without a scheme, port, or path.");
  }
  return parsed.data;
}

function printCheck(prefix: string, result: Awaited<ReturnType<typeof checkGoogleAuth>>): void {
  const domains = result.missingDomains.length ? `missing ${result.missingDomains.join(", ")}` : "all requested domains present";
  console.log(`${prefix} ${result.project}: Google provider ${result.googleEnabled ? "enabled" : "disabled"}; ${domains}.`);
  if (result.unexpectedDomains.length) {
    console.log(`  Review unexpected authorized domains: ${result.unexpectedDomains.join(", ")}.`);
  }
}

export interface FirebaseAuthOptions {
  project?: string;
  domain?: string;
  supportEmail?: string;
  brand?: string;
  openBrowser: boolean;
}

async function recordGoogleAuthDefaults(
  root: string,
  config: FirebaseManifest,
  domain: string,
  supportEmail: string,
): Promise<{ publicDomain: string; supportEmail: string }> {
  const publicDomain = normalizeOrigin(domain);
  if (config.publicDomain === publicDomain && config.supportEmail === supportEmail) {
    return { publicDomain, supportEmail };
  }
  await writeFile(
    join(root, "morpheus.json"),
    `${JSON.stringify({ ...config, publicDomain, supportEmail }, null, 2)}\n`,
    "utf8",
  );
  return { publicDomain, supportEmail };
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
      supportEmail: validatedSupportEmail(opts.supportEmail ?? config.supportEmail),
      authorizedDomains: validatedAuthorizedDomains(config.authorizedDomains),
      brand: opts.brand ?? config.displayName ?? config.name ?? project,
      openBrowser: opts.openBrowser,
    });
    let recorded: { publicDomain: string; supportEmail: string };
    try {
      recorded = await recordGoogleAuthDefaults(
        root,
        config,
        domain,
        validatedSupportEmail(result.supportEmail)!,
      );
    } catch (error) {
      throw new Error(
        "Firebase Google sign-in is configured and verified, but Morpheus could not record " +
        `publicDomain/supportEmail in morpheus.json: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    console.log(`✓ Firebase Google sign-in configured for ${result.project}.`);
    console.log(`  Firebase configuration: ${result.configPath}`);
    console.log(`  Support email: ${recorded.supportEmail}`);
    console.log(`  Public origin: ${recorded.publicDomain}`);
    console.log(`  Authorized domains: ${result.authorizedDomains.join(", ")}`);
    if (result.unexpectedDomains.length) {
      console.log(`  Review unexpected authorized domains: ${result.unexpectedDomains.join(", ")}.`);
    }
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
    const result = await checkGoogleAuth({
      root,
      project,
      domain,
      authorizedDomains: validatedAuthorizedDomains(config.authorizedDomains),
    });
    printCheck(result.ready ? "✓" : "✗", result);
    return result.ready ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
