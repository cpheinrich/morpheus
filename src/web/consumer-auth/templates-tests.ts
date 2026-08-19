/**
 * Consumer-auth test-suite templates — Layer D of cpheinrich/morpheus#135.
 *
 * The tests travel with the scaffold because they are the contract: each one
 * encodes a finding from Evo's two agent-review rounds as a regression. The
 * enumeration oracle, the login CSRF, the backslash open redirect, the
 * emulator branch being dead without its env var, the cross-device
 * verification lockout — all were real, and all are pinned below.
 *
 * Extracted from Evo, same contract as templates-lib.ts.
 */

import type { ConsumerAuthContext as Ctx } from "./context.js";

/** __tests__/auth-config.test.mjs */
export const unitAuthConfigTest = (ctx: Ctx): string => `import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { credentialStrategy, resolveEnvironment } from "../lib/firebase/config.ts";
import { toClaims, verifySessionCookie } from "../lib/auth/session-cookie.ts";
import { canAccessHq, isAdmin, isRole } from "../lib/auth/roles.ts";

/**
 * These three functions decide which database a deployment writes to, which
 * credential it writes with, and who the writer is. None of them fails loudly
 * when it is wrong: the first symptom of a bad branch here is test data in the
 * production project, or a consumer reading /hq.
 */

describe("resolveEnvironment", () => {
  it("sends a Vercel production build to production", () => {
    assert.equal(resolveEnvironment({ VERCEL_ENV: "production" }), "production");
  });

  it("sends previews to staging", () => {
    assert.equal(resolveEnvironment({ VERCEL_ENV: "preview" }), "staging");
  });

  it("sends local development to staging", () => {
    assert.equal(resolveEnvironment({}), "staging");
  });

  it("defaults to staging for an unrecognised VERCEL_ENV", () => {
    // The open-world case: a new Vercel environment name must not be treated
    // as production just because it is not "preview".
    assert.equal(resolveEnvironment({ VERCEL_ENV: "whatever" }), "staging");
  });

  it("honours an explicit override in both directions", () => {
    assert.equal(
      resolveEnvironment({ NEXT_PUBLIC_FIREBASE_ENV: "production", VERCEL_ENV: "preview" }),
      "production",
    );
    assert.equal(
      resolveEnvironment({ NEXT_PUBLIC_FIREBASE_ENV: "staging", VERCEL_ENV: "production" }),
      "staging",
    );
  });

  it("ignores an override it does not recognise rather than trusting it", () => {
    // A typo like "prod" must not silently become production.
    assert.equal(
      resolveEnvironment({ NEXT_PUBLIC_FIREBASE_ENV: "prod", VERCEL_ENV: "preview" }),
      "staging",
    );
  });
});

describe("credentialStrategy", () => {
  it("prefers an explicit service-account key everywhere", () => {
    assert.equal(
      credentialStrategy({ FIREBASE_SERVICE_ACCOUNT: "{}", VERCEL: "1" }, "production"),
      "service-account",
    );
    assert.equal(
      credentialStrategy({ FIREBASE_SERVICE_ACCOUNT: "{}" }, "staging"),
      "service-account",
    );
  });

  it("federates on Vercel in production", () => {
    assert.equal(credentialStrategy({ VERCEL: "1" }, "production"), "workload-identity");
  });

  it("refuses to federate from staging rather than authenticating as production", () => {
    // The pool is configured for ${ctx.production.projectId} only. Falling through would mint a
    // valid production token and present it to the staging project, failing
    // with a 403 that names none of that.
    assert.throws(
      () => credentialStrategy({ VERCEL: "1" }, "staging"),
      /FIREBASE_SERVICE_ACCOUNT/,
    );
  });

  it("uses local ADC off Vercel", () => {
    assert.equal(credentialStrategy({}, "staging"), "adc");
    assert.equal(credentialStrategy({}, "production"), "adc");
  });
});

describe("toClaims", () => {
  it("reads a consumer session as authenticated with no role", () => {
    assert.deepEqual(toClaims({ sub: "uid-1", email: "a@b.com", email_verified: true }), {
      uid: "uid-1",
      email: "a@b.com",
      emailVerified: true,
      role: null,
    });
  });

  it("treats an absent email_verified claim as unverified", () => {
    assert.equal(toClaims({ sub: "uid-1" })?.emailVerified, false);
  });

  it("treats a truthy non-boolean email_verified as unverified", () => {
    // Strict equality, deliberately: this value gates writes, so anything
    // Google did not put there as a real boolean must not pass.
    assert.equal(toClaims({ sub: "uid-1", email_verified: "true" })?.emailVerified, false);
    assert.equal(toClaims({ sub: "uid-1", email_verified: 1 })?.emailVerified, false);
  });

  it("keeps a recognised role", () => {
    assert.equal(toClaims({ sub: "uid-1", role: "admin" })?.role, "admin");
  });

  it("discards a role it does not recognise", () => {
    // A claim this file does not know is no role at all — never a role that
    // might match something downstream.
    assert.equal(toClaims({ sub: "uid-1", role: "superuser" })?.role, null);
    assert.equal(toClaims({ sub: "uid-1", role: "member" })?.role, null);
  });

  it("returns null without a subject", () => {
    assert.equal(toClaims({ email: "a@b.com" }), null);
  });
});

describe("a consumer account reaches nothing internal", () => {
  // The load-bearing assertion behind relaxing /api/auth/session. That route
  // now mints a session for any verified Firebase user, which is only safe
  // because a session without a role authorises nothing.
  const consumer = toClaims({ sub: "uid-1", email: "a@b.com", email_verified: true });

  it("has no role", () => {
    assert.equal(consumer?.role, null);
  });

  it("cannot access HQ", () => {
    assert.equal(canAccessHq(consumer?.role ?? null), false);
  });

  it("is not an admin", () => {
    assert.equal(isAdmin(consumer?.role ?? null), false);
  });

  it("cannot acquire a role by asserting one in the token", () => {
    // Custom claims are written by \`morpheus access sync\`, never by sign-up.
    // Even so: an attacker-shaped payload must not survive toClaims.
    assert.equal(isRole("admin "), false);
    assert.equal(isRole("Admin"), false);
    assert.equal(toClaims({ sub: "uid-1", role: "Admin" })?.role, null);
  });
});

describe("the emulator branch of verifySessionCookie", () => {
  // An alg:none cookie, as the Auth emulator mints them. base64url, no signature.
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = (payload) => \`\${b64({ alg: "none", typ: "JWT" })}.\${b64(payload)}.\`;

  const payload = {
    sub: "uid-1",
    aud: "${ctx.staging.projectId}",
    iss: "https://session.firebase.google.com/${ctx.staging.projectId}",
    exp: Math.floor(Date.now() / 1000) + 3600,
    email: "a@b.com",
    email_verified: true,
  };

  it("is dead when the emulator variable is absent", async () => {
    // The safety property. Without the env var the unsigned cookie must fall
    // through to certificate verification and fail — an attacker-crafted
    // alg:none token must never authenticate against a real deployment.
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    assert.equal(await verifySessionCookie(unsigned(payload), "${ctx.staging.projectId}"), null);
  });

  it("accepts an emulator cookie when the variable is present", async () => {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
    try {
      const claims = await verifySessionCookie(unsigned(payload), "${ctx.staging.projectId}");
      assert.equal(claims?.uid, "uid-1");
      assert.equal(claims?.emailVerified, true);
    } finally {
      delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    }
  });

  it("still checks audience and expiry in emulator mode", async () => {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
    try {
      assert.equal(
        await verifySessionCookie(unsigned({ ...payload, aud: "other-project" }), "${ctx.staging.projectId}"),
        null,
      );
      assert.equal(
        await verifySessionCookie(
          unsigned({ ...payload, exp: Math.floor(Date.now() / 1000) - 10 }),
          "${ctx.staging.projectId}",
        ),
        null,
      );
    } finally {
      delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    }
  });
});
`;

