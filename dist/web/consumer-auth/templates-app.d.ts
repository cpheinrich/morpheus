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
import type { ConsumerAuthContext as Ctx } from "./context.js";
/** app/api/auth/session/route.ts */
export declare const apiAuthSessionRoute: (ctx: Ctx) => string;
/** app/api/auth/reset-password/route.ts */
export declare const apiResetPasswordRoute: (ctx: Ctx) => string;
/** app/api/account/route.ts */
export declare const apiAccountRoute: (ctx: Ctx) => string;
/** app/api/account/verify-email/route.ts */
export declare const apiVerifyEmailRoute: (ctx: Ctx) => string;
/** app/sign-in/page.tsx */
export declare const signInPage: (ctx: Ctx) => string;
/** app/sign-in/SignInForm.tsx */
export declare const signInForm: (ctx: Ctx) => string;
/** app/sign-in/GoogleButton.tsx */
export declare const googleButton: (ctx: Ctx) => string;
/** app/sign-up/page.tsx */
export declare const signUpPage: (ctx: Ctx) => string;
/** app/sign-up/SignUpForm.tsx */
export declare const signUpForm: (ctx: Ctx) => string;
/** app/reset-password/page.tsx */
export declare const resetPasswordPage: (ctx: Ctx) => string;
/** app/reset-password/ResetPasswordForm.tsx */
export declare const resetPasswordForm: (ctx: Ctx) => string;
/** app/auth/action/page.tsx */
export declare const authActionPage: (ctx: Ctx) => string;
/** app/auth/action/ActionHandler.tsx */
export declare const authActionHandler: (ctx: Ctx) => string;
/** app/app/layout.tsx */
export declare const appLayout: (ctx: Ctx) => string;
/** app/app/page.tsx */
export declare const appPage: (ctx: Ctx) => string;
/** app/app/VerifyBanner.tsx */
export declare const verifyBanner: (ctx: Ctx) => string;
/** app/app/DisplayNameForm.tsx */
export declare const displayNameForm: (ctx: Ctx) => string;
/** app/NavAuth.tsx */
export declare const navAuth: (ctx: Ctx) => string;
/** app/hq/SignOutButton.tsx */
export declare const signOutButton: (ctx: Ctx) => string;
/** proxy.ts */
export declare const routeGate: (ctx: Ctx) => string;
