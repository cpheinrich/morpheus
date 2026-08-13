import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkGoogleAuth,
  expectedAuthorizedDomains,
  expectedRedirectUris,
  mergeGoogleProviderConfig,
  setupGoogleAuth,
  type CommandOptions,
  type CommandRunner,
  type Fetcher,
} from "../src/firebase/google-auth.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface RunnerOptions {
  failures?: Record<string, Error>;
  onCall?: (command: string, args: string[], options?: CommandOptions) => void;
}

function runner(calls: string[][], options: RunnerOptions = {}): CommandRunner {
  return async (command, args, _cwd, commandOptions) => {
    calls.push([command, ...args]);
    options.onCall?.(command, args, commandOptions);
    const failure = options.failures?.[[command, ...args].join(" ")];
    if (failure) throw failure;
    if (command === "gcloud" && args.join(" ") === "auth print-access-token") return { stdout: "token\n", stderr: "" };
    if (command === "gcloud" && args.join(" ") === "config get-value account") return { stdout: "founder@example.com\n", stderr: "" };
    if (command === "firebase" && args.join(" ") === "projects:list --json") return { stdout: "{}", stderr: "" };
    if (command === "firebase" && args.join(" ") === "deploy --only auth --project acme-123") return { stdout: "{}", stderr: "" };
    if (command === "firebase" && args.join(" ") === "open auth --project acme-123") return { stdout: "", stderr: "" };
    throw new Error(`Unexpected command: ${[command, ...args].join(" ")}`);
  };
}