/** __tests__/action-link.test.mjs */
export const unitActionLinkTest = (ctx: Ctx): string => `import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ${ctx.camel}ActionLink,
  extractOobCode,
  to${ctx.pascal}ActionLink,
} from "../lib/auth/action-link.ts";
import { passwordResetEmail, verificationEmail } from "../lib/email/templates.ts";

/**
 * The rewrite is the whole workaround for Firebase refusing to point its email
 * templates at \`/auth/action\`. If it drops the code, mails the wrong domain, or
 * forwards the api key, the auth emails are broken or leakier than they need to
 * be — and none of that shows up until someone clicks a link in an inbox.
 */

const FIREBASE_LINK =
  "https://${ctx.production.authDomain}/__/auth/action" +
  "?mode=verifyEmail&oobCode=ABC123xyz&apiKey=AIzaSyFAKEKEY&lang=en";

describe("extractOobCode", () => {
  it("pulls the code out of a Firebase link", () => {
    assert.equal(extractOobCode(FIREBASE_LINK), "ABC123xyz");
  });

  it("returns null rather than throwing on junk", () => {
    // The caller is a mail send. A link it cannot parse must not take down
    // sign-up, so null means "don't send" rather than "crash".
    assert.equal(extractOobCode("not a url"), null);
    assert.equal(extractOobCode(""), null);
  });

  it("returns null when there is no code", () => {
    assert.equal(extractOobCode("https://example.com/__/auth/action?mode=verifyEmail"), null);
    assert.equal(extractOobCode("https://example.com/?oobCode="), null);
  });
});

describe("${ctx.camel}ActionLink", () => {
  it("builds a link on the given origin", () => {
    assert.equal(
      ${ctx.camel}ActionLink("https://${ctx.productionHost}", "verifyEmail", "ABC"),
      "https://${ctx.productionHost}/auth/action?mode=verifyEmail&oobCode=ABC",
    );
  });

  it("uses whichever origin it is given, so each environment mails itself", () => {
    for (const origin of [
      "https://${ctx.productionHost}",
      "https://${ctx.stagingHost}",
      "http://localhost:3000",
    ]) {
      assert.ok(${ctx.camel}ActionLink(origin, "resetPassword", "X").startsWith(\`\${origin}/auth/action\`));
    }
  });

  it("escapes a code containing URL-significant characters", () => {
    const link = ${ctx.camel}ActionLink("https://${ctx.productionHost}", "resetPassword", "a+b/c=d&e");
    assert.ok(!link.includes("&e=") , "raw & would split into a second parameter");
    assert.equal(new URL(link).searchParams.get("oobCode"), "a+b/c=d&e");
  });
});

describe("to${ctx.pascal}ActionLink", () => {
  it("moves the code from Firebase's domain onto ours", () => {
    const link = to${ctx.pascal}ActionLink(FIREBASE_LINK, "https://${ctx.productionHost}", "verifyEmail");
    const url = new URL(link);

    assert.equal(url.origin, "https://${ctx.productionHost}");
    assert.equal(url.pathname, "/auth/action");
    assert.equal(url.searchParams.get("oobCode"), "ABC123xyz");
    assert.equal(url.searchParams.get("mode"), "verifyEmail");
  });

  it("drops the api key and the continue URL", () => {
    // \`/auth/action\` knows its own project and picks its own destination.
    // Forwarding either only widens what a mailed URL can influence.
    const link = to${ctx.pascal}ActionLink(
      \`\${FIREBASE_LINK}&continueUrl=https%3A%2F%2Fevil.example\`,
      "https://${ctx.productionHost}",
      "verifyEmail",
    );
    assert.equal(new URL(link).searchParams.get("apiKey"), null);
    assert.equal(new URL(link).searchParams.get("continueUrl"), null);
    assert.ok(!link.includes("evil.example"));
  });

  it("takes the mode from the caller, not from the incoming link", () => {
    // The caller knows which mail it is sending. Trusting the link's own mode
    // would let a generated verification link be mailed as a reset.
    const link = to${ctx.pascal}ActionLink(FIREBASE_LINK, "https://${ctx.productionHost}", "resetPassword");
    assert.equal(new URL(link).searchParams.get("mode"), "resetPassword");
  });

  it("returns null for an unparseable link", () => {
    assert.equal(to${ctx.pascal}ActionLink("garbage", "https://${ctx.productionHost}", "verifyEmail"), null);
  });
});

describe("email templates", () => {
  const LINK = "https://${ctx.productionHost}/auth/action?mode=verifyEmail&oobCode=ABC";

  it("puts the link in both the HTML and the plain-text part", () => {
    // Some clients render only text/plain. A link present in one part and not
    // the other is a dead email for those readers.
    //
    // The HTML carries it entity-encoded — \`&\` between query parameters must be
    // \`&amp;\` in an attribute — so this asserts the encoded form rather than the
    // raw string. Text is unescaped, and must stay that way: an \`&amp;\` in a
    // plain-text link is a broken link.
    const email = verificationEmail("a@b.com", LINK);
    const encoded = LINK.replace(/&/g, "&amp;");

    assert.ok(email.html.includes(encoded), "html must carry the encoded link");
    assert.ok(!email.html.includes(\`href="\${LINK}"\`), "raw & must not survive into an attribute");
    assert.ok(email.text.includes(LINK), "text must carry the raw link");
    assert.ok(!email.text.includes("&amp;"), "text must not be entity-encoded");
  });

  it("addresses the recipient given", () => {
    assert.equal(passwordResetEmail("a@b.com", LINK).to, "a@b.com");
  });

  it("says the link expires, in both parts", () => {
    for (const email of [verificationEmail("a@b.com", LINK), passwordResetEmail("a@b.com", LINK)]) {
      assert.match(email.html, /expires in an hour/);
      assert.match(email.text, /expires in an hour/);
    }
  });

  it("escapes a link containing HTML-significant characters", () => {
    // The code is generated by Firebase, but the escaping is what stops a
    // future change to link construction becoming an injection into the body.
    const nasty = 'https://${ctx.productionHost}/auth/action?oobCode="><script>alert(1)</script>';
    const email = verificationEmail("a@b.com", nasty);
    assert.ok(!email.html.includes("<script>"));
    assert.ok(email.html.includes("&lt;script&gt;"));
  });

  it("carries no unresolved CSS variables", () => {
    // No mail client resolves \`var()\`, so a token that leaked into the template
    // would render as an unstyled email rather than fail loudly.
    for (const email of [verificationEmail("a@b.com", LINK), passwordResetEmail("a@b.com", LINK)]) {
      assert.ok(!email.html.includes("var(--"), "template must inline its colours");
    }
  });

  it("does not name the account state in the subject", () => {
    // The reset subject reaches an inbox whether or not an account exists, so
    // it must not confirm one either way.
    const subject = passwordResetEmail("a@b.com", LINK).subject;
    assert.ok(!/account/i.test(subject));
  });
});
`;

