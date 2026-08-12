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
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    setup.mockResolvedValue({
      project: "acme-123",
      googleEnabled: true,
      authorizedDomains: ["app.example"],
      expectedDomains: ["app.example"],
      missingDomains: [],
      unexpectedDomains: ["old.example"],
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
      supportEmail: "founder@example.com",
    });
    expect(log.mock.calls.flat().join("\n")).toContain("Review unexpected authorized domains: old.example");
  });

  it("reuses the durable support email when the flag is omitted", async () => {
    const root = await mkdtemp(join(tmpdir(), "firebase-google-auth-cli-support-"));
    roots.push(root);
    await writeFile(join(root, "morpheus.json"), JSON.stringify({
      name: "Acme",
      accounts: { firebase: "acme-123" },
      publicDomain: "https://app.example",
      supportEmail: "support@example.com",
      authorizedDomains: ["preview.example"],
    }));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    setup.mockResolvedValue({
      project: "acme-123",
      googleEnabled: true,
      authorizedDomains: ["app.example"],
      expectedDomains: ["app.example"],
      missingDomains: [],
      unexpectedDomains: [],
      ready: true,
      configPath: join(root, "firebase.json"),
      supportEmail: "support@example.com",
    });

    expect(await configureGoogleAuth(root, { openBrowser: false })).toBe(0);
    expect(setup).toHaveBeenCalledWith(expect.objectContaining({
      domain: "https://app.example",
      supportEmail: "support@example.com",
      authorizedDomains: ["preview.example"],
    }));
  });

  it("rejects a malformed support email before changing remote or local state", async () => {
    const root = await mkdtemp(join(tmpdir(), "firebase-google-auth-cli-invalid-email-"));
    roots.push(root);
    const original = JSON.stringify({ name: "Acme", accounts: { firebase: "acme-123" } });
    await writeFile(join(root, "morpheus.json"), original);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await configureGoogleAuth(root, {
      domain: "app.example",
      supportEmail: "not-an-email",
      openBrowser: false,
    })).toBe(1);

    expect(setup).not.toHaveBeenCalled();
    expect(await readFile(join(root, "morpheus.json"), "utf8")).toBe(original);
    expect(error.mock.calls.flat().join("\n")).toContain("supportEmail must be a valid email address");
  });

  it("rejects a malformed support email returned by setup instead of recording it", async () => {
    const root = await mkdtemp(join(tmpdir(), "firebase-google-auth-cli-invalid-result-"));
    roots.push(root);
    const original = JSON.stringify({ name: "Acme", accounts: { firebase: "acme-123" } });
    await writeFile(join(root, "morpheus.json"), original);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    setup.mockResolvedValue({
      project: "acme-123",
      googleEnabled: true,
      authorizedDomains: ["app.example"],
      expectedDomains: ["app.example"],
      missingDomains: [],
      unexpectedDomains: [],
      ready: true,
      configPath: join(root, "firebase.json"),
      supportEmail: "not-an-email",
    });

    expect(await configureGoogleAuth(root, {
      domain: "app.example",
      openBrowser: false,
    })).toBe(1);
    expect(await readFile(join(root, "morpheus.json"), "utf8")).toBe(original);
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
