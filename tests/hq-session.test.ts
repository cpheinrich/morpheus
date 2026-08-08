import { describe, expect, it, vi } from "vitest";
import {
  clampExpiresIn,
  createHqSessionCookie,
  HQ_SESSION,
  hqSessionClearOptions,
  hqSessionCookieOptions,
  renewalDue,
  type SessionCookieMinter,
} from "../src/hq/session.js";
import { safeReturnTo } from "../src/hq/return-to.js";

const DAY = 24 * 60 * 60 * 1000;

function minter(): SessionCookieMinter & { calls: { idToken: string; expiresIn: number }[] } {
  const calls: { idToken: string; expiresIn: number }[] = [];
  return {
    calls,
    async createSessionCookie(idToken, options) {
      calls.push({ idToken, expiresIn: options.expiresIn });
      return `cookie-for-${idToken}`;
    },
  };
}

describe("the ceiling is Firebase's, not a preference", () => {
  it("clamps a longer request rather than failing the sign-in", () => {
    // A project asking for 30 days has made a reasonable request against an
    // unreasonable API limit. Throwing here breaks their login over a constant.
    expect(clampExpiresIn(30 * DAY)).toBe(HQ_SESSION.maxExpiresInMs);
    expect(HQ_SESSION.maxExpiresInMs).toBe(14 * DAY);
  });

  it("clamps below Firebase's floor too", () => {
    expect(clampExpiresIn(1000)).toBe(HQ_SESSION.minExpiresInMs);
  });

  it("falls back to the default for a value that is not a number", () => {
    expect(clampExpiresIn(Number.NaN)).toBe(HQ_SESSION.defaultExpiresInMs);
    expect(clampExpiresIn(Number.POSITIVE_INFINITY)).toBe(HQ_SESSION.defaultExpiresInMs);
  });

  it("passes the clamped value to Firebase, and reports what it actually got", async () => {
    const auth = minter();
    const result = await createHqSessionCookie(auth, "id-token", 30 * DAY);

    expect(auth.calls).toEqual([{ idToken: "id-token", expiresIn: HQ_SESSION.maxExpiresInMs }]);
    expect(result.cookie).toBe("cookie-for-id-token");
    // Reported rather than silently different: the caller sets maxAge from it.
    expect(result.expiresInMs).toBe(HQ_SESSION.maxExpiresInMs);
  });

  it("does not import firebase-admin — the minter is a parameter", async () => {
    // The whole design constraint. If this module ever imports firebase-admin,
    // every consumer's edge bundle inherits a Node-only dependency.
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../src/hq/session.ts", import.meta.url), "utf8"),
    );
    expect(source).not.toMatch(/from "firebase-admin/);
  });
});

describe("renewal is what makes the session permanent", () => {
  const iat = 1_000_000;
  const exp = iat + 14 * 24 * 60 * 60;

  it("is not due at the start of the window", () => {
    expect(renewalDue({ iat, exp }, iat * 1000)).toBe(false);
  });

  it("is due once half the window is spent", () => {
    const halfway = (iat + (exp - iat) / 2) * 1000;
    expect(renewalDue({ iat, exp }, halfway)).toBe(true);
    expect(renewalDue({ iat, exp }, halfway - 1000)).toBe(false);
  });

  it("stays due past the end rather than wrapping", () => {
    expect(renewalDue({ iat, exp }, (exp + 10) * 1000)).toBe(true);
  });

  it("says no when the window is unreadable", () => {
    // Re-minting on every request would turn a missing claim into a sign-in
    // storm, so an unreadable window is not evidence that renewal is due.
    expect(renewalDue({ exp }, exp * 1000)).toBe(false);
    expect(renewalDue({ iat }, exp * 1000)).toBe(false);
    expect(renewalDue({}, Date.now())).toBe(false);
    expect(renewalDue({ iat: exp, exp: iat }, Date.now())).toBe(false);
  });
});

