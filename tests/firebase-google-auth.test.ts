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

function runner(calls: string[][], failures: Record<string, Error> = {}): CommandRunner {
  return async (command, args) => {
    calls.push([command, ...args]);
    const failure = failures[[command, ...args].join(" ")];
    if (failure) throw failure;
    if (command === "gcloud" && args.join(" ") === "auth print-access-token") return { stdout: "token\n", stderr: "" };
    if (command === "gcloud" && args.join(" ") === "config get-value account") return { stdout: "founder@example.com\n", stderr: "" };
    return { stdout: "{}", stderr: "" };
  };
}

describe("Firebase Google Auth configuration", () => {
  it("merges a deployable Google provider config without discarding other Firebase settings", () => {
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
    const fetcher: Fetcher = async (url, init) => {
      fetchCalls.push({ url, method: init?.method, body: typeof init?.body === "string" ? init.body : undefined });
      if (url.includes("defaultSupportedIdpConfigs/google.com")) return response({ enabled: true });
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
      runner: runner(calls),
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
      runner: runner(calls, { [deploy]: new Error("permission denied") }),
      fetcher: async () => response({}),
    })).rejects.toThrow(/Morpheus opened Firebase Authentication/);

    expect(calls).toContainEqual(["firebase", "open", "auth", "--project", "acme-123"]);
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
