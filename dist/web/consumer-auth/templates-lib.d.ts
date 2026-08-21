/**
 * Consumer-auth library templates — Layer A of cpheinrich/morpheus#135.
 *
 * Every function below is Evo's actual file (darwin-health/evo#58, #62) with
 * project-specific values lifted into `ConsumerAuthContext`. Rendering with
 * Evo's own values reproduces Evo's files byte-for-byte, and that property is
 * the review contract for edits here: change a template only the way you would
 * change the running code it was extracted from.
 *
 * GENERATED-THEN-CURATED: produced by transcribing the Evo sources, then
 * hand-edited only where a comment stated an Evo-only fact. Do not regenerate
 * blindly.
 */
import type { ConsumerAuthContext as Ctx } from "./context.js";
/** lib/firebase/config.ts */
export declare const libFirebaseConfig: (ctx: Ctx) => string;
/** lib/firebase/admin.ts */
export declare const libFirebaseAdmin: (ctx: Ctx) => string;
/** lib/firebase/client.ts */
export declare const libFirebaseClient: (ctx: Ctx) => string;
/** lib/firebase/emulator.ts */
export declare const libFirebaseEmulator: (ctx: Ctx) => string;
/** lib/auth/roles.ts */
export declare const libAuthRoles: (ctx: Ctx) => string;
/** lib/auth/session-cookie.ts */
export declare const libAuthSessionCookie: (ctx: Ctx) => string;
/** lib/auth/current-user.ts */
export declare const libAuthCurrentUser: (ctx: Ctx) => string;
/** lib/auth/writing-user.ts */
export declare const libAuthWritingUser: (ctx: Ctx) => string;
/** lib/auth/request-origin.ts */
export declare const libAuthRequestOrigin: (ctx: Ctx) => string;
/** lib/auth/safe-next.ts */
export declare const libAuthSafeNext: (ctx: Ctx) => string;
/** lib/auth/action-link.ts */
export declare const libAuthActionLink: (ctx: Ctx) => string;
/** lib/auth/send-action-email.ts */
export declare const libAuthSendActionEmail: (ctx: Ctx) => string;
/** lib/auth/session-client.ts */
export declare const libAuthSessionClient: (ctx: Ctx) => string;
/** lib/auth/errors.ts */
export declare const libAuthErrors: (ctx: Ctx) => string;
/** lib/email/send.ts */
export declare const libEmailSend: (ctx: Ctx) => string;
/** lib/email/templates.ts */
export declare const libEmailTemplates: (ctx: Ctx) => string;
/** lib/users/decode.ts */
export declare const libUsersDecode: (ctx: Ctx) => string;
/** lib/users/store.ts */
export declare const libUsersStore: (ctx: Ctx) => string;
/** packages/shared/schema/user.ts */
export declare const sharedUserSchema: (ctx: Ctx) => string;
