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
export const firebaserc = (ctx: Ctx): string => `{
  "projects": {
    "prod": "${ctx.production.projectId}",
    "staging": "${ctx.staging.projectId}"
  }
}
`;

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
export const EMULATORS_BLOCK = {
  auth: { host: "127.0.0.1", port: 9099 },
  firestore: { host: "127.0.0.1", port: 8080 },
  ui: { enabled: true, port: 4000 },
  singleProjectMode: false,
} as const;

/**
 * A whole `firebase.json`, for a project that has none yet. The Google
 * sign-in provider block that `morpheus firebase auth setup` writes is
 * deliberately absent — that command owns it.
 */
export const firebaseJson = (rulesPath: string): string =>
  `${JSON.stringify({ firestore: { rules: rulesPath }, emulators: EMULATORS_BLOCK }, null, 2)}\n`;

/** The thin CI delegator, calling the reusable workflow beside web-ci's. */
export const ciCaller = (): string => `name: Firebase tests

# Delegates to Morpheus's reusable workflow: emulator-backed unit and rules
# tests, then Playwright over the emulators. No secrets — the emulators
# authenticate nobody, so this passes identically on a fork pull request.
#
# Deliberately beside ci.yml rather than inside it: web-ci.yml stays free of
# Firebase so projects without one pay nothing for it.

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

# The reusable workflow carries per-job concurrency, but a caller-level group
# cancels the whole superseded run at once — two pushes minutes apart must not
# leave two runs racing.
concurrency:
  group: firebase-tests-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  firebase:
    uses: cpheinrich/morpheus/.github/workflows/firebase-tests.yml@main
`;

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
export const consumerAuthCss = (): string => `/*
 * Consumer-auth starter styles — scaffolded by \`morpheus web add-consumer-auth\`.
 * Owned by the project from here on: restyle freely, and map the custom
 * properties below onto the project's design tokens.
 */

:root {
  --auth-ink: #1a1a1a;
  --auth-secondary: #4a4a4a;
  --auth-tertiary: #767676;
  --auth-border: #d9d9d9;
  --auth-surface: #ffffff;
  --auth-accent: #1f6feb;
  --auth-on-accent: #ffffff;
  --auth-danger: #b3261e;
}

.auth-shell {
  max-width: 26rem;
  margin: 0 auto;
  padding: 4rem 1.25rem 6rem;
  display: grid;
  gap: 2rem;
}

.auth-header {
  display: grid;
  gap: 0.5rem;
}

.auth-header h1 {
  font-size: 1.75rem;
  line-height: 1.15;
  color: var(--auth-ink);
}

.auth-header p {
  color: var(--auth-secondary);
  font-size: 0.9rem;
  line-height: 1.6;
}

.auth-header .eyebrow {
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--auth-tertiary);
}

.auth-form {
  display: grid;
  gap: 1.25rem;
}

.auth-field {
  display: grid;
  gap: 0.4rem;
}

.auth-field label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--auth-ink);
}

.auth-field input {
  border: 1px solid var(--auth-border);
  border-radius: 0.5rem;
  background: var(--auth-surface);
  color: var(--auth-ink);
  padding: 0.65rem 0.8rem;
  font-size: 0.95rem;
}

.auth-field input::placeholder {
  color: var(--auth-tertiary);
}

.auth-field input:focus-visible {
  outline: 2px solid var(--auth-accent);
  outline-offset: 1px;
}

.auth-field input:read-only {
  opacity: 0.7;
}

.auth-field input[aria-invalid="true"] {
  border-color: var(--auth-danger);
}

.auth-hint {
  font-size: 0.78rem;
  color: var(--auth-tertiary);
  line-height: 1.5;
}

.auth-message {
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--auth-danger);
}

.auth-message-info {
  color: var(--auth-secondary);
}

.auth-divider {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--auth-tertiary);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.auth-divider::before,
.auth-divider::after {
  content: "";
  flex: 1;
  border-top: 1px solid var(--auth-border);
}

.auth-provider {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  border: 1px solid var(--auth-border);
  border-radius: 999px;
  background: var(--auth-surface);
  color: var(--auth-ink);
  padding: 0.65rem 1.25rem;
  font-size: 0.9rem;
  font-weight: 600;
}

.auth-provider:hover {
  border-color: var(--auth-tertiary);
}

.auth-provider:disabled {
  opacity: 0.55;
}

.auth-footnote {
  font-size: 0.82rem;
  color: var(--auth-secondary);
}

.auth-shell .button,
.auth-form .button,
.app-shell .button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--auth-accent);
  color: var(--auth-on-accent);
  padding: 0.65rem 1.5rem;
  font-size: 0.9rem;
  font-weight: 600;
}

.auth-shell .button:disabled,
.auth-form .button:disabled,
.app-shell .button:disabled {
  opacity: 0.55;
}

.text-link {
  color: var(--auth-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* --- the signed-in shell -------------------------------------------------- */

.app-shell {
  max-width: 56rem;
  margin: 0 auto;
  padding: 3rem 1.25rem 6rem;
  display: grid;
  gap: 2.5rem;
}

.app-shell-header h1 {
  font-size: 1.6rem;
  line-height: 1.2;
  color: var(--auth-ink);
}

.app-section {
  display: grid;
  gap: 0.75rem;
}

.app-section h2 {
  font-size: 1.05rem;
  color: var(--auth-ink);
}

.app-section > p {
  font-size: 0.88rem;
  color: var(--auth-secondary);
  line-height: 1.6;
  max-width: 42rem;
}

.app-verify-banner {
  display: grid;
  gap: 0.5rem;
  border: 1px solid var(--auth-border);
  border-left: 3px solid var(--auth-accent);
  border-radius: 0.5rem;
  padding: 1rem 1.25rem;
  font-size: 0.85rem;
  color: var(--auth-secondary);
}

.app-verify-banner strong {
  color: var(--auth-ink);
}

.app-verify-banner button {
  justify-self: start;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--auth-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.wordmark {
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--auth-ink);
}

/* --- the marketing-header slot -------------------------------------------- */

.nav-auth {
  display: inline-flex;
  align-items: center;
  gap: 1rem;
  min-height: 2rem;
}

.nav-auth-link {
  font-size: 0.85rem;
  color: var(--auth-secondary);
}

.nav-auth .button-small {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border-radius: 999px;
  background: var(--auth-accent);
  color: var(--auth-on-accent);
  padding: 0.4rem 0.9rem;
  font-size: 0.8rem;
  font-weight: 600;
}
`;