describe("cookie attributes are shared so projects cannot disagree", () => {
  it("is httpOnly, secure and lax by default", () => {
    const options = hqSessionCookieOptions();
    expect(options).toMatchObject({
      name: HQ_SESSION.cookieName,
      httpOnly: true,
      secure: true,
      // strict withholds the cookie on the return from Google, so the visitor
      // arrives signed in and reads as signed out.
      sameSite: "lax",
      path: "/",
    });
  });

  it("expresses maxAge in seconds, clamped like the mint", () => {
    expect(hqSessionCookieOptions({ expiresInMs: 30 * DAY }).maxAge).toBe(
      HQ_SESSION.maxExpiresInMs / 1000,
    );
  });

  it("allows secure to be turned off for local http development only", () => {
    expect(hqSessionCookieOptions({ secure: false }).secure).toBe(false);
  });

  it("clears with the same shape and a zero lifetime", () => {
    // Same name and path, or the browser keeps the old cookie alongside.
    const set = hqSessionCookieOptions();
    const clear = hqSessionClearOptions();
    expect(clear.name).toBe(set.name);
    expect(clear.path).toBe(set.path);
    expect(clear.maxAge).toBe(0);
  });
});

describe("returnTo narrowing", () => {
  it("accepts paths under the base, with query and fragment intact", () => {
    expect(safeReturnTo("/hq")).toBe("/hq");
    expect(safeReturnTo("/hq/product/roadmap")).toBe("/hq/product/roadmap");
    expect(safeReturnTo("/hq/finance?year=2026#q3")).toBe("/hq/finance?year=2026#q3");
  });

  it("rejects everything that could leave the origin", () => {
    for (const hostile of [
      "//evil.example",
      "///evil.example",
      "https://evil.example/hq",
      "/\\evil.example",
      "/hq\\..\\..",
      "javascript:alert(1)",
      "hq/product",
    ]) {
      expect(safeReturnTo(hostile), hostile).toBe("/hq");
    }
  });

  it("requires the separator, so a prefix match is not enough", () => {
    // The failure mode a naive startsWith check ships.
    expect(safeReturnTo("/hqevil")).toBe("/hq");
    expect(safeReturnTo("/hq-admin")).toBe("/hq");
  });

  it("rejects paths outside the base", () => {
    expect(safeReturnTo("/settings")).toBe("/hq");
    expect(safeReturnTo("/")).toBe("/hq");
  });

  it("refuses denied destinations, which is how a sign-in loop is avoided", () => {
    const deny = ["/sign-in"];
    expect(safeReturnTo("/hq/sign-in", { base: "/hq", deny: ["/hq/sign-in"] })).toBe("/hq");
    expect(safeReturnTo("/hq/sign-in/", { base: "/hq", deny: ["/hq/sign-in"] })).toBe("/hq");
    expect(safeReturnTo("/hq/product", { base: "/hq", deny })).toBe("/hq/product");
  });

  it("honours a different base and fallback", () => {
    expect(safeReturnTo("/admin/users", { base: "/admin" })).toBe("/admin/users");
    expect(safeReturnTo("/hq/product", { base: "/admin" })).toBe("/admin");
    expect(safeReturnTo("/nope", { base: "/admin", fallback: "/admin/home" })).toBe("/admin/home");
  });

  it("falls back on missing, oversized, or control-character input", () => {
    expect(safeReturnTo(null)).toBe("/hq");
    expect(safeReturnTo(undefined)).toBe("/hq");
    expect(safeReturnTo("")).toBe("/hq");
    expect(safeReturnTo(`/hq/${"a".repeat(600)}`)).toBe("/hq");
    expect(safeReturnTo("/hq/a\nb")).toBe("/hq");
    expect(safeReturnTo("/hq/a\tb")).toBe("/hq");
    expect(safeReturnTo("/hq/a b")).toBe("/hq");
  });

  it("never throws, whatever it is handed", () => {
    const inputs = [null, undefined, "", "/", "//", "\\", "%", "/hq/%zz", "/hq/#", "?"];
    for (const input of inputs) {
      expect(() => safeReturnTo(input), String(input)).not.toThrow();
    }
  });
});

describe("the mint does not enforce authorization", () => {
  it("hands any token to Firebase — the gate is the other half", async () => {
    // Deliberate. A mint that silently enforced the allowlist would make the
    // gate look optional, and the two would drift.
    const auth = minter();
    const spy = vi.spyOn(auth, "createSessionCookie");
    await createHqSessionCookie(auth, "token-for-someone-unauthorized");
    expect(spy).toHaveBeenCalledOnce();
  });
});
