import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiAuthSession, authRoles, hqAllowlist, signInForm, type TemplateContext } from "../src/web/templates.js";
import { apiAuthSessionRoute } from "../src/web/consumer-auth/templates-app.js";
import { libAuthSessionClient } from "../src/web/consumer-auth/templates-lib.js";
import type { ConsumerAuthContext } from "../src/web/consumer-auth/context.js";

// Execute the generated route itself with its external services supplied as fakes.
// This catches a template that renders plausible text but makes the wrong auth decision.
function runnable(source: string): string {
  const noImports = source.replace(/^import\s+[^;]*;\n/gm, "").replaceAll("export ", "");
  return ts.transpileModule(noImports, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
}

const context = { imp: () => "stub" } as unknown as TemplateContext;
const roles = new Function(`${runnable(authRoles())}\nreturn isRole;`)() as (value: unknown) => boolean;
const manifest = {
  hq: {
    investorAllowlist: ["investor@example.com"],
    allowlist: ["staff@example.com", "boss@example.com"],
    admins: ["boss@example.com"],
  },
};
const roleForEmail = new Function("manifest", `${runnable(hqAllowlist("../../../../morpheus.json"))}\nreturn roleForEmail;`)(manifest) as (email: string | undefined) => string | null;

const auth = {
  verifyIdToken: vi.fn(), getUser: vi.fn(), setCustomUserClaims: vi.fn(),
  revokeRefreshTokens: vi.fn(), createSessionCookie: vi.fn(),
};
const setCookie = vi.fn();
const NextResponse = {
  json: (body: unknown, options: { status?: number } = {}) => ({
    status: options.status ?? 200, body, cookies: { set: setCookie }, json: async () => body,
  }),
};
const POST = new Function(
  "NextResponse", "isRole", "roleForEmail", "adminAuth", "SESSION_COOKIE_NAME", "SESSION_MAX_AGE_MS",
  `${runnable(apiAuthSession(context, "Acme"))}\nreturn POST;`,
)(NextResponse, roles, roleForEmail, () => auth, "session", 1000) as (request: Request) => Promise<{ status: number; body: unknown }>;
const consumerPost = new Function(
  "NextResponse", "isSameOrigin", "isRole", "roleForEmail", "adminAuth",
  "SESSION_COOKIE_NAME", "SESSION_MAX_AGE_MS", "SIGNED_IN_HINT_COOKIE_NAME",
  `${runnable(apiAuthSessionRoute({ name: "Acme" } as ConsumerAuthContext))}\nreturn POST;`,
)(NextResponse, () => true, roles, roleForEmail, () => auth, "session", 1000, "hint") as
  (request: Request) => Promise<{ status: number; body: unknown }>;

function post(): Promise<{ status: number; body: unknown }> {
  return POST(new Request("https://example.com/api/auth/session", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: "verified-token" }),
  }));
}

function postConsumer(): Promise<{ status: number; body: unknown }> {
  return consumerPost(new Request("https://example.com/api/auth/session", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: "verified-token" }),
  }));
}

function signedIn(email: string, role?: string, provider = "google.com", verified = true): void {
  auth.verifyIdToken.mockResolvedValue({ uid: "uid-1", sub: "uid-1", auth_time: Math.floor(Date.now() / 1000), email, email_verified: verified, role, firebase: { sign_in_provider: provider } });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.getUser.mockResolvedValue({ customClaims: { existing: "kept" } });
  auth.createSessionCookie.mockResolvedValue("session-cookie");
});

describe("generated consumer-auth route with HQ", () => {
  it("grants a listed Google account before minting a session", async () => {
    signedIn("staff@example.com");
    expect(await postConsumer()).toMatchObject({ status: 409, body: { refreshToken: true } });
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith("uid-1", { existing: "kept", role: "employee" });
    expect(auth.createSessionCookie).not.toHaveBeenCalled();
    signedIn("staff@example.com", "employee");
    auth.getUser.mockResolvedValue({ customClaims: { existing: "kept", role: "employee" } });
    expect(await postConsumer()).toMatchObject({ status: 200, body: { ok: true, role: "employee" } });
    expect(auth.createSessionCookie).toHaveBeenCalledWith("verified-token", { expiresIn: 1000 });
  });

  it("still creates a consumer session without an HQ role", async () => {
    signedIn("consumer@example.com", undefined, "password", false);
    expect(await postConsumer()).toMatchObject({ status: 200, body: { ok: true, role: null } });
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it("revokes a stale HQ role before a consumer session can be minted", async () => {
    signedIn("removed@example.com", "employee");
    auth.getUser.mockResolvedValue({ customClaims: { existing: "kept", role: "employee" } });
    expect((await postConsumer()).status).toBe(401);
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith("uid-1", { existing: "kept" });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith("uid-1");
    expect(auth.createSessionCookie).not.toHaveBeenCalled();
  });

  it("removes a stored grant even when an older token has no role", async () => {
    signedIn("removed@example.com");
    auth.getUser.mockResolvedValue({ customClaims: { existing: "kept", role: "employee" } });
    expect((await postConsumer()).status).toBe(401);
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith("uid-1", { existing: "kept" });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith("uid-1");
    expect(auth.createSessionCookie).not.toHaveBeenCalled();
  });

  it("refreshes the consumer client token once after a new grant", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ status: 409, ok: false, json: async () => ({ refreshToken: true }) })
      .mockResolvedValueOnce({ status: 200, ok: true });
    const clientAuth = { signOut: vi.fn() };
    const establishSession = new Function("fetch", "getClientAuth", "sessionErrorMessage",
      `${runnable(libAuthSessionClient({ name: "Acme" } as ConsumerAuthContext))}\nreturn establishSession;`,
    )(fetchMock, () => clientAuth, () => "error") as
      (user: { getIdToken: (force?: boolean) => Promise<string> }) => Promise<unknown>;
    const getIdToken = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("fresh");
    expect(await establishSession({ getIdToken })).toBeNull();
    expect(getIdToken.mock.calls).toEqual([[false], [true]]);
    expect(fetchMock).toHaveBeenCalledTimes(3); // two session requests, then profile provisioning
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ idToken: "fresh" });
    expect(clientAuth.signOut).not.toHaveBeenCalled();
  });
});