/** __tests__/request-safety.test.mjs */
export const unitRequestSafetyTest = (ctx: Ctx): string => `import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isSameOrigin } from "../lib/auth/request-origin.ts";
import { DEFAULT_NEXT, safeNext } from "../lib/auth/safe-next.ts";

/**
 * Both of these were review findings, and both are the kind where the obvious
 * implementation looks right and is not.
 */

const headers = (init) => new Headers(init);

describe("isSameOrigin", () => {
  it("accepts a request from a page on the same host", () => {
    assert.equal(
      isSameOrigin(headers({ origin: "https://${ctx.productionHost}", host: "${ctx.productionHost}" })),
      true,
    );
  });

  it("prefers x-forwarded-host, which is the origin a browser actually used", () => {
    assert.equal(
      isSameOrigin(
        headers({
          origin: "https://${ctx.stagingHost}",
          "x-forwarded-host": "${ctx.stagingHost}",
          host: "internal-runtime.local",
        }),
      ),
      true,
    );
  });

  it("rejects a cross-site origin", () => {
    // The login-CSRF case: another site posting an attacker's ID token so the
    // response installs their identity as this browser's session.
    assert.equal(
      isSameOrigin(headers({ origin: "https://evil.example", host: "${ctx.productionHost}" })),
      false,
    );
  });

  it("rejects a missing Origin rather than assuming same-site", () => {
    // Every browser sends Origin on a state-changing request, so its absence is
    // not an ordinary browser — and defaulting the unknown case to "allow" is
    // how a check like this quietly stops working.
    assert.equal(isSameOrigin(headers({ host: "${ctx.productionHost}" })), false);
  });

  it("rejects a malformed Origin", () => {
    assert.equal(isSameOrigin(headers({ origin: "not a url", host: "${ctx.productionHost}" })), false);
    assert.equal(isSameOrigin(headers({ origin: "null", host: "${ctx.productionHost}" })), false);
  });

  it("rejects a lookalike host rather than matching a prefix or suffix", () => {
    for (const origin of [
      "https://${ctx.productionHost}.evil.example",
      "https://not${ctx.productionHost}",
      "https://${ctx.productionHost}:8443",
    ]) {
      assert.equal(isSameOrigin(headers({ origin, host: "${ctx.productionHost}" })), false, origin);
    }
  });

  it("rejects a matching origin and host on a domain ${ctx.name} does not serve", () => {
    // Both header values come from the same request, so equality alone can be
    // satisfied by whoever controls the headers. The known-host condition is
    // what makes the comparison mean something; it also anchors the origin
    // mailed action links are built from.
    assert.equal(
      isSameOrigin(headers({ origin: "https://evil.example", host: "evil.example" })),
      false,
    );
  });

  it("works on localhost and preview hosts without per-branch config", () => {
    assert.equal(
      isSameOrigin(headers({ origin: "http://localhost:3000", host: "localhost:3000" })),
      true,
    );
    assert.equal(
      isSameOrigin(headers({ origin: "https://evo-abc.vercel.app", host: "evo-abc.vercel.app" })),
      true,
    );
  });
});

describe("safeNext", () => {
  it("keeps an ordinary local path, with query and fragment", () => {
    assert.equal(safeNext("/app/"), "/app/");
    assert.equal(safeNext("/app/settings?tab=name#top"), "/app/settings?tab=name#top");
  });

  it("falls back when absent or empty", () => {
    assert.equal(safeNext(undefined), DEFAULT_NEXT);
    assert.equal(safeNext(""), DEFAULT_NEXT);
  });

  it("rejects the backslash open redirect", () => {
    // The finding. \`startsWith("/") && !startsWith("//")\` passes this, and the
    // WHATWG parser resolves it to https://evil.example/ — an open redirect on
    // the page someone has just trusted with their password.
    for (const value of [
      "/\\\\evil.example",
      "/\\\\/evil.example",
      "\\\\\\\\evil.example",
      "/\\\\\\\\evil.example",
    ]) {
      assert.equal(safeNext(value), DEFAULT_NEXT, value);
    }
  });

  it("rejects protocol-relative and absolute URLs", () => {
    for (const value of [
      "//evil.example",
      "https://evil.example",
      "http://evil.example/app/",
      "//evil.example/app/",
    ]) {
      assert.equal(safeNext(value), DEFAULT_NEXT, value);
    }
  });

  it("rejects non-http schemes that still parse", () => {
    for (const value of ["javascript:alert(1)", "data:text/html,<script>", "mailto:a@b.com"]) {
      assert.equal(safeNext(value), DEFAULT_NEXT, value);
    }
  });

  it("rejects embedded credentials and control characters", () => {
    assert.equal(safeNext("https://${ctx.productionHost}@evil.example"), DEFAULT_NEXT);
    assert.equal(safeNext("/app\\n/x"), DEFAULT_NEXT);
    assert.equal(safeNext("/app\\r\\nSet-Cookie: a=b"), DEFAULT_NEXT);
    assert.equal(safeNext("/app "), DEFAULT_NEXT);
  });

  it("never returns something that resolves off-origin", () => {
    // The property that actually matters, asserted directly rather than
    // inferred from the cases above.
    const attempts = [
      "/\\\\evil.example",
      "//evil.example",
      "https://evil.example",
      "/\\\\/\\\\evil.example",
      "\\\\/evil.example",
      "/app/",
      "/tools/",
    ];
    for (const attempt of attempts) {
      const resolved = new URL(safeNext(attempt), "https://${ctx.productionHost}");
      assert.equal(resolved.origin, "https://${ctx.productionHost}", attempt);
    }
  });

  it("honours an explicit fallback", () => {
    assert.equal(safeNext("//evil.example", "/tools/"), "/tools/");
  });
});
`;

/** __tests__/user-profile.test.mjs */
export const unitUserProfileTest = (ctx: Ctx): string => `import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fromFirestoreFields, fromFirestoreValue } from "../lib/users/decode.ts";
import {
  DISPLAY_NAME_MAX_LENGTH,
  isValidDisplayName,
  normalizeDisplayName,
  parseUserProfile,
} from "${ctx.sharedSchemaFromTests}";
import { toFirestoreFields } from "../lib/waitlist/firestore-value.ts";

describe("normalizeDisplayName", () => {
  it("trims", () => {
    assert.equal(normalizeDisplayName("  Chris  "), "Chris");
  });

  it("collapses internal whitespace", () => {
    // Otherwise "Chris    Heinrich" renders with the gap intact in a header
    // where nothing else would explain it.
    assert.equal(normalizeDisplayName("Chris    Heinrich"), "Chris Heinrich");
    assert.equal(normalizeDisplayName("Chris\\t\\nHeinrich"), "Chris Heinrich");
  });

  it("caps at the maximum length", () => {
    const long = "a".repeat(DISPLAY_NAME_MAX_LENGTH + 50);
    assert.equal(normalizeDisplayName(long).length, DISPLAY_NAME_MAX_LENGTH);
  });

  it("reduces a whitespace-only name to empty, which means clear it", () => {
    // The distinction the route depends on: "" erases the name, \`undefined\`
    // leaves it alone. Someone who set a name must be able to unset it.
    assert.equal(normalizeDisplayName("   "), "");
  });

  it("leaves a normal name untouched", () => {
    assert.equal(normalizeDisplayName("Chris Heinrich"), "Chris Heinrich");
  });

  it("preserves non-Latin names rather than stripping them", () => {
    assert.equal(normalizeDisplayName("张伟"), "张伟");
    assert.equal(normalizeDisplayName("Zoë García"), "Zoë García");
  });
});

describe("isValidDisplayName", () => {
  it("accepts an empty name", () => {
    assert.equal(isValidDisplayName(""), true);
  });

  it("accepts a name at exactly the cap", () => {
    assert.equal(isValidDisplayName("a".repeat(DISPLAY_NAME_MAX_LENGTH)), true);
  });

  it("rejects one character past it", () => {
    assert.equal(isValidDisplayName("a".repeat(DISPLAY_NAME_MAX_LENGTH + 1)), false);
  });
});

describe("fromFirestoreValue", () => {
  it("decodes the scalar shapes", () => {
    assert.equal(fromFirestoreValue({ stringValue: "hi" }), "hi");
    assert.equal(fromFirestoreValue({ booleanValue: true }), true);
    assert.equal(fromFirestoreValue({ nullValue: null }), null);
    assert.equal(fromFirestoreValue({ doubleValue: 1.5 }), 1.5);
  });

  it("returns integers as numbers, not the strings they travel as", () => {
    // The transport detail must not leak: \`signupCount + 1\` would otherwise
    // concatenate rather than add.
    const decoded = fromFirestoreValue({ integerValue: "42" });
    assert.equal(decoded, 42);
    assert.equal(typeof decoded, "number");
  });

  it("refuses an integer beyond JavaScript's safe range", () => {
    // Rounding silently here would corrupt a counter into a plausible-looking
    // wrong number.
    assert.throws(() => fromFirestoreValue({ integerValue: "9007199254740993" }), /safe range/);
  });

  it("decodes nested maps and arrays", () => {
    assert.deepEqual(
      fromFirestoreValue({
        mapValue: { fields: { marketingEmail: { booleanValue: false } } },
      }),
      { marketingEmail: false },
    );
    assert.deepEqual(
      fromFirestoreValue({
        arrayValue: { values: [{ stringValue: "a" }, { stringValue: "b" }] },
      }),
      ["a", "b"],
    );
  });

  it("treats an empty array as empty rather than missing", () => {
    assert.deepEqual(fromFirestoreValue({ arrayValue: {} }), []);
  });

  it("throws on a shape it does not know", () => {
    // Returning undefined would make the field vanish between storage and
    // render — indistinguishable from data loss.
    assert.throws(() => fromFirestoreValue({ geoPointValue: { latitude: 1 } }), /Unsupported/);
  });
});

describe("encode and decode round-trip", () => {
  it("returns a profile unchanged", () => {
    // The pairing is the point: these two modules are only correct relative to
    // each other, and they live in different directories.
    const profile = {
      schema_version: 1,
      email: "a@b.com",
      displayName: "Chris Heinrich",
      settings: { marketingEmail: false },
      createdAt: "2026-08-19T00:00:00.000Z",
      updatedAt: "2026-08-19T00:00:00.000Z",
    };

    assert.deepEqual(fromFirestoreFields(toFirestoreFields(profile)), profile);
  });

  it("drops an undefined field on the way out and does not invent it coming back", () => {
    const encoded = toFirestoreFields({ email: "a@b.com", displayName: undefined });
    assert.deepEqual(fromFirestoreFields(encoded), { email: "a@b.com" });
  });

  it("round-trips an empty display name, which is how a name is cleared", () => {
    assert.deepEqual(fromFirestoreFields(toFirestoreFields({ displayName: "" })), {
      displayName: "",
    });
  });
});

describe("parseUserProfile", () => {
  const complete = {
    email: "a@b.com",
    createdAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T00:00:00.000Z",
  };

  it("reads a minimal profile", () => {
    assert.deepEqual(parseUserProfile(complete), { schema_version: 1, ...complete });
  });

  it("returns null when a required field is missing or wrongly typed", () => {
    // A profile without an email or timestamps is not a profile. The caller
    // treats null as "no profile yet", which is a state it already handles.
    assert.equal(parseUserProfile({}), null);
    assert.equal(parseUserProfile({ ...complete, email: undefined }), null);
    assert.equal(parseUserProfile({ ...complete, email: 42 }), null);
    assert.equal(parseUserProfile({ ...complete, createdAt: null }), null);
  });

  it("drops a malformed optional field rather than failing the whole read", () => {
    // A bad photoURL must not make the account unloadable.
    const parsed = parseUserProfile({ ...complete, displayName: 42, photoURL: {} });
    assert.equal(parsed?.email, "a@b.com");
    assert.equal("displayName" in parsed, false);
    assert.equal("photoURL" in parsed, false);
  });

  it("keeps valid optional fields", () => {
    const parsed = parseUserProfile({
      ...complete,
      displayName: "Chris",
      settings: { marketingEmail: true },
    });
    assert.equal(parsed?.displayName, "Chris");
    assert.deepEqual(parsed?.settings, { marketingEmail: true });
  });

  it("ignores unknown fields rather than passing them through", () => {
    // The escalation path the rules also close: a \`role\` written into the
    // document must not reach the app as though it meant something.
    const parsed = parseUserProfile({ ...complete, role: "admin", plan: "pro" });
    assert.equal("role" in parsed, false);
    assert.equal("plan" in parsed, false);
  });

  it("reports the stored schema version, defaulting only when absent", () => {
    // The field exists to tell a reader it is looking at an older shape. An
    // earlier version stamped the current version over whatever was stored,
    // which made it unable to do that job the first time a v2 document
    // appeared. Non-numbers are still discarded.
    assert.equal(parseUserProfile({ ...complete, schema_version: 2 })?.schema_version, 2);
    assert.equal(parseUserProfile(complete)?.schema_version, 1);
    assert.equal(parseUserProfile({ ...complete, schema_version: "2" })?.schema_version, 1);
  });
});
`;

