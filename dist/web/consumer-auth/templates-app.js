/**
 * Consumer-auth route and page templates — Layers B and C of
 * cpheinrich/morpheus#135. Routes carry the codified policy (CSRF origin
 * checks, the constant-answer reset route, the auth_time recency window with
 * its same-account re-issue exception, scoped sign-out, the hint cookie); the
 * pages are a starter the project owns after scaffolding.
 *
 * Extracted from Evo, same contract as templates-lib.ts: rendering with Evo's
 * context reproduces Evo's files.
 */
/** app/api/auth/session/route.ts */
export const apiAuthSessionRoute = (ctx) => `import { NextResponse } from "next/server";

import { isSameOrigin } from "@/lib/auth/request-origin.ts";
import { isRole } from "@/lib/auth/roles";
import { adminAuth } from "@/lib/firebase/admin";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
  SIGNED_IN_HINT_COOKIE_NAME,
} from "@/lib/firebase/config";

// The Admin SDK needs Node built-ins; this route must not run on Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * How fresh a sign-in must be to buy a 14-day cookie.
 *
 * \`verifyIdToken(token, true)\` proves a token is valid and unrevoked — not that
 * it is fresh. Without a recency bound, an ID token exfiltrated at any point in
 * its one-hour life converts into a fourteen-day session. Firebase's own
 * session-cookie guidance recommends exactly this check. Five minutes is loose
 * enough for a slow OAuth popup and tight enough that a stale token is useless.
 */
const AUTH_RECENCY_MS = 5 * 60 * 1000;

/** The session cookie on an incoming request, if any. */
function sessionCookieFrom(request: Request): string | undefined {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(\`\${SESSION_COOKIE_NAME}=\`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);
}

function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/**
 * The readable companion to the session cookie. Same lifetime, same path, so
 * the two expire together and the header cannot advertise a session that has
 * already lapsed.
 *
 * \`httpOnly: false\` is the whole purpose — see SIGNED_IN_HINT_COOKIE_NAME. It
 * holds no identity and confers nothing.
 */
function signedInHintOptions(maxAgeSeconds: number) {
  return {
    name: SIGNED_IN_HINT_COOKIE_NAME,
    value: "",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/**
 * Exchange a Firebase ID token for a session cookie.
 *
 * This route authenticates and does not authorise. Any Firebase user with a
 * valid, unrevoked ID token gets a session; what that session can reach is
 * decided elsewhere, by the \`role\` claim, in \`proxy.ts\` and in the Firestore
 * rules.
 *
 * It used to refuse anyone without a role, because the only signed-in users
 * were the internal team and \`/hq\` was the only destination. Consumer accounts
 * ended that: they are Firebase users with no role at all, and a route that
 * conflates "who are you" with "may you read the books" cannot serve both.
 *
 * The relaxation is safe only because the role check was never really here.
 * \`canAccessHq(null)\` is false, and the rules read
 * \`request.auth.token.get('role', '')\`, which is empty for a consumer — so an
 * account with no role reaches nothing it could not reach before. There is a
 * test asserting exactly that, and it should be treated as load-bearing.
 *
 * The role is still never assigned here. It is a custom claim written by
 * \`morpheus access sync\` from the allowlists in \`morpheus.json\`. That ordering
 * matters: if this route could grant a role, the role would stop being the
 * same fact the Firestore rules see.
 */
export async function POST(request: Request) {
  // Login CSRF, and it is not theoretical. Without this another site can
  // top-level POST an attacker-owned ID token and the response below installs
  // that identity as this browser's 14-day session — after which the person
  // types their name, and later their health data, into someone else's
  // account. \`SameSite=Lax\` governs sending an existing cookie, not setting a
  // new one, and \`request.json()\` ignores Content-Type, so a plain
  // \`<form enctype="text/plain">\` reaches here with no preflight. Firebase's
  // session-cookie guide requires this check.
  if (!isSameOrigin(request.headers)) {
    return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  }

  let idToken: string;
  try {
    const body = await request.json();
    idToken = String(body.idToken ?? "");
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  if (!idToken) {
    return NextResponse.json({ error: "Missing ID token." }, { status: 400 });
  }

  const auth = adminAuth();

  let decoded;
  try {
    // checkRevoked: a token minted before the user was removed from the
    // allowlist must not buy a fresh 14-day cookie.
    decoded = await auth.verifyIdToken(idToken, true);
  } catch {
    return NextResponse.json({ error: "Invalid or expired sign-in." }, { status: 401 });
  }

  // Recency, with one deliberate exception. Two legitimate callers arrive
  // with an old auth_time: the verification handler reminting after
  // \`applyActionCode\`, and the banner reconciling a cross-device verify. Both
  // already hold a valid session cookie for the same account, so "prove you
  // are already this person" substitutes for "prove you signed in just now".
  // A thief with only a leaked ID token has no such cookie and is refused.
  const authAgeMs = Date.now() - Number(decoded.auth_time) * 1000;
  if (authAgeMs > AUTH_RECENCY_MS) {
    let reissue = false;
    const existing = sessionCookieFrom(request);
    if (existing) {
      try {
        const current = await auth.verifySessionCookie(existing, true);
        reissue = current.sub === decoded.sub;
      } catch {
        // An unverifiable cookie is no proof of anything; fall through.
      }
    }
    if (!reissue) {
      return NextResponse.json(
        { error: "That sign-in is too old. Sign in again." },
        { status: 401 },
      );
    }
  }

  const expiresIn = SESSION_MAX_AGE_MS;

  // Guarded like the verify above it: an unhandled throw here is a 500 with no
  // JSON body, which the client reports as a generic failure with no log line
  // naming the actual cause.
  let sessionCookie: string;
  try {
    sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });
  } catch (error) {
    console.error("[auth] createSessionCookie failed", error);
    return NextResponse.json(
      { error: "Could not create a session. Try again shortly." },
      { status: 500 },
    );
  }

  // \`role\` is null for a consumer account, which is not an error and must not
  // be reported as one. The client uses it only to choose a destination —
  // never to decide access, which is the gate's job.
  const role = isRole(decoded.role) ? decoded.role : null;

  const response = NextResponse.json({
    ok: true,
    role,
    emailVerified: decoded.email_verified === true,
  });
  response.cookies.set({ ...sessionCookieOptions(expiresIn / 1000), value: sessionCookie });

  // A companion cookie carrying no identity, only the fact that a session
  // exists. The session cookie is httpOnly and must stay that way, but the
  // marketing header has to choose between "Sign in" and "Dashboard" on the
  // first paint of a statically prerendered page — and a page that reads the
  // session server-side stops being static, which is a real cost on the
  // content pages that are still fighting to get indexed. This is readable by
  // script, deliberately, and it authorises nothing: forging it gets you a
  // header button and a redirect to sign-in.
  response.cookies.set({ ...signedInHintOptions(expiresIn / 1000), value: "1" });
  return response;
}

/** Sign out. Clears the cookie and revokes refresh tokens for the session. */
export async function DELETE(request: Request) {
  // Same check on sign-out. The harm is smaller — an attacker can only log
  // someone out — but a cross-site request should not be able to revoke this
  // browser's refresh tokens either.
  if (!isSameOrigin(request.headers)) {
    return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  }

  const cookie = sessionCookieFrom(request);

  if (cookie) {
    try {
      const auth = adminAuth();
      const decoded = await auth.verifySessionCookie(cookie, false);

      // What "sign out" means depends on who is signing out.
      //
      // Revocation is per *user*, not per session — Firebase has no narrower
      // lever. For a consumer on two devices, revoking here means signing out
      // on a phone silently breaks writes on the laptop while its pages keep
      // rendering as signed in: the worst of both. So a consumer sign-out is
      // this browser only, which is what the button reads as. Ending every
      // session is what a password reset is for, and Firebase revokes on
      // password change itself.
      //
      // Internal accounts keep revoke-everywhere: they hold a role, they can
      // reach operating data, and for them "signed out means everywhere" is a
      // safety property worth the multi-device awkwardness.
      if (isRole(decoded.role)) {
        await auth.revokeRefreshTokens(decoded.sub);
      }
    } catch {
      // An unverifiable cookie is already useless; clearing it is enough.
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({ ...sessionCookieOptions(0) });
  // Clear the hint too. Leaving it behind is not a security problem — it
  // authorises nothing — but the header would keep offering "Dashboard" to
  // someone who just signed out, which reads as a broken sign-out.
  response.cookies.set({ ...signedInHintOptions(0) });
  return response;
}
`;
/** app/api/auth/reset-password/route.ts */
export const apiResetPasswordRoute = (ctx) => `import { NextResponse } from "next/server";

import { isSameOrigin } from "@/lib/auth/request-origin.ts";
import { requestOrigin, sendPasswordResetEmail } from "@/lib/auth/send-action-email";
import { allowAttempt } from "@/lib/waitlist/throttle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Request a password reset link.
 *
 * **Answers identically to every request, always.** Not a nicety: any variation
 * — a different status, a different message, a detectably different response
 * time — turns this endpoint into an oracle for testing whether an address has
 * an ${ctx.name} account. The same reasoning governs \`/api/waitlist\`, whose comment
 * says the same thing about its own constant response.
 *
 * That is why the outcome is logged and discarded rather than returned, and why
 * a bad address, an unknown address, a provider outage and a successful send
 * are one response.
 */

/**
 * The only body this route ever produces.
 *
 * A function, not a module-level constant, and that is not a style preference.
 * A \`Response\` body is a stream that is consumed when it is read, so returning
 * one shared instance gives the first caller \`{"ok":true}\` and everyone after
 * an empty body — with identical status codes, so nothing looks broken. That
 * is a working enumeration oracle built out of a caching mistake: an attacker
 * cannot read the difference between two addresses, but they can read the
 * difference between the first request and the rest, and a fresh instance
 * makes every response byte-identical again. Found by asking the route the same
 * question three times.
 */
function accepted() {
  return NextResponse.json({ ok: true });
}

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Two independent buckets, not one keyed on the pair.
 *
 * A single \`ip:email\` key enforces neither bound it appears to: every new
 * address from one host gets a fresh budget, and so does every new host aimed
 * at one address — which is precisely the two attacks worth stopping, since
 * this route mints Firebase action codes and sends paid external email. An
 * earlier version of this function claimed the opposite in a comment.
 *
 * Charging both buckets means the address bucket bounds how much mail one
 * person can be sent from anywhere, and the host bucket bounds how many
 * addresses one host can walk.
 *
 * \`throttle.ts\` is honest that its map is per-instance, so cold starts and
 * parallel Vercel instances each get their own budget. This is a speed bump
 * against a naive loop, not a rate limit; a real one needs a shared store this
 * project does not have. Provider-side limits at Resend are the durable
 * backstop until it does.
 */
function withinLimits(request: Request, email: string): boolean {
  // Both are charged deliberately — \`&&\` would short-circuit and leave the
  // second bucket uncounted whenever the first already refused.
  const byEmail = allowAttempt(\`reset:email:\${email}\`);
  const byHost = allowAttempt(\`reset:ip:\${clientIp(request)}\`);
  return byEmail && byHost;
}

export async function POST(request: Request) {
  // Cross-site callers get the same constant answer as everyone else: saying
  // "refused" here would be a signal this route otherwise refuses to give.
  if (!isSameOrigin(request.headers)) return accepted();

  let email: string;
  try {
    const body = await request.json();
    email = String(body.email ?? "").trim().toLowerCase();
  } catch {
    return accepted();
  }

  // Not validated beyond emptiness, and not reported. An invalid address cannot
  // have an account, so the honest answer and the constant answer agree.
  if (!email) return accepted();

  if (!withinLimits(request, email)) {
    // Also a silent success. Saying "too many attempts" would confirm that
    // *something* about this address is worth rate limiting.
    console.warn("[auth] reset throttled");
    return accepted();
  }

  const outcome = await sendPasswordResetEmail(email, requestOrigin(request));
  if (!outcome.sent) {
    // Logged only. \`auth/user-not-found\` is the ordinary case here and is not
    // an error worth alerting on; a \`delivery\` reason is.
    console.info(\`[auth] reset not sent: \${outcome.reason}\`);
  }

  return accepted();
}
`;
/** app/api/account/route.ts */
export const apiAccountRoute = (ctx) => `import { NextResponse } from "next/server";

import { isValidDisplayName, normalizeDisplayName } from "${ctx.scope}/shared/schema/user";

import { isSameOrigin } from "@/lib/auth/request-origin.ts";
import { writingUser } from "@/lib/auth/writing-user";
import { ensureProfile, getProfile, setDisplayName } from "@/lib/users/store";

// The Firestore REST calls need Node built-ins through the credential chain;
// this route must not run on Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The signed-in account's own profile. There is deliberately no way to name a
 * different one: the uid comes from the verified session cookie, never from the
 * request, so there is no id to tamper with and no lookup to authorise.
 *
 * Note \`trailingSlash: true\` — callers must request \`/api/account/\`. Without
 * the slash Next answers 308, and a \`fetch\` following a 308 re-sends the method
 * but is easy to misread as the handler misbehaving.
 */

/**
 * Refuse a state-changing request that did not come from a page on this origin.
 * These routes write with the deployment credential, so a cross-site POST would
 * be a write nobody on this site asked for.
 */
function crossSite() {
  return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
}

/** Verification gates writes, not reads — see the Firestore rules for why. */
function requireVerified(user: { emailVerified: boolean }) {
  return user.emailVerified
    ? null
    : NextResponse.json(
        { error: "Confirm your email address before changing your profile." },
        { status: 403 },
      );
}

export async function GET() {
  // Revocation-checked, same as the writes. The cheap signature-only check is
  // the right trade for page renders; this route is already force-dynamic and
  // already does a Firestore round trip, and it returns the profile itself —
  // so a leaked cookie surviving a password reset must not keep reading it
  // for fourteen days. The remaining gap is purely rendered pages (/app's
  // shell), which show stale identity until the cookie expires but expose no
  // data this route does not.
  const user = await writingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Read tolerates an unverified user so the app can render its own shell and
  // show the "confirm your email" state rather than an error on first paint.
  const profile = await getProfile(user.uid);

  return NextResponse.json({
    profile,
    email: user.email,
    emailVerified: user.emailVerified,
  });
}

/**
 * Create the profile document if this account has none.
 *
 * Called after sign-in rather than from a Cloud Function \`onCreate\` trigger,
 * which would need Blaze and Identity Platform — ${ctx.name} is on Spark deliberately.
 * Idempotent, so calling it on every sign-in is correct and cheap.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request.headers)) return crossSite();

  // \`writingUser\`, not \`currentUser\`: this writes with the server credential and
  // therefore bypasses the Firestore rules, so a revoked session must not reach it.
  const user = await writingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const denied = requireVerified(user);
  if (denied) return denied;

  if (!user.email) {
    // The rules pin \`email == request.auth.token.email\` at create, so a token
    // without one cannot produce a valid document. Refusing here says so;
    // letting it through would surface as an opaque permission error.
    return NextResponse.json(
      { error: "This account has no email address." },
      { status: 400 },
    );
  }

  const { created } = await ensureProfile(user.uid, user.email);
  return NextResponse.json({ ok: true, created });
}

/** Update the display name. The only mutable field today. */
export async function PATCH(request: Request) {
  if (!isSameOrigin(request.headers)) return crossSite();

  const user = await writingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const denied = requireVerified(user);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const raw = (body as { displayName?: unknown }).displayName;
  if (typeof raw !== "string") {
    return NextResponse.json({ error: "Missing display name." }, { status: 400 });
  }

  // Normalise before validating, and store what was validated — otherwise a
  // name that passes the cap by a trailing space is stored one character over
  // it, and the client and server disagree about what was saved.
  const displayName = normalizeDisplayName(raw);
  if (!isValidDisplayName(displayName)) {
    return NextResponse.json({ error: "That name is too long." }, { status: 400 });
  }

  // Someone may reach this before the profile exists — a first sign-in whose
  // POST failed, or a session older than the collection. Creating first keeps
  // the rename from failing on a missing document for a reason the person
  // cannot act on.
  if (user.email) await ensureProfile(user.uid, user.email);
  await setDisplayName(user.uid, displayName);

  return NextResponse.json({ ok: true, displayName });
}
`;
/** app/api/account/verify-email/route.ts */
export const apiVerifyEmailRoute = (ctx) => `import { NextResponse } from "next/server";

import { isSameOrigin } from "@/lib/auth/request-origin.ts";
import { requestOrigin, sendVerificationEmail } from "@/lib/auth/send-action-email";
import { writingUser } from "@/lib/auth/writing-user";
import { allowAttempt } from "@/lib/waitlist/throttle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Send — or resend — the address confirmation for the signed-in account.
 *
 * Unlike the reset route this one can speak plainly. It requires a session, and
 * the address comes from the verified token rather than the request, so there
 * is no address to probe and nothing a caller could learn that they do not
 * already know about their own account.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request.headers)) {
    return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  }

  // Sends paid external email against a Firebase quota, so a revoked session
  // must not be able to keep triggering it.
  const user = await writingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (user.emailVerified) {
    // Not an error. A second tab, a stale page, or someone clicking twice after
    // confirming — all of which should read as "you're done", not as a failure.
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  if (!user.email) {
    return NextResponse.json({ error: "This account has no email address." }, { status: 400 });
  }

  if (!allowAttempt(\`verify:\${user.uid}\`)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 },
    );
  }

  const outcome = await sendVerificationEmail(user.email, requestOrigin(request));

  if (outcome.reason === "rate-limited") {
    // Firebase refused to mint another code so soon after the last one — which
    // almost always means a mail is already on its way from sign-up's
    // automatic send. Saying "could not send" here reads as delivery failure
    // and invites the retry loop that keeps the limit tripped.
    return NextResponse.json(
      { error: "A link was sent moments ago. Give it a minute or two to arrive, then try again." },
      { status: 429 },
    );
  }

  if (!outcome.sent) {
    // Distinguished from the throttle above so the person is told which of the
    // two happened: one resolves by waiting, the other does not.
    return NextResponse.json(
      { error: "Could not send the confirmation just now. Try again shortly." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
`;
/** app/sign-in/page.tsx */
export const signInPage = (ctx) => `import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth/current-user";
import { safeNext } from "@/lib/auth/safe-next.ts";

import { SignInForm } from "./SignInForm";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destination = safeNext(next);

  // Any signed-in user is already past this page. The role check that used to
  // live here is gone deliberately: it would have held a consumer on the sign-in
  // form forever, since they will never satisfy it.
  const user = await currentUser();
  if (user) redirect(destination);

  return (
    <div className="auth-shell">
      <div className="auth-header">
        <p className="eyebrow">Your account</p>
        <h1>Sign in</h1>
        <p>Free, no paywall. We don&rsquo;t sell anything and we don&rsquo;t sell your data.</p>
      </div>

      <SignInForm next={destination} />
    </div>
  );
}
`;
/** app/sign-in/SignInForm.tsx */
export const signInForm = (ctx) => `"use client";

import { signInWithEmailAndPassword } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { authErrorMessage, emailProblem, errorCode } from "@/lib/auth/errors";
import { establishSession } from "@/lib/auth/session-client";
import { getClientAuth } from "@/lib/firebase/client";

import { GoogleButton } from "./GoogleButton";

type Status = "idle" | "working" | "error";

export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const fieldId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [providerBusy, setProviderBusy] = useState(false);

  const working = status === "working";
  const busy = working || providerBusy;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    // Checked here so an obvious mistake costs no round trip. Firebase remains
    // the authority on whether the credentials are right.
    const problem = emailProblem(email);
    if (problem) {
      setStatus("error");
      setMessage(problem);
      return;
    }
    if (!password) {
      setStatus("error");
      setMessage("Enter your password.");
      return;
    }

    setStatus("working");
    setMessage(null);

    try {
      const credential = await signInWithEmailAndPassword(
        getClientAuth(),
        email.trim(),
        password,
      );
      const failure = await establishSession(credential.user);

      if (failure) {
        setStatus("error");
        setMessage(failure.error);
        return;
      }

      router.replace(next);
      router.refresh();
    } catch (error) {
      console.error(\`[auth] sign-in: \${errorCode(error) || "unknown"}\`, error);
      setStatus("error");
      setMessage(authErrorMessage(error));
    }
  }

  return (
    <div className="grid gap-6">
      <GoogleButton next={next} onBusyChange={setProviderBusy} />

      <p className="auth-divider">or</p>

      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        <div className="auth-field">
          <label htmlFor={\`\${fieldId}-email\`}>Email address</label>
          <input
            id={\`\${fieldId}-email\`}
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            // readOnly, never disabled: disabling the focused control moves
            // focus to the document, so a screen reader loses its place and the
            // error below is announced from nowhere.
            readOnly={busy}
            aria-invalid={status === "error" ? true : undefined}
          />
        </div>

        <div className="auth-field">
          <label htmlFor={\`\${fieldId}-password\`}>Password</label>
          <input
            id={\`\${fieldId}-password\`}
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            readOnly={busy}
            aria-invalid={status === "error" ? true : undefined}
          />
          <Link href="/reset-password" className="auth-hint text-link">
            Forgot your password?
          </Link>
        </div>

        <button type="submit" disabled={busy} className="button">
          {working ? "Signing in…" : "Sign in"}
        </button>

        {message && (
          <p role="alert" className="auth-message">
            {message}
          </p>
        )}
      </form>

      <p className="auth-footnote">
        No account yet?{" "}
        <Link href="/sign-up" className="text-link">
          Create one
        </Link>
        .
      </p>
    </div>
  );
}
`;
/** app/sign-in/GoogleButton.tsx */
export const googleButton = (ctx) => `"use client";

import { signInWithPopup } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authErrorMessage, errorCode } from "@/lib/auth/errors";
import { establishSession } from "@/lib/auth/session-client";
import { getClientAuth, googleProvider } from "@/lib/firebase/client";

/**
 * Google sign-in, shared by /sign-in and /sign-up.
 *
 * One button for both, because Google has no concept of the difference: the
 * same flow creates an account or signs into an existing one. Presenting them
 * as separate actions would imply a choice that does not exist, and put a
 * person who already has an account through a page that says "Create account".
 *
 * \`signInWithPopup\`, not \`signInWithRedirect\`. Redirect relies on cookies
 * surviving a round trip through \`<project>.firebaseapp.com\`, which browsers
 * partition or block as third-party. Popup keeps the whole exchange on one
 * origin.
 */
export function GoogleButton({
  next,
  label = "Continue with Google",
  onBusyChange,
}: {
  next: string;
  label?: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function setWorking(value: boolean) {
    setBusy(value);
    onBusyChange?.(value);
  }

  async function handleClick() {
    setWorking(true);
    setMessage(null);

    try {
      const credential = await signInWithPopup(getClientAuth(), googleProvider());
      const failure = await establishSession(credential.user);

      if (failure) {
        setMessage(failure.error);
        setWorking(false);
        return;
      }

      router.replace(next);
      router.refresh();
    } catch (error) {
      // Logged with its code: popup-blocked, unauthorized-domain and a genuine
      // network failure are three different fixes behind one visible message.
      console.error(\`[auth] google: \${errorCode(error) || "unknown"}\`, error);
      setMessage(authErrorMessage(error));
      setWorking(false);
    }
  }

  return (
    <div className="grid gap-3">
      <button type="button" onClick={handleClick} disabled={busy} className="auth-provider">
        <GoogleMark />
        {busy ? "Opening Google…" : label}
      </button>
      {message && (
        <p role="alert" className="auth-message">
          {message}
        </p>
      )}
    </div>
  );
}

/** Google's mark, inline so it needs no network request and no build step. */
function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
`;
/** app/sign-up/page.tsx */
export const signUpPage = (ctx) => `import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth/current-user";
import { safeNext } from "@/lib/auth/safe-next.ts";

import { SignUpForm } from "./SignUpForm";

export const metadata: Metadata = {
  title: "Create an account",
  robots: { index: false, follow: false },
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destination = safeNext(next);

  const user = await currentUser();
  if (user) redirect(destination);

  return (
    <div className="auth-shell">
      <div className="auth-header">
        <p className="eyebrow">Your account</p>
        <h1>Create an account</h1>
        {/*
          What an account is for, stated plainly and without overclaiming.
          An account page is exactly where an implied feature that does not
          exist would creep in — keep this paragraph true of the product as it
          is, not as it is planned.
        */}
        <p>
          Free, no paywall. We don&rsquo;t sell anything and we don&rsquo;t sell your data. An
          account saves your name and settings; the tools work without one.
        </p>
      </div>

      <SignUpForm next={destination} />
    </div>
  );
}
`;
/** app/sign-up/SignUpForm.tsx */
export const signUpForm = (ctx) => `"use client";

import { createUserWithEmailAndPassword } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import {
  authErrorMessage,
  emailProblem,
  errorCode,
  passwordProblem,
} from "@/lib/auth/errors";
import { establishSession } from "@/lib/auth/session-client";
import { getClientAuth } from "@/lib/firebase/client";

import { GoogleButton } from "../sign-in/GoogleButton";

type Status = "idle" | "working" | "error";

export function SignUpForm({ next }: { next: string }) {
  const router = useRouter();
  const fieldId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [providerBusy, setProviderBusy] = useState(false);

  const working = status === "working";
  const busy = working || providerBusy;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    const problem = emailProblem(email) ?? passwordProblem(password);
    if (problem) {
      setStatus("error");
      setMessage(problem);
      return;
    }

    setStatus("working");
    setMessage(null);

    try {
      const credential = await createUserWithEmailAndPassword(
        getClientAuth(),
        email.trim(),
        password,
      );

      // Session first, because the confirmation is sent by our own route and
      // that route authenticates off the session cookie. Firebase's client-side
      // sendEmailVerification is not used at all: its mail links to a
      // firebaseapp.com handler we cannot repoint (see lib/auth/action-link.ts).
      const failure = await establishSession(credential.user);
      if (failure) {
        setStatus("error");
        setMessage(failure.error);
        return;
      }

      // Not fatal: the account exists either way and /app carries a resend
      // control. Blocking the redirect on a mail send would leave someone with
      // an account they cannot reach because a mail server was slow.
      try {
        const sent = await fetch("/api/account/verify-email/", { method: "POST" });
        if (sent.ok) {
          // Let /app say truthfully that a mail is on its way. sessionStorage,
          // not state: the next page is a different route, and the fact should
          // not outlive the tab — a later visit should not claim a fresh send.
          sessionStorage.setItem("${ctx.slug}:verification-sent-at", String(Date.now()));
        }
      } catch (error) {
        console.error("[auth] verification mail failed; /app can resend", error);
      }

      router.replace(next);
      router.refresh();
    } catch (error) {
      console.error(\`[auth] sign-up: \${errorCode(error) || "unknown"}\`, error);
      setStatus("error");
      setMessage(authErrorMessage(error));
    }
  }

  return (
    <div className="grid gap-6">
      <GoogleButton next={next} label="Sign up with Google" onBusyChange={setProviderBusy} />

      <p className="auth-divider">or</p>

      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        <div className="auth-field">
          <label htmlFor={\`\${fieldId}-email\`}>Email address</label>
          <input
            id={\`\${fieldId}-email\`}
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            readOnly={busy}
            aria-invalid={status === "error" ? true : undefined}
          />
        </div>

        <div className="auth-field">
          <label htmlFor={\`\${fieldId}-password\`}>Password</label>
          <input
            id={\`\${fieldId}-password\`}
            type="password"
            name="password"
            // \`new-password\`, not \`current-password\` — it is what tells a
            // password manager to offer to generate and save one.
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            readOnly={busy}
            aria-invalid={status === "error" ? true : undefined}
          />
          <p className="auth-hint">At least 8 characters.</p>
        </div>

        <button type="submit" disabled={busy} className="button">
          {working ? "Creating your account…" : "Create account"}
        </button>

        {message && (
          <p role="alert" className="auth-message">
            {message}
          </p>
        )}
      </form>

      <p className="auth-footnote">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-link">
          Sign in
        </Link>
        .
      </p>
    </div>
  );
}
`;
/** app/reset-password/page.tsx */
export const resetPasswordPage = (ctx) => `import type { Metadata } from "next";

import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <div className="auth-shell">
      <div className="auth-header">
        <p className="eyebrow">Your account</p>
        <h1>Reset your password</h1>
        <p>
          Enter the address you signed up with and we&rsquo;ll send a link to set a new
          password.
        </p>
      </div>

      <ResetPasswordForm />
    </div>
  );
}
`;
/** app/reset-password/ResetPasswordForm.tsx */
export const resetPasswordForm = (ctx) => `"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { emailProblem } from "@/lib/auth/errors";

type Status = "idle" | "working" | "sent" | "error";

export function ResetPasswordForm() {
  const fieldId = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const working = status === "working";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (working) return;

    const problem = emailProblem(email);
    if (problem) {
      setStatus("error");
      setMessage(problem);
      return;
    }

    setStatus("working");
    setMessage(null);

    try {
      // The route answers \`{ok:true}\` to everything — unknown address,
      // throttled, provider outage alike — so there is no failure branch to
      // distinguish here. Any variation would turn this form into an oracle for
      // testing whether an address has an account. Only an unreachable server
      // is reported, because that is about the network rather than the address.
      await fetch("/api/auth/reset-password/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      setStatus("sent");
    } catch (error) {
      console.error("[auth] reset request failed", error);
      setStatus("error");
      setMessage("Could not reach the server. Check your connection.");
    }
  }

  if (status === "sent") {
    return (
      <div className="grid gap-6">
        <p role="status" className="auth-message auth-message-info">
          If that address has an account, a reset link is on its way. It expires in an hour.
        </p>
        <p className="auth-footnote">
          <Link href="/sign-in" className="text-link">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        <div className="auth-field">
          <label htmlFor={\`\${fieldId}-email\`}>Email address</label>
          <input
            id={\`\${fieldId}-email\`}
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            readOnly={working}
            aria-invalid={status === "error" ? true : undefined}
          />
        </div>

        <button type="submit" disabled={working} className="button">
          {working ? "Sending…" : "Send reset link"}
        </button>

        {message && (
          <p role="alert" className="auth-message">
            {message}
          </p>
        )}
      </form>

      <p className="auth-footnote">
        <Link href="/sign-in" className="text-link">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
`;
/** app/auth/action/page.tsx */
export const authActionPage = (ctx) => `import type { Metadata } from "next";

import { ActionHandler } from "./ActionHandler";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Where Firebase's emailed links land.
 *
 * Set as the action URL on both projects' templates — \`https://${ctx.productionHost}/auth/action\`
 * and \`https://${ctx.stagingHost}/auth/action\` — so verification and reset finish
 * on ${ctx.name} rather than throwing people out to a \`firebaseapp.com\` page mid-flow.
 *
 * \`nocache\` on top of \`noindex\`: the URL carries a single-use credential in its
 * query string, and a cached copy of the page is a cached copy of that.
 */
export default async function AuthActionPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; oobCode?: string }>;
}) {
  const { mode, oobCode } = await searchParams;

  return (
    <div className="auth-shell">
      <ActionHandler mode={mode ?? null} oobCode={oobCode ?? null} />
    </div>
  );
}
`;
/** app/auth/action/ActionHandler.tsx */
export const authActionHandler = (ctx) => `"use client";

import {
  applyActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { authErrorMessage, errorCode, passwordProblem } from "@/lib/auth/errors";
import { getClientAuth } from "@/lib/firebase/client";

/**
 * One route handles every link Firebase mails.
 *
 * Firebase sends verification and password-reset mail to a single configured
 * action URL and distinguishes them with a \`mode\` parameter — so this is one
 * page dispatching on \`mode\`, not several routes. Pointing the templates at
 * \`/verify-email\` and \`/reset-password\` separately is not an option the
 * console offers.
 *
 * Client-side because the \`oobCode\` must be redeemed by the Firebase SDK. The
 * code is in the URL, which is why nothing here is trusted until Firebase
 * confirms it: \`verifyPasswordResetCode\` is called before the new-password form
 * is shown, so an expired link fails immediately rather than after someone has
 * chosen and typed a password twice.
 */

type Mode = "verifyEmail" | "resetPassword" | "recoverEmail" | "unknown";

function readMode(value: string | null): Mode {
  if (value === "verifyEmail" || value === "resetPassword" || value === "recoverEmail") {
    return value;
  }
  return "unknown";
}

export function ActionHandler({
  mode: rawMode,
  oobCode,
}: {
  mode: string | null;
  oobCode: string | null;
}) {
  const mode = readMode(rawMode);

  if (!oobCode || mode === "unknown") {
    return (
      <Outcome
        title="That link is not valid"
        body="It may have been altered in transit, or already used. Request a new one."
        action={{ href: "/sign-in", label: "Back to sign in" }}
      />
    );
  }

  if (mode === "verifyEmail") return <VerifyEmail oobCode={oobCode} />;
  if (mode === "resetPassword") return <ResetPassword oobCode={oobCode} />;

  // recoverEmail — reverting an address change. Rare, and the flow to undo it
  // properly is more than a scaffold should invent, so it says so plainly
  // rather than pretending to handle it.
  return (
    <Outcome
      title="Email change"
      body="Write to us and we'll sort this out."
      action={{ href: "/", label: "Back to ${ctx.name}" }}
    />
  );
}

function VerifyEmail({ oobCode }: { oobCode: string }) {
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState<string | null>(null);
  // React runs effects twice in development Strict Mode, and an oobCode is
  // single-use — the second call would fail on a link that had just worked.
  const redeemed = useRef(false);

  useEffect(() => {
    if (redeemed.current) return;
    redeemed.current = true;

    applyActionCode(getClientAuth(), oobCode)
      .then(async () => {
        // Refreshing the *client* ID token is not enough, and getting this
        // wrong is invisible until someone tries to save their name.
        //
        // \`email_verified\` is stamped into a token when it is issued. \`/app\`,
        // \`/api/account\` and the Firestore rules all read the separate
        // httpOnly \`__session\` cookie, which was minted before verification and
        // keeps saying \`false\` for up to fourteen days. Without reminting it,
        // this page would announce success and link back to an app that
        // refuses every profile write — the worst kind of bug, because the
        // person did everything right.
        //
        // Not fatal if it fails: the address is verified either way, and a
        // fresh sign-in mints a correct session. Someone who opened the link on
        // a device where they are not signed in has no \`currentUser\` at all,
        // which is the ordinary case for email read on a phone.
        const user = getClientAuth().currentUser;
        if (user) {
          try {
            const idToken = await user.getIdToken(true);
            await fetch("/api/auth/session/", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ idToken }),
            });
          } catch (error) {
            console.error("[auth] could not remint the session after verifying", error);
          }
        }
        setState("done");
      })
      .catch((error) => {
        console.error(\`[auth] verify: \${errorCode(error) || "unknown"}\`, error);
        setMessage(authErrorMessage(error));
        setState("error");
      });
  }, [oobCode]);

  if (state === "working") {
    return <Outcome title="Confirming your email…" body="One moment." />;
  }

  if (state === "error") {
    return (
      <Outcome
        title="That link didn't work"
        body={message ?? "Request a new one from your account."}
        action={{ href: "/app", label: "Go to your account" }}
      />
    );
  }

  return (
    <Outcome
      title="Your email is verified"
      body="You can change your name and settings now."
      action={{ href: "/app", label: "Go to your account" }}
    />
  );
}

function ResetPassword({ oobCode }: { oobCode: string }) {
  const fieldId = useId();
  const [state, setState] = useState<"checking" | "ready" | "working" | "done" | "error">(
    "checking",
  );
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;

    // Verified before the form is shown, so an expired link says so now rather
    // than after someone has chosen a password.
    verifyPasswordResetCode(getClientAuth(), oobCode)
      .then(() => setState("ready"))
      .catch((error) => {
        console.error(\`[auth] reset verify: \${errorCode(error) || "unknown"}\`, error);
        setMessage(authErrorMessage(error));
        setState("error");
      });
  }, [oobCode]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (state === "working") return;

    const problem = passwordProblem(password);
    if (problem) {
      setMessage(problem);
      return;
    }

    setState("working");
    setMessage(null);

    try {
      await confirmPasswordReset(getClientAuth(), oobCode, password);
      setState("done");
    } catch (error) {
      console.error(\`[auth] reset confirm: \${errorCode(error) || "unknown"}\`, error);
      setMessage(authErrorMessage(error));
      setState("ready");
    }
  }

  if (state === "checking") {
    return <Outcome title="Checking your link…" body="One moment." />;
  }

  if (state === "error") {
    return (
      <Outcome
        title="That link has expired"
        body={message ?? "Request a new one."}
        action={{ href: "/reset-password", label: "Send a new link" }}
      />
    );
  }

  if (state === "done") {
    return (
      <Outcome
        title="Your password is set"
        body="Sign in with your new password."
        action={{ href: "/sign-in", label: "Sign in" }}
      />
    );
  }

  return (
    <>
      <div className="auth-header">
        <p className="eyebrow">Your account</p>
        <h1>Choose a new password</h1>
      </div>

      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        <div className="auth-field">
          <label htmlFor={\`\${fieldId}-password\`}>New password</label>
          <input
            id={\`\${fieldId}-password\`}
            type="password"
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            readOnly={state === "working"}
            aria-invalid={message ? true : undefined}
          />
          <p className="auth-hint">At least 8 characters.</p>
        </div>

        <button type="submit" disabled={state === "working"} className="button">
          {state === "working" ? "Saving…" : "Set password"}
        </button>

        {message && (
          <p role="alert" className="auth-message">
            {message}
          </p>
        )}
      </form>
    </>
  );
}

function Outcome({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <>
      <div className="auth-header">
        <p className="eyebrow">Your account</p>
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
      {action && (
        <Link href={action.href} className="button">
          {action.label}
        </Link>
      )}
    </>
  );
}
`;
/** app/app/layout.tsx */
export const appLayout = (ctx) => `import type { Metadata } from "next";
import Link from "next/link";

import { currentUser } from "@/lib/auth/current-user";
import { SignOutButton } from "@/app/hq/SignOutButton";

export const metadata: Metadata = {
  title: { default: "Your account", template: "%s · ${ctx.name}" },
  // Belt and braces with the route gate. Nothing under /app should reach an
  // index, including a page rendered before the gate runs.
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The signed-in shell.
 *
 * Deliberately thin. The product experience behind an account is not designed
 * yet, so this establishes the frame — who you are, how to leave, where
 * settings live — and nothing more. Filling it with placeholder features would
 * make decisions that should be made deliberately later.
 *
 * \`proxy.ts\` guarantees a session before this renders; \`currentUser()\` here is
 * for the identity, not the gate.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();

  return (
    <div className="signed-in-surface min-h-screen">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex w-full max-w-[900px] flex-wrap items-center justify-between gap-5 px-5 py-5">
          <div className="flex items-center gap-6">
            <Link href="/" className="wordmark" aria-label="${ctx.name} home">
              ${ctx.upper}<span aria-hidden="true">/</span>
            </Link>
            <nav aria-label="Account" className="flex flex-wrap gap-5">
              <Link href="/app" className="text-[0.8rem] text-[var(--secondary)]">
                Account
              </Link>
              <Link href="/tools" className="text-[0.8rem] text-[var(--secondary)]">
                Tools
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            {user?.email && (
              <span className="hidden text-[0.8rem] text-[var(--tertiary)] md:block">
                {user.email}
              </span>
            )}
            <SignOutButton className="text-[0.8rem] font-medium text-[var(--accent-hover)] disabled:opacity-50" />
          </div>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
`;
/** app/app/page.tsx */
export const appPage = (ctx) => `import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth/current-user";
import { ensureProfile, getProfile } from "@/lib/users/store";

import { DisplayNameForm } from "./DisplayNameForm";
import { VerifyBanner } from "./VerifyBanner";

// Reads the session cookie and the profile; never prerendered.
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await currentUser();
  // \`proxy.ts\` has already redirected anyone without a session. This is the
  // type narrowing, and a second line of defence if the matcher ever changes.
  if (!user) redirect("/sign-in?next=/app");

  // Retry the provisioning that sign-in attempts and does not block on. Doing
  // it here means a profile whose creation failed — a slow network, a closed
  // tab — repairs itself on the next visit rather than needing support.
  // Idempotent, and skipped for an unverified account because the rules would
  // refuse the write anyway.
  if (user.emailVerified && user.email) {
    try {
      await ensureProfile(user.uid, user.email);
    } catch (error) {
      // Not fatal: the page still renders and the form reports its own
      // failure. Throwing here would replace a usable account with an error.
      console.error("[account] provisioning retry failed", error);
    }
  }

  const profile = await getProfile(user.uid).catch((error) => {
    console.error("[account] reading profile failed", error);
    return null;
  });

  const displayName = profile?.displayName ?? "";

  return (
    <div className="app-shell">
      <div className="app-shell-header">
        {/* The name alone when there is one — "Welcome to Chris" is what
            concatenating a greeting with a name produces, and it reads as a
            bug because it is one. */}
        <h1>{displayName || "Your account"}</h1>
      </div>

      {!user.emailVerified && <VerifyBanner email={user.email} />}

      <section className="app-section">
        <h2>Your name</h2>
        <p>
          What ${ctx.name} calls you. Nothing else uses it yet, and it is never shown to anyone but
          you.
        </p>
        <DisplayNameForm initialName={displayName} canEdit={user.emailVerified} />
      </section>

      <section className="app-section">
        <h2>Sign-in</h2>
        <p>
          You&rsquo;re signed in as {user.email ?? "this account"}. Changing your address
          isn&rsquo;t possible yet — write to us and we&rsquo;ll sort it out.
        </p>
      </section>
    </div>
  );
}
`;
/** app/app/VerifyBanner.tsx */
export const verifyBanner = (ctx) => `"use client";

import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { recoverDeadSession } from "@/lib/auth/session-client";
import { getClientAuth } from "@/lib/firebase/client";


/**
 * Shown to an account whose address Firebase has not confirmed.
 *
 * This exists because the Firestore rules refuse writes from an unverified
 * account, and a rules denial arrives as a generic permission error that reads
 * exactly like a bug. The rules file cannot explain itself to whoever tripped
 * it, so the app has to say it first — that asymmetry is noted in the rules'
 * own comments, and this is the other half of it.
 */
/** How long sign-up's send is worth mentioning; after this it's just stale. */
const RECENT_SEND_MS = 10 * 60 * 1000;

function recentAutomaticSend(): boolean {
  const at = Number(sessionStorage.getItem("${ctx.slug}:verification-sent-at"));
  return Number.isFinite(at) && at > 0 && Date.now() - at < RECENT_SEND_MS;
}

/** sessionStorage is written before this page mounts; no subscription needed. */
function subscribeNoop(): () => void {
  return () => {};
}

export function VerifyBanner({ email }: { email: string | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "working" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  // Whether sign-up's automatic send succeeded in this tab. The banner used to
  // claim "we sent a link" unconditionally (a lie when the send silently
  // failed); then claimed nothing (which read as "nothing was sent" and had
  // the first production user click resend into Firebase's rate limit seconds
  // after a mail was already on its way). Honesty needs the actual outcome,
  // which sign-up records only on a 200.
  // useSyncExternalStore, not an effect: sessionStorage is an external store,
  // the server has no sessionStorage (snapshot: false, so prerender and
  // hydration agree), and the value is written before navigation here.
  const alreadySent = useSyncExternalStore(subscribeNoop, recentAutomaticSend, () => false);
  const reconciled = useRef(false);

  // The verification link is usually opened on another device — mail is read
  // on a phone while the app is open on a laptop. Firebase then knows the
  // address is verified while this browser's httpOnly session cookie still
  // says false, and without this effect the laptop stays locked out of writes
  // for up to fourteen days: the banner renders, the resend mails a link that
  // arrives already superseded, and nothing on the page suggests the actual
  // fix (signing out and back in).
  //
  // So on mount, ask Firebase itself. If it disagrees with the cookie, remint
  // the session from a fresh token and re-render. Silent on failure: the
  // banner it would remove is also the fallback UI.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getClientAuth(), async (user) => {
      if (!user || reconciled.current) return;
      reconciled.current = true;

      try {
        await user.reload();
        if (!user.emailVerified) return;

        const idToken = await user.getIdToken(true);
        const response = await fetch("/api/auth/session/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
        });
        if (response.ok) {
          router.refresh();
        } else if (response.status === 401) {
          // Firebase says verified; the server refuses to remint. The cookie
          // is revoked — a zombie. Walk to sign-in rather than render a page
          // whose banner and buttons will contradict each other.
          await recoverDeadSession("/app/");
        }
      } catch (error) {
        console.error("[account] could not reconcile verification state", error);
      }
    });
    return unsubscribe;
  }, [router]);

  async function resend() {
    if (status === "working") return;

    setStatus("working");
    setMessage(null);

    try {
      // The route reads the address off the session cookie, so this no longer
      // depends on the Firebase client having rehydrated \`currentUser\` — which
      // a reload does not guarantee, and which used to make a resend fail on a
      // perfectly valid session.
      const response = await fetch("/api/account/verify-email/", { method: "POST" });

      if (response.status === 401) {
        // The page rendered but the API says not signed in: a revoked cookie.
        // "Not signed in" under a header showing the email is a contradiction,
        // not an error message — recover instead of displaying it.
        await recoverDeadSession("/app/");
        return;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setStatus("error");
        setMessage(body.error ?? "Could not send the confirmation. Try again shortly.");
        return;
      }

      setStatus("sent");
    } catch (error) {
      console.error("[account] resend verification failed", error);
      setStatus("error");
      setMessage("Could not reach the server. Check your connection.");
    }
  }

  return (
    <div className="app-verify-banner">
      <strong>Confirm your email</strong>
      {/* Deliberately does not claim a link was sent. The sign-up send is
          fire-and-forget and can fail silently — on a deployment with no mail
          key it always does — so this states only what is known to be true and
          offers the resend, whose own request does report failure. */}
      <p>
        {alreadySent
          ? \`We sent a link\${email ? \` to \${email}\` : ""}. It can take a minute to arrive — check spam the first time.\`
          : email
            ? \`\${email} isn't confirmed yet. Until it is, your name and settings can't be saved.\`
            : "Until your address is confirmed, your name and settings can't be saved."}
      </p>

      {status === "sent" ? (
        <p role="status" className="auth-hint">
          Sent. Check your inbox, and your spam folder.
        </p>
      ) : (
        <button type="button" onClick={resend} disabled={status === "working"}>
          {status === "working" ? "Sending…" : alreadySent ? "Send it again" : "Email me a confirmation link"}
        </button>
      )}

      {message && (
        <p role="alert" className="auth-hint">
          {message}
        </p>
      )}
    </div>
  );
}
`;
/** app/app/DisplayNameForm.tsx */
export const displayNameForm = (ctx) => `"use client";

import { useId, useState } from "react";

import { DISPLAY_NAME_MAX_LENGTH, normalizeDisplayName } from "${ctx.scope}/shared/schema/user";

import { recoverDeadSession } from "@/lib/auth/session-client";

type Status = "idle" | "working" | "saved" | "error";

/**
 * The one thing an account currently does.
 *
 * Writes through \`/api/account/\`, not the browser's Firestore SDK — the session
 * cookie is already the session of record, and a second one would split the
 * truth. The rules would permit the direct write; the route is the deliberate
 * choice.
 */
export function DisplayNameForm({
  initialName,
  canEdit,
}: {
  initialName: string;
  canEdit: boolean;
}) {
  const fieldId = useId();
  const [name, setName] = useState(initialName);
  const [saved, setSaved] = useState(initialName);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const working = status === "working";
  const dirty = normalizeDisplayName(name) !== saved;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (working || !canEdit) return;

    // Normalised before sending so what is shown and what is stored agree —
    // the route normalises identically, using the same shared function.
    const displayName = normalizeDisplayName(name);

    setStatus("working");
    setMessage(null);

    try {
      const response = await fetch("/api/account/", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });

      if (response.status === 401) {
        // A revoked-but-rendering session; see recoverDeadSession.
        await recoverDeadSession("/app/");
        return;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setStatus("error");
        setMessage(body.error ?? "Could not save your name. Try again.");
        return;
      }

      // Reflect what the server stored, not what was typed.
      const body = (await response.json()) as { displayName?: string };
      const stored = body.displayName ?? displayName;
      setName(stored);
      setSaved(stored);
      setStatus("saved");
    } catch (error) {
      console.error("[account] saving display name failed", error);
      setStatus("error");
      setMessage("Could not reach the server. Check your connection.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form" noValidate>
      <div className="auth-field">
        <label htmlFor={fieldId}>Display name</label>
        <input
          id={fieldId}
          type="text"
          name="displayName"
          autoComplete="name"
          placeholder="What should we call you?"
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (status !== "idle") setStatus("idle");
          }}
          readOnly={working || !canEdit}
          // \`readOnly\` alone is the trap this comment exists to prevent: the
          // field focuses normally and silently eats keystrokes, which reads as
          // a broken page, not a locked one. Found by Chris typing into it.
          // \`aria-disabled\` gives the state a hook for styling and for
          // assistive tech, and the hint below says what unlocks it.
          aria-disabled={!canEdit || undefined}
          aria-invalid={status === "error" ? true : undefined}
          aria-describedby={\`\${fieldId}-hint\`}
        />
        <p id={\`\${fieldId}-hint\`} className="auth-hint">
          {canEdit
            ? \`Up to \${DISPLAY_NAME_MAX_LENGTH} characters. Leave it empty to remove it.\`
            : "Locked until your email is confirmed — use the banner above."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={working || !dirty || !canEdit} className="button">
          {working ? "Saving…" : "Save"}
        </button>
        {status === "saved" && !dirty && (
          <p role="status" className="auth-hint">
            Saved.
          </p>
        )}
      </div>

      {message && (
        <p role="alert" className="auth-message">
          {message}
        </p>
      )}
    </form>
  );
}
`;
/** app/NavAuth.tsx */
export const navAuth = (ctx) => `"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { SIGNED_IN_HINT_COOKIE_NAME } from "@/lib/firebase/config";

/**
 * Sign in / Sign up, or Dashboard — decided in the browser, deliberately.
 *
 * The obvious implementation reads the session cookie in \`Navbar\`, which is a
 * server component. It also calls \`cookies()\`, which opts the entire root
 * layout into dynamic rendering — and with it every content page on the
 * site. Those pages are statically prerendered today, and trading that away
 * for a header button is a bad deal.
 *
 * So the state is read client-side from \`${ctx.slug}_signed_in\`, a companion cookie set
 * and cleared alongside the session. It is readable by script by design and
 * carries nothing else: no uid, no email, no role. Forging it changes which
 * button is drawn and authorises nothing — every real decision is made against
 * the httpOnly session cookie, at the edge, in \`proxy.ts\`.
 *
 * \`useSyncExternalStore\` rather than an effect: it is the hook built for state
 * that lives outside React, and it takes a separate server snapshot, which is
 * exactly the split needed here. The prerendered HTML has no cookies to read,
 * so the server snapshot is "not known yet" and the markup matches on both
 * sides without a hydration mismatch.
 */
function hasSignedInHint(): boolean {
  return document.cookie
    .split(";")
    .some((part) => part.trim().startsWith(\`\${SIGNED_IN_HINT_COOKIE_NAME}=1\`));
}

/**
 * The cookie changes in another tab when someone signs in or out there.
 * Re-reading on focus keeps two open tabs from disagreeing indefinitely.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("focus", onChange);
  return () => window.removeEventListener("focus", onChange);
}

/**
 * \`null\` is "not known yet", distinct from false. Returned while prerendering
 * and during hydration so the header renders nothing rather than showing
 * "Sign in" to someone who is signed in and swapping it a frame later.
 */
function serverSnapshot(): boolean | null {
  return null;
}

export function NavAuth() {
  const signedIn = useSyncExternalStore<boolean | null>(
    subscribe,
    hasSignedInHint,
    serverSnapshot,
  );

  // Reserves the row's height so the nav does not shift when this resolves.
  if (signedIn === null) return <span className="nav-auth" aria-hidden="true" />;

  if (signedIn) {
    return (
      <div className="nav-auth">
        <Link href="/app" className="button button-small">
          Dashboard <span aria-hidden="true">↗</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="nav-auth">
      <Link href="/sign-in" className="nav-auth-link">
        Sign in
      </Link>
      <Link href="/sign-up" className="button button-small">
        Sign up <span aria-hidden="true">↗</span>
      </Link>
    </div>
  );
}
`;
/** app/hq/SignOutButton.tsx */
export const signOutButton = (ctx) => `"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { endSession } from "@/lib/auth/session-client";

export function SignOutButton({ className }: { className?: string } = {}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);

  async function handleSignOut() {
    setWorking(true);
    // \`endSession\` drops the server session before the client one. Order is
    // load-bearing: signing out of Firebase first leaves a window where the
    // cookie is still valid and the UI already believes it is gone.
    await endSession();
    router.replace("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={working}
      className={className ?? "text-xs uppercase tracking-widest opacity-70 disabled:opacity-40"}
    >
      {working ? "Signing out…" : "Sign out"}
    </button>
  );
}
`;
/** proxy.ts */
export const routeGate = (ctx) => `import { NextResponse, type NextRequest } from "next/server";

import { canAccessHq } from "@/lib/auth/roles";
import { verifySessionCookie } from "@/lib/auth/session-cookie";
import { PROJECT_ID, SESSION_COOKIE_NAME } from "@/lib/firebase/config";

/**
 * Gates the two signed-in surfaces, which need different questions asked.
 *
 * \`/hq\` is internal and authorises on the \`role\` custom claim — the same claim
 * Firestore rules read. \`/app\` is the consumer product, where the correct role
 * is *no role at all*: someone who signed themselves up holds none, so
 * \`canAccessHq()\` is false for every legitimate user of it.
 *
 * That asymmetry is why this is two branches rather than one matcher with one
 * check. Extending the old \`/hq\` rule to cover \`/app\` would have compiled,
 * deployed, and rewritten every consumer to a 403 explainer page on the only
 * page they are entitled to.
 *
 * The cookie is verified here rather than merely checked for presence, so an
 * expired or forged cookie is rejected at the edge.
 *
 * \`proxy.ts\`, not \`middleware.ts\`: Next 16 renamed the convention and warns on
 * the old name at build time.
 */
export default async function proxy(request: NextRequest) {
  const claims = await verifySessionCookie(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
    PROJECT_ID,
  );

  const isHq = request.nextUrl.pathname.startsWith("/hq");

  // \`/hq\` answers 404 to everyone without a role — never a sign-in wall, never
  // an explanation. The previous behavior rewrote unauthorized-but-signed-in
  // users to a page saying access is allowlist-gated and naming the internal
  // tooling that gates it. That copy was written when everyone who could
  // possibly be signed in was on the team; consumer accounts ended the
  // premise, and the first consumer who typed /hq was shown a description of
  // the company's internal admin surface. An internal route on a consumer
  // product should be indistinguishable from a route that does not exist.
  //
  // The cost lands only on the team: a signed-out team member gets the same
  // 404 and signs in at /sign-in first, by knowing to — which is the point.
  // The rewrite targets a path with no route, so Next renders its 404 page;
  // the explicit status keeps the response honest to crawlers and curl alike.
  if (isHq && (!claims || !canAccessHq(claims.role))) {
    return NextResponse.rewrite(new URL("/hq-does-not-exist", request.url), { status: 404 });
  }

  if (!claims) {
    // /app, signed out: the consumer product's ordinary front door.
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(signIn);
  }

  // Authentication is all \`/app\` requires. Email verification deliberately is
  // not checked here: an unverified user may reach the app and be asked to
  // confirm, but may not write — a rule the Firestore rules enforce and the UI
  // explains. Blocking at the edge would strand them on a page that cannot
  // tell them why.
  return NextResponse.next();
}

export const config = {
  // \`/app(/.*)?\` rather than \`/app/:path*\` so the bare \`/app\` and the
  // trailing-slash \`/app/\` that \`trailingSlash: true\` canonicalises to are both
  // covered — an unmatched root would leave the surface's own front door
  // ungated while every page under it was protected.
  matcher: ["/hq(/.*)?", "/app(/.*)?"],
};
`;
//# sourceMappingURL=templates-app.js.map