describe("Firebase Google Auth configuration", () => {
  it("keeps the implicit redirect handlers out of the deployed list", () => {
    // Two separate deploy failures, both found the first time this ran against
    // a freshly created project (cph-evo, 2026-08-13):
    //
    //   naming the default → `OAuth 2 redirect URLs have duplicate
    //                        [https://<project>.firebaseapp.com/__/auth/handler]`
    //   naming a port      → `INVALID_AUTHORIZED_DOMAIN : localhost:3000
    //                        should only contain the valid domain`
    //
    // Local development keeps working because `localhost` reaches Auth through
    // the authorized-domains list below, which is a different API.
    expect(expectedRedirectUris("acme-123", "https://app.example")).toEqual(["https://app.example"]);
    expect(expectedRedirectUris("acme-123")).toEqual([]);
    expect(expectedAuthorizedDomains("acme-123", "app.example")).toContain("localhost");
  });

  it("treats manifest-declared Firebase Auth hosts as intentional", () => {
    expect(expectedAuthorizedDomains(
      "acme-123",
      "app.example",
      ["preview.example", "accounts.example"],
    )).toEqual([
      "localhost",
      "acme-123.firebaseapp.com",
      "acme-123.web.app",
      "app.example",
      "preview.example",
      "accounts.example",
    ]);
  });

  it("merges Firebase CLI Google provider configuration without discarding other settings", () => {
    const merged = mergeGoogleProviderConfig(
      {
        hosting: { public: "out" },
        auth: { providers: { emailPassword: true, googleSignIn: { existing: "kept", authorizedRedirectUris: ["https://old.example"] } } },
      },
      { project: "acme-123", domain: "https://app.example", supportEmail: "support@example.com", brand: "Acme" },
    );

    expect(merged.hosting).toEqual({ public: "out" });
    expect(merged.auth).toEqual({
      providers: {
        emailPassword: true,
        googleSignIn: {
          existing: "kept",
          oAuthBrandDisplayName: "Acme",
          supportEmail: "support@example.com",
          // Only the custom origin. Firebase adds its own default handler, so
          // naming `<project>.firebaseapp.com` fails the deploy as a duplicate,
          // and it derives an authorized domain from each entry, so anything
          // with a port fails as an invalid domain. Both were found the first
          // time this ran against a freshly created project.
          authorizedRedirectUris: ["https://old.example", "https://app.example"],
        },
      },
    });
  });

  it("deploys the Google provider object to enable it, repairs domains, and verifies remote state", async () => {
    const root = await mkdtemp(join(tmpdir(), "firebase-google-auth-"));
    roots.push(root);
    await writeFile(join(root, "firebase.json"), JSON.stringify({ firestore: { rules: "firestore.rules" } }));

    const calls: string[][] = [];
    const fetchCalls: Array<{ url: string; method?: string; body?: string }> = [];
    let authorizedDomains = ["localhost"];
    let googleEnabled = false;
    const fetcher: Fetcher = async (url, init) => {
      fetchCalls.push({ url, method: init?.method, body: typeof init?.body === "string" ? init.body : undefined });
      if (url.includes("defaultSupportedIdpConfigs/google.com")) return response({ enabled: googleEnabled });
      if (init?.method === "PATCH") {
        authorizedDomains = JSON.parse(String(init.body)).authorizedDomains;
        return response({ authorizedDomains });
      }
      return response({ authorizedDomains });
    };

    const result = await setupGoogleAuth({
      root,
      project: "acme-123",
      domain: "app.example",
      brand: "Acme",
      runner: runner(calls, {
        onCall(command, args) {
          if (command === "firebase" && args.join(" ") === "deploy --only auth --project acme-123") {
            googleEnabled = true;
          }
        },
      }),
      fetcher,
      openBrowser: false,
    });

    expect(result.ready).toBe(true);
    expect(calls).toContainEqual(["firebase", "deploy", "--only", "auth", "--project", "acme-123"]);
    expect(fetchCalls.some((call) => call.method === "PATCH" && call.body?.includes("app.example"))).toBe(true);
    const config = JSON.parse(await readFile(join(root, "firebase.json"), "utf8"));
    expect(config.firestore).toEqual({ rules: "firestore.rules" });
    expect(config.auth.providers.googleSignIn.supportEmail).toBe("founder@example.com");
    expect(config.auth.providers.googleSignIn.authorizedRedirectUris).toContain("https://app.example");
    expect(config.auth.providers.googleSignIn).not.toHaveProperty("enabled");
  });

  it("opens Firebase Authentication when deployment needs interactive recovery", async () => {
    const root = await mkdtemp(join(tmpdir(), "firebase-google-auth-failure-"));
    roots.push(root);
    const calls: string[][] = [];
    const deploy = "firebase deploy --only auth --project acme-123";

    await expect(setupGoogleAuth({
      root,
      project: "acme-123",
      brand: "Acme",
      runner: runner(calls, { failures: { [deploy]: new Error("permission denied") } }),
      fetcher: async () => response({}),
    })).rejects.toThrow(/Morpheus opened Firebase Authentication/);

    expect(calls).toContainEqual(["firebase", "open", "auth", "--project", "acme-123"]);
    await expect(readFile(join(root, "firebase.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("restores an existing firebase.json when deployment fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "firebase-google-auth-rollback-"));
    roots.push(root);
    const original = '{"hosting":{"public":"out"}}\n';
    await writeFile(join(root, "firebase.json"), original);

    await expect(setupGoogleAuth({
      root,
      project: "acme-123",
      brand: "Acme",
      runner: runner([], {
        failures: { "firebase deploy --only auth --project acme-123": new Error("permission denied") },
      }),
      fetcher: async () => response({}),
      openBrowser: false,
    })).rejects.toThrow(/permission denied/);

    expect(await readFile(join(root, "firebase.json"), "utf8")).toBe(original);
  });

  it("does not touch firebase.json before Firebase CLI authentication succeeds", async () => {
    const root = await mkdtemp(join(tmpdir(), "firebase-google-auth-login-"));
    roots.push(root);
    const calls: string[][] = [];
    const projectsList = "firebase projects:list --json";

    await expect(setupGoogleAuth({
      root,
      project: "acme-123",
      domain: "https://app.example",
      brand: "Acme",
      runner: runner(calls, { failures: { [projectsList]: new Error("not logged in") } }),
      fetcher: async () => response({}),
      openBrowser: false,
    })).rejects.toThrow(/Firebase Google sign-in setup could not finish/);

    await expect(readFile(join(root, "firebase.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps --no-browser non-interactive when Google or Firebase CLI sessions are absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "firebase-google-auth-no-browser-"));
    roots.push(root);

    const googleCalls: string[][] = [];
    await expect(setupGoogleAuth({
      root,
      project: "acme-123",
      domain: "app.example",
      brand: "Acme",
      runner: runner(googleCalls, {
        failures: { "gcloud auth print-access-token": new Error("not logged in") },
      }),
      fetcher: async () => response({}),
      openBrowser: false,
    })).rejects.toThrow(/Could not read a Google access token/);
    expect(googleCalls).not.toContainEqual(["gcloud", "auth", "login"]);
    expect(googleCalls).not.toContainEqual(["firebase", "login"]);

    const firebaseCalls: string[][] = [];
    await expect(setupGoogleAuth({
      root,
      project: "acme-123",
      domain: "app.example",
      brand: "Acme",
      runner: runner(firebaseCalls, {
        failures: { "firebase projects:list --json": new Error("not logged in") },
      }),
      fetcher: async () => response({}),
      openBrowser: false,
    })).rejects.toThrow(/Firebase CLI is not authenticated/);
    expect(firebaseCalls).not.toContainEqual(["gcloud", "auth", "login"]);
    expect(firebaseCalls).not.toContainEqual(["firebase", "login"]);
  });

  it("fails closed when verification sees a disabled provider or missing app domain", async () => {
    const check = await checkGoogleAuth({
      root: "/tmp",
      project: "acme-123",
      domain: "app.example",
      runner: runner([]),
      fetcher: async (url) => url.includes("defaultSupportedIdpConfigs/google.com")
        ? response({}, 404)
        : response({ authorizedDomains: ["localhost"] }),
    });

    expect(check.googleEnabled).toBe(false);
    expect(check.missingDomains).toContain("app.example");
    expect(check.ready).toBe(false);
  });

  it("reports authorized domains that are no longer expected without auto-revoking them", async () => {
    const check = await checkGoogleAuth({
      root: "/tmp",
      project: "acme-123",
      domain: "app.example",
      runner: runner([]),
      fetcher: async (url) => url.includes("defaultSupportedIdpConfigs/google.com")
        ? response({ enabled: true })
        : response({ authorizedDomains: [
          "localhost",
          "acme-123.firebaseapp.com",
          "acme-123.web.app",
          "app.example",
          "old.example",
        ] }),
    });

    expect(check.ready).toBe(true);
    expect(check.unexpectedDomains).toEqual(["old.example"]);
  });

  it("does not warn about an additional authorized domain declared by the project", async () => {
    const check = await checkGoogleAuth({
      root: "/tmp",
      project: "acme-123",
      domain: "app.example",
      authorizedDomains: ["preview.example"],
      runner: runner([]),
      fetcher: async (url) => url.includes("defaultSupportedIdpConfigs/google.com")
        ? response({ enabled: true })
        : response({ authorizedDomains: [
          "localhost",
          "acme-123.firebaseapp.com",
          "acme-123.web.app",
          "app.example",
          "preview.example",
        ] }),
    });

    expect(check.ready).toBe(true);
    expect(check.unexpectedDomains).toEqual([]);
  });

  it("bounds token and Firebase API reads used by status checks", async () => {
    const commandTimeouts: Array<number | undefined> = [];
    const requestSignals: AbortSignal[] = [];

    await checkGoogleAuth({
      root: "/tmp",
      project: "acme-123",
      domain: "app.example",
      runner: runner([], {
        onCall(command, args, options) {
          if (command === "gcloud" && args.join(" ") === "auth print-access-token") {
            commandTimeouts.push(options?.timeoutMs);
          }
        },
      }),
      fetcher: async (url, init) => {
        if (init?.signal) requestSignals.push(init.signal);
        return url.includes("defaultSupportedIdpConfigs/google.com")
          ? response({ enabled: true })
          : response({ authorizedDomains: [
            "localhost",
            "acme-123.firebaseapp.com",
            "acme-123.web.app",
            "app.example",
          ] });
      },
    });

    expect(commandTimeouts).toEqual([10_000]);
    expect(requestSignals).toHaveLength(2);
    expect(requestSignals.every((signal) => !signal.aborted)).toBe(true);
  });
});