/** infra/firebase/firestore-rules.test.mjs */
export const rulesTest = (ctx: Ctx): string => `// Rules unit tests for the consumer \`users\` collection in firestore.rules.
//
// These run against the Firestore emulator rather than a real project, because
// security rules cannot be reasoned about by reading them: the interesting
// cases are the ones where a rule looks right and admits something anyway.
// Every \`assertFails\` below corresponds to a specific escalation the rules are
// there to stop, and would pass — silently — against the naive
// \`allow update: if request.auth.uid == uid\`.
//
//   firebase emulators:exec --only firestore \\
//     "node --experimental-strip-types --test infra/firebase/firestore-rules.test.mjs"
//
// The emulator must be on 127.0.0.1:8080. Without it initializeTestEnvironment
// hangs rather than failing, which is the emulator's behaviour, not a flake.
//
// Expect the emulator to log "evaluation error at L…:24 for 'update'" beside
// most of the denials below. It is not a fault in the rules and not worth
// chasing: the engine evaluates a denied write twice, and any expression
// reading \`request.resource.data\` reports an error in the first pass before
// reporting false in the second. A rule as trivial as
// \`request.resource.data.displayName == 'x'\` logs the same thing when it
// denies, and an *allowed* write logs nothing at all. Verified on the
// emulator, 2026-08-18.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore";

const RULES = readFileSync(new URL("./firestore.rules", import.meta.url), "utf8");

const ALICE = { uid: "alice", email: "alice@example.com" };
const BOB = { uid: "bob", email: "bob@example.com" };

let testEnv;

// A project id of its own, deliberately not the \`${ctx.production.projectId}\` that firebase.json
// and the other emulator tests use. clearFirestore() below wipes a whole
// project between tests, so sharing an id would mean this file silently
// deleting another suite's fixtures whenever both run against one emulator.
// The Firestore emulator keeps projects isolated and does not care that this
// one does not exist, singleProjectMode notwithstanding — verified against the
// repo's own firebase.json.
const PROJECT_ID = "${ctx.slug}-rules-test";

// A valid profile as the client would create it: every key on the create
// whitelist, nothing else, and an \`email\` matching the token.
function newProfile(user, overrides = {}) {
  // Mirrors what \`ensureProfile\` actually writes — schema_version included and
  // timestamps as ISO strings, because the store encodes them as strings. An
  // earlier version omitted schema_version and used Date objects, so 35 green
  // tests described a document no writer in the repo produces; a review caught
  // the create whitelist rejecting the app's own shape because of it.
  return {
    schema_version: 1,
    displayName: "Alice",
    photoURL: "https://example.com/a.png",
    email: user.email,
    settings: { units: "metric", emailDigest: true },
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
}

// Signed in and verified — the only state permitted to write.
function verified(user) {
  return testEnv
    .authenticatedContext(user.uid, { email: user.email, email_verified: true })
    .firestore();
}

// Signed in, email asserted but never confirmed. Reads, does not write.
function unverified(user) {
  return testEnv
    .authenticatedContext(user.uid, { email: user.email, email_verified: false })
    .firestore();
}

function anonymous() {
  return testEnv.unauthenticatedContext().firestore();
}

// Seeds through the admin path so a test of \`update\` is not really a test of
// \`create\` with extra steps.
async function seedProfile(user, data = newProfile(user)) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users", user.uid), data);
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: RULES, host: "127.0.0.1", port: 8080 },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe("users/{uid} — unauthenticated access", () => {
  it("denies reading a profile", async () => {
    await seedProfile(ALICE);
    await assertFails(getDoc(doc(anonymous(), "users", ALICE.uid)));
  });

  it("denies creating a profile", async () => {
    await assertFails(
      setDoc(doc(anonymous(), "users", ALICE.uid), newProfile(ALICE)),
    );
  });

  it("denies updating a profile", async () => {
    await seedProfile(ALICE);
    await assertFails(
      updateDoc(doc(anonymous(), "users", ALICE.uid), { displayName: "x" }),
    );
  });
});

describe("users/{uid} — ownership", () => {
  it("lets a user read their own profile", async () => {
    await seedProfile(ALICE);
    const snap = await assertSucceeds(
      getDoc(doc(verified(ALICE), "users", ALICE.uid)),
    );
    assert.equal(snap.data().displayName, "Alice");
  });

  it("denies reading another user's profile", async () => {
    await seedProfile(BOB);
    await assertFails(getDoc(doc(verified(ALICE), "users", BOB.uid)));
  });

  it("denies writing another user's profile", async () => {
    await seedProfile(BOB);
    await assertFails(
      updateDoc(doc(verified(ALICE), "users", BOB.uid), { displayName: "x" }),
    );
  });

  it("denies creating a profile under another user's uid", async () => {
    await assertFails(
      setDoc(doc(verified(ALICE), "users", BOB.uid), newProfile(BOB)),
    );
  });
});

describe("users/{uid} — create", () => {
  it("accepts a profile made only of whitelisted keys", async () => {
    await assertSucceeds(
      setDoc(doc(verified(ALICE), "users", ALICE.uid), newProfile(ALICE)),
    );
  });

  it("rejects a create carrying a key outside the whitelist", async () => {
    // The escalation attempted at the earliest possible moment: if create is
    // unconstrained, the update whitelist protects nothing, because the
    // forged field is already there.
    await assertFails(
      setDoc(
        doc(verified(ALICE), "users", ALICE.uid),
        newProfile(ALICE, { role: "admin" }),
      ),
    );
  });

  it("rejects a create carrying an entitlement field", async () => {
    await assertFails(
      setDoc(
        doc(verified(ALICE), "users", ALICE.uid),
        newProfile(ALICE, { plan: "pro" }),
      ),
    );
  });

  it("rejects a create whose email is not the token's email", async () => {
    // \`email\` is immutable after create, so a create that accepts an
    // arbitrary address freezes a lie into the document permanently.
    await assertFails(
      setDoc(
        doc(verified(ALICE), "users", ALICE.uid),
        newProfile(ALICE, { email: "chris@darwin.health" }),
      ),
    );
  });

  it("rejects a create with no createdAt, which could never be added later", async () => {
    const { createdAt, ...withoutCreatedAt } = newProfile(ALICE);
    void createdAt;
    await assertFails(
      setDoc(doc(verified(ALICE), "users", ALICE.uid), withoutCreatedAt),
    );
  });
});

describe("users/{uid} — update key whitelist", () => {
  beforeEach(async () => {
    await seedProfile(ALICE);
  });

  it("allows changing displayName", async () => {
    await assertSucceeds(
      updateDoc(doc(verified(ALICE), "users", ALICE.uid), {
        displayName: "Alice B",
        updatedAt: "2026-08-19T00:00:00.000Z",
      }),
    );
  });

  it("allows changing a nested settings preference", async () => {
    await assertSucceeds(
      updateDoc(doc(verified(ALICE), "users", ALICE.uid), {
        "settings.units": "imperial",
      }),
    );
  });

  it("rejects adding role — the privilege escalation this rule exists for", async () => {
    await assertFails(
      updateDoc(doc(verified(ALICE), "users", ALICE.uid), { role: "admin" }),
    );
  });

  it("rejects adding plan", async () => {
    await assertFails(
      updateDoc(doc(verified(ALICE), "users", ALICE.uid), { plan: "pro" }),
    );
  });

  it("rejects an escalation smuggled alongside a legitimate change", async () => {
    // hasOnly() is checked against the whole affected set, so a permitted key
    // in the same write does not launder the forbidden one.
    await assertFails(
      updateDoc(doc(verified(ALICE), "users", ALICE.uid), {
        displayName: "Alice B",
        role: "admin",
      }),
    );
  });

  it("rejects changing email", async () => {
    await assertFails(
      updateDoc(doc(verified(ALICE), "users", ALICE.uid), {
        email: "chris@darwin.health",
      }),
    );
  });

  it("rejects changing createdAt", async () => {
    await assertFails(
      updateDoc(doc(verified(ALICE), "users", ALICE.uid), {
        createdAt: new Date("2020-01-01T00:00:00Z"),
      }),
    );
  });

  it("rejects deleting an immutable key", async () => {
    // affectedKeys() reports removals too, so clearing a field is not a way
    // around a whitelist that only seems to police changes.
    await assertFails(
      updateDoc(doc(verified(ALICE), "users", ALICE.uid), {
        createdAt: deleteField(),
      }),
    );
  });

  it("rejects a full-document overwrite that drops immutable keys", async () => {
    await assertFails(
      setDoc(doc(verified(ALICE), "users", ALICE.uid), { displayName: "Alice B" }),
    );
  });
});

describe("users/{uid} — delete", () => {
  it("denies the owner deleting their own profile", async () => {
    await seedProfile(ALICE);
    await assertFails(deleteDoc(doc(verified(ALICE), "users", ALICE.uid)));
  });
});

describe("users/{uid} — unverified email", () => {
  it("lets an unverified owner read their profile", async () => {
    // Chris's call: an unverified user signs in and reaches the app.
    await seedProfile(ALICE);
    await assertSucceeds(getDoc(doc(unverified(ALICE), "users", ALICE.uid)));
  });

  it("denies an unverified owner creating their profile", async () => {
    await assertFails(
      setDoc(doc(unverified(ALICE), "users", ALICE.uid), newProfile(ALICE)),
    );
  });

  it("denies an unverified owner updating an otherwise legal field", async () => {
    await seedProfile(ALICE);
    await assertFails(
      updateDoc(doc(unverified(ALICE), "users", ALICE.uid), {
        displayName: "Alice B",
      }),
    );
  });
});

describe("users/{uid}/health/{doc} — owner scoped", () => {
  it("denies even the verified owner writing, until a schema exists", async () => {
    // Deployed rules are a public API rather than a description of the app: no
    // UI writes here, but any verified user can call Firestore directly, and
    // with no field or size whitelist that is arbitrary documents under their
    // own subtree — and unvalidated health records written before the
    // retention model exists. Closed until the first real feature brings a
    // whitelist and its own tests.
    await assertFails(
      setDoc(doc(verified(ALICE), "users", ALICE.uid, "health", "entry-1"), { note: "x" }),
    );
  });

  it("still lets the owner read, so the shape does not change later", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", ALICE.uid, "health", "entry-1"), {
        note: "x",
      });
    });
    await assertSucceeds(
      getDoc(doc(verified(ALICE), "users", ALICE.uid, "health", "entry-1")),
    );
  });

  it("denies another signed-in user reading it", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", ALICE.uid, "health", "entry-1"), {
        note: "x",
      });
    });
    await assertFails(
      getDoc(doc(verified(BOB), "users", ALICE.uid, "health", "entry-1")),
    );
  });

  it("denies another signed-in user writing it", async () => {
    await assertFails(
      setDoc(doc(verified(BOB), "users", ALICE.uid, "health", "entry-1"), {
        note: "x",
      }),
    );
  });

  it("denies unauthenticated access", async () => {
    await assertFails(
      getDoc(doc(anonymous(), "users", ALICE.uid, "health", "entry-1")),
    );
  });

  it("denies an unverified owner writing", async () => {
    await assertFails(
      setDoc(doc(unverified(ALICE), "users", ALICE.uid, "health", "entry-1"), {
        note: "x",
      }),
    );
  });

  it("stays closed even though the profile above it is readable", async () => {
    // The reason health is a subcollection: the profile's read rule does not
    // reach into it, so loosening the profile later cannot widen this.
    await seedProfile(ALICE);
    await assertSucceeds(getDoc(doc(verified(ALICE), "users", ALICE.uid)));
    await assertFails(
      getDoc(doc(verified(BOB), "users", ALICE.uid, "health", "entry-1")),
    );
  });
});

describe("users/{uid} — shape, not just keys", () => {
  // Key whitelists say which fields may change, nothing about contents. These
  // pin the bounds a direct-SDK client cannot skip.

  async function seeded() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", ALICE.uid), newProfile(ALICE));
    });
    return verified(ALICE);
  }

  it("denies a displayName over the cap, straight through the SDK", async () => {
    const db = await seeded();
    await assertFails(
      updateDoc(doc(db, "users", ALICE.uid), {
        displayName: "x".repeat(65),
        updatedAt: "2026-08-19T00:00:00.000Z",
      }),
    );
  });

  it("allows a displayName at exactly the cap", async () => {
    const db = await seeded();
    await assertSucceeds(
      updateDoc(doc(db, "users", ALICE.uid), {
        displayName: "x".repeat(64),
        updatedAt: "2026-08-19T00:00:00.000Z",
      }),
    );
  });

  it("denies a displayName that is not a string", async () => {
    const db = await seeded();
    await assertFails(
      updateDoc(doc(db, "users", ALICE.uid), {
        displayName: 42,
        updatedAt: "2026-08-19T00:00:00.000Z",
      }),
    );
  });

  it("denies settings that are not a map", async () => {
    const db = await seeded();
    await assertFails(
      updateDoc(doc(db, "users", ALICE.uid), {
        settings: "plan=pro",
        updatedAt: "2026-08-19T00:00:00.000Z",
      }),
    );
  });

  it("denies a create without schema_version", async () => {
    const profile = newProfile(ALICE);
    delete profile.schema_version;
    await assertFails(setDoc(doc(verified(ALICE), "users", ALICE.uid), profile));
  });

  it("denies a create claiming a schema version that does not exist", async () => {
    await assertFails(
      setDoc(doc(verified(ALICE), "users", ALICE.uid), newProfile(ALICE, { schema_version: 2 })),
    );
  });
});

describe("the catch-all still closes everything else", () => {
  it("denies a signed-in user reading an unnamed collection", async () => {
    await assertFails(getDoc(doc(verified(ALICE), "random", "doc")));
  });

  it("denies a signed-in user writing an unnamed collection", async () => {
    await assertFails(setDoc(doc(verified(ALICE), "random", "doc"), { a: 1 }));
  });

  it("keeps the waitlist closed to clients", async () => {
    await assertFails(getDoc(doc(verified(ALICE), "waitlist", ALICE.email)));
  });

  it("keeps /hq closed to a consumer with no role claim", async () => {
    await assertFails(getDoc(doc(verified(ALICE), "hq", "anything")));
  });
});
`;

