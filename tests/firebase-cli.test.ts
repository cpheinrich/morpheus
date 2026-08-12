import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configureGoogleAuth } from "../src/cli/firebase.js";
import { setupGoogleAuth } from "../src/firebase/google-auth.js";

vi.mock("../src/firebase/google-auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/firebase/google-auth.js")>();
  return { ...actual, setupGoogleAuth: vi.fn() };
});

const roots: string[] = [];
const setup = vi.mocked(setupGoogleAuth);

afterEach(async () => {
  vi.restoreAllMocks();
  setup.mockReset();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Firebase Auth CLI", () => {
  it("records the canonical public origin only after setup succeeds", async () => {
    const root = await mkdtemp(join(tmpdir(), "firebase-google-auth-cli-"));
    roots.push(root);
    await writeFile(join(root, "morpheus.json"), JSON.stringify({
      name: "Acme",
      prefix: "AC",
      accounts: { firebase: "acme-123" },
    }));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    setup.mockResolvedValue({
      project: "acme-123",
      googleEnabled: true,
      authorizedDomains: ["app.example"],
      expectedDomains: ["app.example"],
      missingDomains: [],
      ready: true,
      configPath: join(root, "firebase.json"),
      supportEmail: "founder@example.com",
    });

    const result = await configureGoogleAuth(root, {
      domain: "app.example",
      openBrowser: false,
    });

    expect(result).toBe(0);
    expect(JSON.parse(await readFile(join(root, "morpheus.json"), "utf8"))).toEqual({
      name: "Acme",
      prefix: "AC",
      accounts: { firebase: "acme-123" },
      publicDomain: "https://app.example",
    });
  });

  it("does not record the public origin when setup fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "firebase-google-auth-cli-failure-"));
    roots.push(root);
    await writeFile(join(root, "morpheus.json"), JSON.stringify({
      name: "Acme",
      accounts: { firebase: "acme-123" },
    }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    setup.mockRejectedValue(new Error("deploy failed"));

    const result = await configureGoogleAuth(root, {
      domain: "app.example",
      openBrowser: false,
    });

    expect(result).toBe(1);
    expect(JSON.parse(await readFile(join(root, "morpheus.json"), "utf8"))).not.toHaveProperty("publicDomain");
  });
});
