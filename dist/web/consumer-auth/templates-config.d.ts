/**
 * Configuration files and the starter stylesheet for consumer auth.
 *
 * Unlike templates-lib.ts these are not byte-faithful lifts from Evo: the
 * stylesheet is a neutral starter (Evo's is written in its own brand tokens,
 * which would render as nothing in any other project), and the config files
 * are the minimal shapes the suites need. Deltas from Evo are noted inline.
 */
import type { ConsumerAuthContext as Ctx } from "./context.js";
/**
 * `.firebaserc` — with **no `default` alias, deliberately**. `firebase deploy`
 * with no `--project` uses the default alias, so leaving one out means a stray
 * deploy fails asking which project rather than silently picking production.
 */
export declare const firebaserc: (ctx: Ctx) => string;
/**
 * The emulators block merged into `firebase.json`.
 *
 * Ports are pinned (auth 9099, firestore 8080) rather than left to the CLI's
 * defaults, because the rules suite configures a literal host and port and a
 * default that moved would make it *hang* rather than fail. `singleProjectMode`
 * is off because the rules suite uses its own project id on purpose.
 * `127.0.0.1` rather than `localhost` on the listening side, matching the
 * dialling side in `lib/firebase/emulator.ts` — a machine that resolves
 * `localhost` to `::1` first otherwise misses an IPv4-bound emulator.
 */
export declare const EMULATORS_BLOCK: {
    readonly auth: {
        readonly host: "127.0.0.1";
        readonly port: 9099;
    };
    readonly firestore: {
        readonly host: "127.0.0.1";
        readonly port: 8080;
    };
    readonly ui: {
        readonly enabled: true;
        readonly port: 4000;
    };
    readonly singleProjectMode: false;
};
/**
 * A whole `firebase.json`, for a project that has none yet. The Google
 * sign-in provider block that `morpheus firebase auth setup` writes is
 * deliberately absent — that command owns it.
 */
export declare const firebaseJson: (rulesPath: string) => string;
/** The thin CI delegator, calling the reusable workflow beside web-ci's. */
export declare const ciCaller: () => string;
/**
 * A neutral starter stylesheet for the scaffolded auth surfaces.
 *
 * The generated pages use a small class vocabulary (`auth-shell`,
 * `auth-field`, `app-section`, …) rather than raw utilities, so restyling is
 * editing this one file instead of nineteen components. The values here are
 * deliberately plain — system fonts, grays, one accent — because the kit
 * generates primitives and each project owns its vocabulary (§12.1): a
 * template written in one project's semantic tokens renders as nothing in
 * every other project, and looks finished while doing it.
 *
 * The custom properties at the top exist so a project with a real token
 * system can restyle by mapping them; delete the fallback values once the
 * project's own tokens define them.
 */
export declare const consumerAuthCss: () => string;