/** e2e/helpers/emulator.ts */
export const e2eEmulatorHelper = (ctx: Ctx): string => `/**
 * The Auth emulator's back door, used on purpose.
 *
 * The emulator exposes admin endpoints no real project has: list the pending
 * out-of-band codes (so a test reads "the email" without any mail
 * infrastructure), create pre-verified accounts, and wipe everything. All of
 * it keyed on \`FIREBASE_AUTH_EMULATOR_HOST\`, which \`emulators:exec\` sets —
 * bare \`playwright test\` fails here first, loudly, instead of touching a real
 * project.
 */

/** Matches the client bundle: no VERCEL_ENV at build time resolves to staging. */
export const PROJECT_ID = "${ctx.staging.projectId}";

function authHost(): string {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!host) {
    throw new Error(
      "FIREBASE_AUTH_EMULATOR_HOST is not set. Run this suite through " +
        "\`pnpm run test:e2e\` at the repo root, which wraps it in emulators:exec.",
    );
  }
  return \`http://\${host}\`;
}

/** The emulator accepts any non-empty key; nothing here is a secret. */
const API_KEY = "emulator";

type OobCode = {
  email: string;
  oobCode: string;
  requestType: "VERIFY_EMAIL" | "PASSWORD_RESET" | string;
  oobLink: string;
};

/** Every pending action code, newest last — the emulator's view of "the inbox". */
export async function pendingOobCodes(): Promise<OobCode[]> {
  const response = await fetch(\`\${authHost()}/emulator/v1/projects/\${PROJECT_ID}/oobCodes\`);
  if (!response.ok) throw new Error(\`oobCodes listing failed: \${response.status}\`);
  const body = (await response.json()) as { oobCodes?: OobCode[] };
  return body.oobCodes ?? [];
}

/**
 * The newest code of one type for one address — "the link in the email".
 * Newest matters: generating a code revokes the previous one of its type, so
 * an earlier entry in the list may already be dead.
 */
export async function latestOobCode(
  email: string,
  requestType: OobCode["requestType"],
): Promise<string> {
  const codes = (await pendingOobCodes()).filter(
    (code) => code.email === email && code.requestType === requestType,
  );
  const latest = codes.at(-1);
  if (!latest) throw new Error(\`No pending \${requestType} code for \${email}.\`);
  return latest.oobCode;
}

/** Wipe every account. Cheap, and what makes specs independent of each other. */
export async function resetAccounts(): Promise<void> {
  const response = await fetch(\`\${authHost()}/emulator/v1/projects/\${PROJECT_ID}/accounts\`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(\`account reset failed: \${response.status}\`);
}

/**
 * Create an account directly, optionally pre-verified — for specs that test
 * what comes *after* sign-up rather than sign-up itself.
 */
export async function createAccount(
  email: string,
  password: string,
  { verified = false } = {},
): Promise<string> {
  const signUp = await fetch(
    \`\${authHost()}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=\${API_KEY}\`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  if (!signUp.ok) throw new Error(\`emulator signUp failed: \${signUp.status}\`);
  const { localId } = (await signUp.json()) as { localId: string };

  if (verified) {
    const update = await fetch(
      \`\${authHost()}/identitytoolkit.googleapis.com/v1/projects/\${PROJECT_ID}/accounts:update\`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // The emulator's stand-in for real admin credentials.
          Authorization: "Bearer owner",
        },
        body: JSON.stringify({ localId, emailVerified: true }),
      },
    );
    if (!update.ok) throw new Error(\`emulator verify failed: \${update.status}\`);
  }

  return localId;
}
`;

