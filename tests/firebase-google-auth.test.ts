import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkGoogleAuth,
  expectedAuthorizedDomains,
  mergeGoogleProviderConfig,
  setupGoogleAuth,
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
  onCall?: (command: string, args: string[]) => void;
}

function runner(calls: string[][], options: RunnerOptions = {}): CommandRunner {
  return async (command, args) => {
    calls.push([command, ...args]);
    options.onCall?.(command, args);
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
          authorizedRedirectUris: [
            "https://old.example",
            "http://localhost:3000",
            "https://acme-123.firebaseapp.com",
            "https://acme-123.web.app",
            "https://app.example",
          ],
        },
      },
    });
  });

  it("deploys provider configuration, repairs custom domains, and verifies the remote state", async () => {
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
});