describe("generated HQ first sign-in", () => {
  it("resolves the deployed lists case-insensitively with admin precedence", () => {
    expect(roleForEmail("STAFF@example.com")).toBe("employee");
    expect(roleForEmail("boss@example.com")).toBe("admin");
    expect(roleForEmail("investor@example.com")).toBe("investor");
    expect(roleForEmail("stranger@example.com")).toBeNull();
  });

  it("grants a listed Google account only after its token has the new claim", async () => {
    signedIn("staff@example.com");
    expect(await post()).toMatchObject({ status: 409, body: { refreshToken: true } });
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith("uid-1", { existing: "kept", role: "employee" });
    expect(auth.createSessionCookie).not.toHaveBeenCalled();

    signedIn("staff@example.com", "employee");
    expect(await post()).toMatchObject({ status: 200, body: { ok: true, role: "employee" } });
    expect(auth.createSessionCookie).toHaveBeenCalledWith("verified-token", { expiresIn: 1000 });
    expect(setCookie).toHaveBeenCalledWith(expect.objectContaining({ name: "session", value: "session-cookie" }));
  });

  it("repairs an outdated role without minting a cookie", async () => {
    signedIn("boss@example.com", "employee");
    expect((await post()).status).toBe(409);
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith("uid-1", { existing: "kept", role: "admin" });
    expect(auth.createSessionCookie).not.toHaveBeenCalled();
  });

  it("denies an unlisted account and removes its stale role while preserving other claims", async () => {
    signedIn("removed@example.com", "employee");
    auth.getUser.mockResolvedValue({ customClaims: { existing: "kept", role: "employee" } });
    expect((await post()).status).toBe(403);
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith("uid-1", { existing: "kept" });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith("uid-1");
    expect(auth.createSessionCookie).not.toHaveBeenCalled();
  });

  it("denies an unlisted account without changing unrelated claims", async () => {
    signedIn("stranger@example.com");
    expect((await post()).status).toBe(403);
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it("does not grant an unverified email or a non-Google provider", async () => {
    signedIn("staff@example.com", undefined, "google.com", false);
    expect((await post()).status).toBe(403);
    signedIn("staff@example.com", undefined, "password", true);
    expect((await post()).status).toBe(403);
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it("refreshes exactly once in the generated client before retrying session creation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ status: 409, ok: false, json: async () => ({ refreshToken: true }) })
      .mockResolvedValueOnce({ status: 200, ok: true });
    const createHqSession = new Function("fetch", `${runnable(signInForm(context))}\nreturn createHqSession;`)(fetchMock) as
      (user: { getIdToken: (force: boolean) => Promise<string> }) => Promise<{ status: number }>;
    const getIdToken = vi.fn().mockResolvedValueOnce("first-token").mockResolvedValueOnce("fresh-token");
    expect((await createHqSession({ getIdToken })).status).toBe(200);
    expect(getIdToken.mock.calls).toEqual([[false], [true]]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ idToken: "first-token" });
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ idToken: "fresh-token" });
    expect(signInForm(context)).toContain("await getClientAuth().signOut()");
  });

  it("does not refresh a denied account's client token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 403, ok: false, json: async () => ({ error: "denied" }) });
    const createHqSession = new Function("fetch", `${runnable(signInForm(context))}\nreturn createHqSession;`)(fetchMock) as
      (user: { getIdToken: (force: boolean) => Promise<string> }) => Promise<{ status: number }>;
    const getIdToken = vi.fn().mockResolvedValue("first-token");
    expect((await createHqSession({ getIdToken })).status).toBe(403);
    expect(getIdToken.mock.calls).toEqual([[false]]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