/** e2e/helpers/accounts.ts */
export const e2eAccountsHelper = (ctx: Ctx): string => `import { expect, type Page } from "@playwright/test";

/**
 * Every test gets its own account, named for what it is testing — the
 * plus-alias convention, institutionalized. A counter beside the timestamp
 * keeps two accounts created in the same millisecond distinct.
 */
let sequence = 0;

export function uniqueEmail(tag: string): string {
  sequence += 1;
  return \`e2e+\${tag}-\${Date.now()}-\${sequence}@example.com\`;
}

export const PASSWORD = "e2e-password-12345";

/** Drive the real sign-up form, ending signed in on /app. */
export async function signUpThroughForm(page: Page, email: string): Promise<void> {
  await page.goto("/sign-up/");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\\/app\\/?$/);
}

/** Drive the real sign-in form, ending signed in on /app. */
export async function signInThroughForm(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in/");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\\/app\\/?$/);
}
`;

/** e2e/sign-in.spec.ts */
export const e2eSignInSpec = (ctx: Ctx): string => `import { expect, test } from "@playwright/test";

import { PASSWORD, signInThroughForm, uniqueEmail } from "./helpers/accounts";
import { createAccount, resetAccounts } from "./helpers/emulator";

test.beforeAll(async () => {
  await resetAccounts();
});

test("signs in, reaches /app, and sets the readable hint cookie", async ({ page }) => {
  const email = uniqueEmail("signin");
  await createAccount(email, PASSWORD, { verified: true });

  await signInThroughForm(page, email);

  // The readable hint cookie is what the static header keys on.
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === "${ctx.slug}_signed_in")?.value).toBe("1");

  // Once <NavAuth /> is rendered in the site header, extend this test: visit a
  // static marketing page and assert the header shows the signed-in state —
  // e.g. \`getByRole("link", { name: /Dashboard/ })\` visible and "Sign in"
  // absent. The pages stay static; NavAuth resolves client-side.
});

test("a wrong password gets the mapped message, not a Firebase code", async ({ page }) => {
  const email = uniqueEmail("wrongpw");
  await createAccount(email, PASSWORD, { verified: true });

  await page.goto("/sign-in/");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  const alert = page.locator('p[role="alert"]');
  await expect(alert).toContainText("That email and password don't match");
  // Never the raw code — it tells a person nothing and an attacker something.
  await expect(alert).not.toContainText("auth/");
});

test("an unknown address gets the same message as a wrong password", async ({ page }) => {
  // The enumeration property, asserted in the UI: the two failures must be
  // indistinguishable to whoever is typing.
  await page.goto("/sign-in/");
  await page.getByLabel("Email address").fill(uniqueEmail("nosuchuser"));
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page.locator('p[role="alert"]')).toContainText("That email and password don't match");
});

test("a signed-in visitor is bounced past the sign-in page", async ({ page }) => {
  const email = uniqueEmail("bounce");
  await createAccount(email, PASSWORD, { verified: true });
  await signInThroughForm(page, email);

  await page.goto("/sign-in/");
  await expect(page).toHaveURL(/\\/app\\/?$/);
});

test("sign-out clears both cookies and reverts the header", async ({ page }) => {
  const email = uniqueEmail("signout");
  await createAccount(email, PASSWORD, { verified: true });
  await signInThroughForm(page, email);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\\/$/);

  const names = (await page.context().cookies()).map((c) => c.name);
  expect(names).not.toContain("__session");
  expect(names).not.toContain("${ctx.slug}_signed_in");

  // Once <NavAuth /> is in the site header, also assert it reverted — e.g.
  // the "Sign up" link is visible again.

  // And the gate is really closed, not just the header.
  await page.goto("/app/");
  await expect(page).toHaveURL(/\\/sign-in\\/?\\?next=/);
});
`;

/** e2e/sign-up-verify.spec.ts */
export const e2eSignUpVerifySpec = (ctx: Ctx): string => `import { expect, test } from "@playwright/test";

import { signUpThroughForm, uniqueEmail } from "./helpers/accounts";
import { latestOobCode, resetAccounts } from "./helpers/emulator";

test.beforeAll(async () => {
  await resetAccounts();
});

test("sign-up → automatic mail → link → name saved, without re-signing in", async ({ page }) => {
  const email = uniqueEmail("verify");
  await signUpThroughForm(page, email);

  // Unverified: banner up, field visibly locked.
  await expect(page.getByText("Confirm your email")).toBeVisible();
  const field = page.getByLabel("Display name");
  await expect(field).toHaveAttribute("aria-disabled", "true");

  // "The email": sign-up sent it automatically; the emulator holds its code.
  const oobCode = await latestOobCode(email, "VERIFY_EMAIL");
  await page.goto(\`/auth/action/?mode=verifyEmail&oobCode=\${oobCode}\`);
  await expect(page.getByRole("heading", { name: "Your email is verified" })).toBeVisible();

  // The load-bearing assertion: the *server* session was reminted, so the
  // write path opens without signing out — the cross-device fix's regression
  // test, and the bug the second audit called the sharpest.
  await page.getByRole("link", { name: "Go to your account" }).click();
  await expect(page).toHaveURL(/\\/app\\/?$/);
  await expect(page.getByText("Confirm your email")).toHaveCount(0);

  await page.getByLabel("Display name").fill("E2E Tester");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // Server-rendered on reload — proves it reached Firestore, not just state.
  await page.reload();
  await expect(page.getByRole("heading", { name: "E2E Tester" })).toBeVisible();
});

test("a dead link says so plainly", async ({ page }) => {
  // The invariant both environments share: a consumed code cannot be used
  // twice. (Production additionally revokes an outstanding code when a new one
  // is generated — the burned-link incident — but the emulator does not model
  // that, so asserting it here would pin emulator behavior that differs from
  // the thing being protected against. Verified empirically on both sides.)
  const email = uniqueEmail("deadlink");
  await signUpThroughForm(page, email);

  const code = await latestOobCode(email, "VERIFY_EMAIL");
  await page.goto(\`/auth/action/?mode=verifyEmail&oobCode=\${code}\`);
  await expect(page.getByRole("heading", { name: "Your email is verified" })).toBeVisible();

  // Same link, second visit — the "already used" path a person hits when they
  // click an emailed link twice.
  await page.goto(\`/auth/action/?mode=verifyEmail&oobCode=\${code}\`);
  await expect(page.getByRole("heading", { name: "That link didn't work" })).toBeVisible();
});
`;

