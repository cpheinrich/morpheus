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

  it("distinguishes unspecified from unbounded", () => {
    // NaN is the only genuinely unspecified value. Infinity is a caller saying
    // "as long as you will give me", which the clamp answers correctly — and
    // reading it as "unspecified" would quietly hand back less than the ceiling.
    expect(clampExpiresIn(Number.NaN)).toBe(HQ_SESSION.defaultExpiresInMs);
    expect(clampExpiresIn(Number.POSITIVE_INFINITY)).toBe(HQ_SESSION.maxExpiresInMs);
    expect(clampExpiresIn(Number.NEGATIVE_INFINITY)).toBe(HQ_SESSION.minExpiresInMs);
  });

  it("passes the clamped value to Firebase, and reports what it actually got", async () => {
    const auth = minter();
    const result = await createHqSessionCookie(auth, "id-token", 30 * DAY);

    expect(auth.calls).toEqual([{ idToken: "id-token", expiresIn: HQ_SESSION.maxExpiresInMs }]);
    expect(result.cookie).toBe("cookie-for-id-token");
    // Reported rather than silently different: the caller sets maxAge from it.
    expect(result.expiresInMs).toBe(HQ_SESSION.maxExpiresInMs);
  });

  it("does not default to the ceiling", async () => {
    // The gate reads the role out of the payload and the edge cannot run
    // checkRevoked, so the window is also how long a revoked account keeps
    // working. Defaulting to the maximum hands every project the most
    // permissive value by accident.
    expect(HQ_SESSION.defaultExpiresInMs).toBeLessThan(HQ_SESSION.maxExpiresInMs);

    const auth = minter();
    await createHqSessionCookie(auth, "id-token");
    expect(auth.calls[0]!.expiresIn).toBe(HQ_SESSION.defaultExpiresInMs);
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

  it("rejects dot-segments, which the browser resolves after this function approves them", () => {
    // `/hq/../admin` starts with `/hq/` and lands on `/admin`, so the prefix
    // check is meaningless without this. The backslash forms were already
    // rejected by the backslash guard, which is what made this read as covered.
    expect(safeReturnTo("/hq/../admin")).toBe("/hq");
    expect(safeReturnTo("/hq/../../etc/whatever")).toBe("/hq");
    expect(safeReturnTo("/hq/./product")).toBe("/hq");
    expect(safeReturnTo("/hq/product/../../admin")).toBe("/hq");
  });

  it("does not let a dot-segment walk around deny", () => {
    // `/hq/../hq/sign-in` is not string-equal to `/hq/sign-in`, so it would
    // pass the deny check and then resolve straight back to the sign-in page —
    // the exact loop deny exists to prevent.
    expect(safeReturnTo("/hq/../hq/sign-in", { base: "/hq", deny: ["/hq/sign-in"] })).toBe("/hq");
  });

  it("rejects the percent-encoded dot-segments the URL spec also collapses", () => {
    // WHATWG defines a double-dot segment as `..` or a case-insensitive
    // `.%2e` / `%2e.` / `%2e%2e`. Verified against new URL(): each of these
    // resolves to /admin, so a guard matching only the literal spelling is
    // not a guard.
    expect(safeReturnTo("/hq/%2e%2e/admin")).toBe("/hq");
    expect(safeReturnTo("/hq/%2E%2E/admin")).toBe("/hq");
    expect(safeReturnTo("/hq/.%2e/admin")).toBe("/hq");
    expect(safeReturnTo("/hq/%2e./admin")).toBe("/hq");
    expect(safeReturnTo("/hq/%2e/product")).toBe("/hq");
  });

  it("does not let an encoded dot-segment walk around deny either", () => {
    expect(safeReturnTo("/hq/%2e%2e/hq/sign-in", { base: "/hq", deny: ["/hq/sign-in"] })).toBe(
      "/hq",
    );
  });

  it("keeps a dot inside a segment, which is an ordinary filename", () => {
    expect(safeReturnTo("/hq/reports/q3.2026")).toBe("/hq/reports/q3.2026");
    expect(safeReturnTo("/hq/..well-known")).toBe("/hq/..well-known");
    // `%2ee` is not a dot-segment and new URL() leaves it alone, so an
    // over-eager substring replace would reject a legitimate path.
    expect(safeReturnTo("/hq/%2ee/x")).toBe("/hq/%2ee/x");
  });

  it("treats an empty base as a misconfiguration, not as root", () => {
    // Falling through would strip to "/", hit the root special-case, and
    // silently admit every path — the same no-throw-no-log shape as a check
    // that admits nothing. "//" reaches root by a different route than "" does,
    // so both spellings are covered.
    for (const base of ["", "//", "///"]) {
      expect(safeReturnTo("/anywhere", { base }), base).toBe("/hq");
      expect(safeReturnTo("/hq/product", { base }), base).toBe("/hq/product");
    }
  });

  it("still treats a single slash as the deliberate root it is", () => {
    // The distinction the empty-base guard has to preserve: "/" is what a
    // project whose whole origin sits behind the gate actually passes, and
    // conflating it with "" would remove the case root support exists for.
    expect(safeReturnTo("/anywhere", { base: "/" })).toBe("/anywhere");
  });

  it("denies a subtree, not just the exact path", () => {
    // A sign-in flow with sub-routes bounces the same way, so an exact match
    // would cover the parent and silently miss every step under it.
    const deny = ["/hq/sign-in"];
    expect(safeReturnTo("/hq/sign-in", { deny })).toBe("/hq");
    expect(safeReturnTo("/hq/sign-in/verify", { deny })).toBe("/hq");
    expect(safeReturnTo("/hq/sign-in/verify?code=1", { deny })).toBe("/hq");
    // But the separator is still required — a sibling is not a subtree.
    expect(safeReturnTo("/hq/sign-in-help", { deny })).toBe("/hq/sign-in-help");
  });

  it("admits any same-origin path when the base is root", () => {
    // A project whose whole origin sits behind the gate sets base: "/". The
    // prefix test cannot express that — `startsWith("//")` was already
    // rejected — so without a special case every destination falls back and
    // the `next` parameter silently does nothing.
    expect(safeReturnTo("/anything/at/all", { base: "/" })).toBe("/anything/at/all");
    expect(safeReturnTo("/", { base: "/" })).toBe("/");
    expect(safeReturnTo("//evil.example", { base: "/" })).toBe("/");
    expect(safeReturnTo("/../etc", { base: "/" })).toBe("/");
    expect(safeReturnTo("/sign-in", { base: "/", deny: ["/sign-in"] })).toBe("/");
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