/** e2e/password-reset.spec.ts */
export const e2ePasswordResetSpec = (ctx: Ctx): string => `import { expect, test } from "@playwright/test";

import { PASSWORD, uniqueEmail } from "./helpers/accounts";
import { createAccount, latestOobCode, resetAccounts } from "./helpers/emulator";

test.beforeAll(async () => {
  await resetAccounts();
});

test("reset end to end: old password dies, new one works", async ({ page }) => {
  const email = uniqueEmail("reset");
  await createAccount(email, PASSWORD, { verified: true });

  await page.goto("/reset-password/");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/a reset link is on its way/)).toBeVisible();

  const oobCode = await latestOobCode(email, "PASSWORD_RESET");
  await page.goto(\`/auth/action/?mode=resetPassword&oobCode=\${oobCode}\`);

  const newPassword = "a-brand-new-password-99";
  await page.getByLabel("New password").fill(newPassword);
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByRole("heading", { name: "Your password is set" })).toBeVisible();

  // Old password refused…
  // Scoped: the header carries a "Sign in" link too, and Playwright's strict
  // mode rightly refuses to pick one for us.
  await page.locator(".auth-shell").getByRole("link", { name: "Sign in" }).click();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("That email and password don't match");

  // …new one accepted.
  await page.getByLabel("Password").fill(newPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\\/app\\/?$/);
});

test("an unknown address renders the identical on-its-way state", async ({ page }) => {
  // The enumeration property at the UI layer: no visible difference between
  // an address with an account and one without.
  await page.goto("/reset-password/");
  await page.getByLabel("Email address").fill(uniqueEmail("ghost"));
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/a reset link is on its way/)).toBeVisible();
});
`;

/** e2e/session-security.spec.ts */
export const e2eSessionSecuritySpec = (ctx: Ctx): string => `import { expect, test } from "@playwright/test";

import { PASSWORD, signInThroughForm, uniqueEmail } from "./helpers/accounts";
import { createAccount, resetAccounts } from "./helpers/emulator";

test.beforeAll(async () => {
  await resetAccounts();
});

test("signed out, /app redirects to sign-in carrying next", async ({ page }) => {
  await page.goto("/app/");
  await expect(page).toHaveURL(/\\/sign-in\\/?\\?next=%2Fapp%2F/);
});

test("a backslash open redirect falls back to /app after sign-in", async ({ page }) => {
  const email = uniqueEmail("redirect");
  await createAccount(email, PASSWORD, { verified: true });

  // \`/\\evil.example\` passes naive startsWith checks and resolves off-origin in
  // the WHATWG parser — the sign-in page must discard it whole.
  await page.goto("/sign-in/?next=/%5Cevil.example");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/\\/app\\/?$/);
});

test("a cross-site POST cannot mint or destroy a session", async ({ request }) => {
  // Browsers refuse to let a page forge Origin, so this level is exercised
  // with direct requests — the same shape a hostile site's form post arrives as.
  const forged = await request.post("/api/auth/session/", {
    headers: { origin: "https://evil.example", "content-type": "text/plain" },
    data: JSON.stringify({ idToken: "attacker-token" }),
  });
  expect(forged.status()).toBe(403);

  const signOut = await request.delete("/api/auth/session/", {
    headers: { origin: "https://evil.example" },
  });
  expect(signOut.status()).toBe(403);

  // Same-origin with a bogus token gets past CSRF and fails on the token —
  // proving the 403 above is the origin check, not the token check.
  const sameOrigin = await request.post("/api/auth/session/", {
    headers: { origin: "http://localhost:3111", "content-type": "application/json" },
    data: JSON.stringify({ idToken: "bogus" }),
  });
  expect(sameOrigin.status()).toBe(401);
});

test("the reset endpoint answers byte-identically for any address", async ({ request }) => {
  // The route whose entire purpose is a constant answer — and which once
  // failed this exact check via a shared Response body consumed on first read.
  const bodies = new Set<string>();
  for (const email of ["real-looking@example.com", "another@example.com", "not-an-email"]) {
    const response = await request.post("/api/auth/reset-password/", {
      headers: { origin: "http://localhost:3111", "content-type": "application/json" },
      data: JSON.stringify({ email }),
    });
    expect(response.status()).toBe(200);
    bodies.add(await response.text());
  }
  expect(bodies.size).toBe(1);
});

test("/hq is a 404 to everyone without a role — not an explainer", async ({ page, request }) => {
  // The first consumer who typed /hq on production was shown a page describing
  // the internal admin surface and the tooling that gates it. An internal
  // route on a consumer product must be indistinguishable from a route that
  // does not exist.

  // Signed out: 404, not a sign-in wall.
  const signedOut = await request.get("/hq/", { maxRedirects: 0 });
  expect(signedOut.status()).toBe(404);

  // Signed in as a consumer: still 404, and none of the old copy.
  const email = uniqueEmail("hq404");
  await createAccount(email, PASSWORD, { verified: true });
  await signInThroughForm(page, email);

  const response = await page.goto("/hq/");
  expect(response?.status()).toBe(404);
  const body = await page.content();
  for (const leak of ["allowlist", "morpheus", "No access to HQ"]) {
    expect(body).not.toContain(leak);
  }
});
`;

/** e2e/unverified-lockout.spec.ts */
export const e2eUnverifiedLockoutSpec = (ctx: Ctx): string => `import { expect, test } from "@playwright/test";

import { signUpThroughForm, uniqueEmail } from "./helpers/accounts";
import { resetAccounts } from "./helpers/emulator";

test.beforeAll(async () => {
  await resetAccounts();
});

test("an unverified account sees a visibly locked field, not a silent one", async ({ page }) => {
  const email = uniqueEmail("locked");
  await signUpThroughForm(page, email);

  const field = page.getByLabel("Display name");
  // The regression this pins: readOnly alone focuses normally and eats
  // keystrokes — indistinguishable from a broken page, which is exactly how
  // it was first reported. Locked must look locked and say why.
  await expect(field).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByText(/Locked until your email is confirmed/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();

  // Sign-up's automatic send succeeded in this tab, and the banner says so —
  // the first production user read the old copy as "nothing was sent" and
  // clicked resend straight into Firebase's generate rate limit, seconds
  // after a mail was already on its way.
  await expect(page.getByText(/We sent a link to .*It can take a minute/)).toBeVisible();

  // The resend reports its own outcome.
  await page.getByRole("button", { name: "Send it again" }).click();
  await expect(page.getByText(/Sent\\. Check your inbox/)).toBeVisible();

  // A fresh visit in a new tab has no record of the automatic send, and must
  // fall back to claiming only what it knows.
  const fresh = await page.context().browser()!.newContext();
  const page2 = await fresh.newPage();
  await page2.goto(page.url());
  await page2.context().addCookies(await page.context().cookies());
  await page2.goto("/app/");
  await expect(page2.getByText(\`\${email} isn't confirmed yet\`)).toBeVisible();
  await expect(page2.getByRole("button", { name: "Email me a confirmation link" })).toBeVisible();
  await fresh.close();
});
`;

/** playwright.config.ts */
export const playwrightConfig = (ctx: Ctx): string => `import { defineConfig, devices } from "@playwright/test";

/**
 * E2E over the Firebase emulators. Run via the root \`pnpm run test:e2e\`, which
 * builds with \`NEXT_PUBLIC_USE_EMULATORS=1\` and wraps this in
 * \`firebase emulators:exec\` — the emulator env vars every layer keys on
 * (client SDK, admin SDK, the edge verifier, the Firestore REST seam) all come
 * from that wrapper. Running \`playwright test\` bare fails at the first
 * sign-up, by design: nothing here can fall through to a real project.
 *
 * Port 3111 so a developer's \`next dev\` on 3000 never collides.
 */
export default defineConfig({
  testDir: "./e2e",
  // One worker, deliberately: every test shares one Auth emulator, and
  // parallel auth flows against shared state are a flake generator. The suite
  // is seconds per spec; parallelism is not where the time is.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3111",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    // The production build, not \`next dev\`: dev compiles routes on first hit,
    // which adds seconds of noise per page and makes every timing flaky.
    command: "pnpm exec next start -p 3111",
    url: "http://localhost:3111",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
`;

/**
 * The consumer section of firestore.rules — inserted above the generated
 * catch-all, the same anchored merge `web init` uses for the waitlist block.
 * Rules are a public API, not a description of the app: the shape checks and
 * key whitelists below are the part a key-whitelist-only rule set misses.
 */
export const CONSUMER_RULES_BLOCK = `    // --- Consumer accounts -------------------------------------------------
    //
    // Everything above this line is an internal surface gated on the \`role\`
    // claim. Below it is the consumer product: people who signed themselves
    // up, hold no role at all, and own exactly one profile document each.

    function isOwner(uid) {
      return request.auth != null && request.auth.uid == uid;
    }

    // Firebase puts \`email_verified\` on the ID token. Reading it through
    // \`.get()\` with a default matters: a provider that never asserts an email
    // omits the claim entirely, and reading a missing claim directly is an
    // evaluation error. An evaluation error does deny — but it denies for a
    // reason nothing in the logs distinguishes from a genuine rule failure,
    // and that is a bad half-hour for whoever debugs it.
    function hasVerifiedEmail() {
      return request.auth != null
        && request.auth.token.get('email_verified', false) == true;
    }

    // The keys a client may author when it creates its own profile.
    // \`email\` and \`createdAt\` appear here and deliberately nowhere in the
    // update list: they are set exactly once, at create, and frozen after.
    // \`schema_version\` is here because the server writes it on every create —
    // a whitelist that rejects the document the app actually produces is a
    // spec for software that does not exist, and the tests were green against
    // that fiction until a review caught it.
    function profileCreateKeys() {
      return ['schema_version', 'displayName', 'photoURL', 'email', 'settings', 'createdAt', 'updatedAt'];
    }

    // Types and sizes, not just key names. Key whitelists answer *which*
    // fields may change and nothing about what may be in them — and a comment
    // in the app claimed the display-name cap was asserted here when it was
    // not. A verified user holding the public web config can skip the app and
    // write a 900 KB displayName straight into a document that /app renders
    // into an <h1>; every field below is bounded so no consumer of a profile
    // has to defend against that. Each check is conditional on presence
    // because every one of these keys is optional in an update.
    function profileShapeOk() {
      let d = request.resource.data;
      return (!('displayName' in d) || (d.displayName is string && d.displayName.size() <= 64))
        && (!('photoURL' in d) || (d.photoURL is string && d.photoURL.size() <= 2048))
        && (!('settings' in d) || d.settings is map)
        && (!('createdAt' in d) || d.createdAt is string)
        && (!('updatedAt' in d) || d.updatedAt is string);
    }

    // The keys a client may change afterwards. This list — not the identity
    // check next to it — is the actual security boundary; see the update rule.
    function profileUpdateKeys() {
      return ['displayName', 'photoURL', 'settings', 'updatedAt'];
    }

    // Why writes require a verified email and reads do not.
    //
    // Firebase will create an account for an address nobody has proved they
    // control; signing up asserts an email, it does not confirm one. Chris's
    // call is that such a user may sign in and use the app — blocking sign-in
    // on verification strands anyone whose confirmation mail is slow, spam
    // filtered, or sent to a work address they read on Monday — but may not
    // write a profile.
    //
    // What that buys: someone registers alice@example.com, never verifies, and
    // fills in the profile — display name, settings, later a health record.
    // The real Alice then cannot sign up, because the account exists, and if
    // support hands the account over she inherits a stranger's data under her
    // own address. Denying the write means an unverified account holds nothing
    // worth inheriting and nothing worth stealing.
    //
    // The cost is real and it lands on the client: an unverified user's writes
    // fail with a generic permission-denied that reads exactly like a bug. The
    // app has to check \`emailVerified\` itself and say "confirm your email"
    // before attempting the write, because this file cannot explain itself to
    // the person who tripped it.

    // Profiles. The document id is the Firebase Auth uid, so ownership is a
    // string comparison and needs no lookup — no get(), no billed read, no
    // ordering problem between the profile and the thing that authorizes it.
    match /users/{uid} {

      // Read is open to a signed-in owner whether or not they have verified,
      // so the app can load its own shell and show the "confirm your email"
      // state rather than a permission error on first paint.
      allow read: if isOwner(uid);

      // Create pins four things at once: the caller is signed in and verified,
      // the document id is their own uid, the key set is closed, and \`email\`
      // is copied off the token rather than supplied by the caller.
      //
      // That last clause is the one that looks redundant and is not. \`email\`
      // is immutable after create, so a client free to name its own would
      // permanently stamp, say, someone-else@example.com onto a document it fully
      // controls — and every later reader that trusts the stored address (a
      // support lookup, a marketing export, an admin console, a rule keyed on
      // domain) would believe it. Requiring \`createdAt\` at create is the same
      // argument run forwards: it can never be added later, so a profile
      // written without it never gets one.
      allow create: if isOwner(uid)
        && hasVerifiedEmail()
        && request.resource.data.keys().hasOnly(profileCreateKeys())
        && request.resource.data.keys().hasAll(['email', 'createdAt'])
        && request.resource.data.email == request.auth.token.email
        // Pinned to the current version: a client cannot claim to be writing a
        // shape that does not exist yet, and absence fails too — a document
        // written without a version never gets one.
        && request.resource.data.schema_version == 1
        && profileShapeOk();

      // The rule this block exists for.
      //
      // \`allow update: if isOwner(uid)\` — the obvious rule, and the one most
      // Firestore projects ship — answers only *who* may write. It says
      // nothing about *what*, so the same client that legitimately renames
      // itself can also write {"role": "admin"} or {"plan": "pro"} onto its
      // own document, and nothing rejects it, because the document is theirs.
      // The escalation is not the write; it happens later, when some other
      // reader — another rule, a Cloud Function, a server route — treats a
      // field on the profile as an entitlement. By then the forged field is
      // indistinguishable from ordinary user data that has been there for
      // months.
      //
      // diff().affectedKeys() closes that by naming the mutable set instead of
      // the mutable writer. It reports added, removed and changed keys alike,
      // so one expression rejects a new \`role\`, an edited \`email\`, and a
      // deleted \`createdAt\`.
      //
      // Entitlements are therefore not merely missing from profileUpdateKeys()
      // — they must never live on this document at all. A plan, a role, a
      // credit balance or a feature flag belongs in a collection the client
      // cannot write, or in a custom claim. Stored here it would be correct
      // today and one careless edit to that list away from being wrong.
      //
      // One caveat on \`settings\`: affectedKeys() is top-level only, so any
      // change anywhere inside that nested map registers as the single key
      // \`settings\` and is allowed wholesale. That is right for preferences and
      // is exactly why nothing that grants anything may be stored under it.
      // A \`settings.plan\` would be client-writable while looking, in this
      // file, like it was covered.
      allow update: if isOwner(uid)
        && hasVerifiedEmail()
        && request.resource.data.diff(resource.data)
             .affectedKeys().hasOnly(profileUpdateKeys())
        && profileShapeOk();

      // Deleting the profile while the Auth user survives leaves an account
      // that can sign in and has nothing to sign in to, and orphans every
      // subcollection under it — subcollections are not deleted with their
      // parent. Account deletion removes the Auth user and the descendants in
      // one pass; it is a server operation through the Admin SDK, which
      // bypasses this file entirely.
      allow delete: if false;
    }

    // Health data, deliberately a subcollection rather than fields on the
    // profile.
    //
    // Rules do not cascade into subcollections in rules_version 2 unless the
    // path says so, and this block deliberately does not reuse the profile's.
    // Divergence is the entire point. The profile's rules will loosen over
    // time — a publicly readable display name, a shared avatar, an email a
    // support tool may read — and every one of those loosenings would reach
    // health records too if they sat on the same document or under a shared
    // \`{document=**}\` match. Widening the profile must not be able to widen
    // this, and the only way to guarantee that is to make it a separate edit
    // to a separate block.
    //
    // **Writes are closed until there is a schema to validate them against.**
    //
    // An earlier version allowed any verified owner to write here on the
    // grounds that no UI does. That reasoning does not hold: deployed rules are
    // a public API, not a description of the app. Any verified user can call
    // Firestore directly, and with no field, type or size whitelist that means
    // arbitrary documents of arbitrary size anywhere under their own subtree —
    // storage and quota abuse today, and unvalidated *health records* written
    // before the retention and deletion model exists.
    //
    // Read stays open so the shape of this block does not change when the
    // first real feature lands; there is nothing to read yet.
    //
    // To open this: model the fields, whitelist them the way /users/{uid}
    // does, decide whether clients may delete a record at all or whether
    // history is append-only, and land the emulator tests in the same commit.
    match /users/{uid}/health/{healthDoc=**} {
      allow read: if isOwner(uid);
      allow write: if false;
    }
`;
