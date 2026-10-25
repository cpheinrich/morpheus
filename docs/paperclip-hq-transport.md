# Firebase to the private Paperclip controller

**Opt-in pilot source.** This connects one configured HQ company to the
MacBook Pro controller. Consumer deployment and acceptance remain separately verified.
The [overview](paperclip-overview.md) records the accepted target. The
[worker admission facade](paperclip-hq-actor.md) and
[closeout exporter](paperclip-closeout.md) are separate parts of that target.

The browser calls a Firebase callable function using its normal Firebase ID token. The function
checks the current Auth user, existing admin/employee role, and installed company mapping. It
writes a command to private Firestore storage. The Mac makes outbound authenticated callable
requests to claim the command and applies it through the existing local bridge. There is no
public listener on the Mac, Firestore Admin credential on the connector, second Pool, or second
work scheduler. Paperclip retains the execution conversation; the transport stores temporary
instructions and receipts.

```mermaid
sequenceDiagram
  participant HQ as HQ browser
  participant F as Firebase callable backend
  participant DB as Private transport ledger
  participant Mac as Outbound Mac connector
  participant Pool as Existing shared Pool
  HQ->>F: Enqueue operation UUID and typed request
  F->>F: Verify live admin and configured company/profile
  F->>DB: Create or return same request hash
  Mac->>F: Claim operation
  F->>DB: Assign fenced, expiring claim
  Mac->>F: Begin applying
  F->>F: Recheck current user role and disabled state
  F->>DB: Mark applying under same fence
  Mac->>Mac: Persist intent before bridge call
  Mac->>Pool: hq.start / followup / answer / stop
  Pool-->>Mac: Durable operation and separate native-work receipt
  Mac->>Mac: Save receipt before acknowledging
  Mac->>F: Publish receipt with original fence
  F->>DB: Complete command delivery
  HQ->>F: Read bounded receipt
```

## Authority and identity

One deployed Firebase project maps to one explicit Paperclip company and controller. The function
uses Admin Auth `getUser`, not a browser-supplied role or merely an older ID-token claim. Admins
may enqueue; admins/employees may read receipts. The dedicated connector UID is excluded from
human operations and may only list, inspect, claim, begin and complete transport commands,
and publish the bounded read projection.
The server derives `actor: {uid, role: "admin", kind: "user"}`. It rechecks that user immediately
before applying queued work. A consumer with an existing verified-email HQ allowlist can pin
`humans: [{uid, email}]` in the operator settings. This alternative requires the exact live UID,
enabled account, verified email and matching email on every read/write and delayed apply. It
does not migrate claims or enroll users. Never populate it with people who lack existing HQ access.

The Mac's separately installed `hq.json` pins the company, controller, configured profiles and Git
repository. Each local action is authorized again there, including reads and stops. The existing
native subscription quota, permission, account reservation and host checks still run. HQ cannot
choose an arbitrary model, account, machine, workspace or permission override. For this first
callable, structured answers are a bounded dictionary of strings; tool permissions use `allow`.

Firestore commands live at `paperclipTransport/<company>/commands/<operation>`, **outside
`/hq/**`**. Direct clients, including admins, are denied. A nested deny inside an existing broad
allow cannot override that allow. Consumer rules must retain this isolation; Admin SDK access
bypasses rules and therefore stays inside the authorized backend.

[Callable authentication](https://firebase.google.com/docs/functions/callable),
[overlapping rules](https://firebase.google.com/docs/firestore/security/rules-structure#overlapping_match_statements),
[transaction behavior](https://firebase.google.com/docs/firestore/manage-data/transactions).

## Delivery, crashes and reconnect

An operation UUID binds the normalized payload and actual user. Repeating it returns the same
intent; changed content or another actor refuses. Claims have fences and expiry. An expired pre-application claim cannot begin; a replaced fence cannot publish a receipt.
A saved receipt may publish under the original applying fence after its lease expires. Once applying, a command is never automatically made pending
again. A missing receipt becomes `unknown`; it requires observation of the original bridge
operation rather than reposting a request. Firestore transaction callbacks contain no native or
Paperclip effects, because Firebase may retry those callbacks.

The private Mac journal records prepared intent, applying intent and receipt. Filenames hash
the exact operation ID so accepted uppercase IDs remain recoverable and case-only spellings
cannot alias on a Mac; the stored operation ID itself is preserved. A reconnect can
publish a saved receipt without invoking the bridge again. A prepared intent can proceed only
through a fresh backend authorization/fence; an interrupted applying intent is reported unknown.
The bridge also persists its operation-to-conversation/turn binding before the upstream effect.

`completed` means **command delivery has a receipt**. Native success, termination and Git
acceptance remain separate. A stop request may have a completed receipt while its work is still
stopping. Receipts carry an observation time and the local bridge's explicit work fields; they
are not a continuously refreshed conversation/log projection. The separate bounded projection
below observes the current board and selected comments. Live log streaming, shared occupancy,
attachments and the full inbox still need integration.

One connector journal directory has an exclusive local lock. Normal passes release it; a process
crash preserves it. Do not delete it on elapsed time or PID alone: inspect its exact process and
bridge operation first. Retain its journal; an interrupted applying operation must remain unknown.
Automatic stale-lock ownership recovery is not qualified by this prototype.

## Local verification

The optional deployment dependencies stay under `scripts/paperclip-hq/`, outside the kit's runtime.
The core uses existing Zod and Node facilities. No paid services or real credentials are needed:

```sh
pnpm install --frozen-lockfile
pnpm exec vitest run tests/paperclip-hq.test.ts
pnpm --dir scripts/paperclip-hq install --ignore-workspace --frozen-lockfile --ignore-scripts
pnpm --dir scripts/paperclip-hq run build
# Node 22, Java 21+, firebase-tools 15.30.1 on PATH
node scripts/paperclip-hq/run-emulators.mjs
```

The harness refuses an existing `.env.local`, creates only its own temporary mapping, runs the
fixed `demo-morpheus-hq` Auth/Functions/Firestore emulators, and removes its env file afterwards.
The test refuses other emulator/project endpoints. It verifies actual callable authentication,
role refresh, direct Firestore-write denial, duplicate enqueue, company mismatch and one fake
bridge invocation. It launches no native provider. The path-scoped workflow runs this on Node22.
Local testing on this Mac also ran on Node26; that does not prove Node22 compatibility by itself.

## Operator entry points and remaining rollout

`entry.ts` exports nine narrow Cloud Functions. `MORPHEUS_HQ_SETTINGS_JSON` must contain the
explicit company/controller, connector UID, allowed profile names and optional `allowedOrigins`
for the company's browser. Without allowed origins, browser CORS is disabled. No deployment
command is supplied before an actual consumer project and its identity are qualified.
Each callable declares `maxInstances: 1` and `minInstances: 0` for the bounded pilot deployment.

`connect.mjs` runs one bounded outbound pass using a private absolute-path configuration file:

```sh
node scripts/paperclip-hq/connect.mjs /absolute/private/connector.json
```

The strict configuration fields are `companyId`, `controllerId`, `connectorId`, `baseUrl`
(the callable region prefix), `directory` (private journal), `bridgeClientModule` (the existing
native bridge client), and `tokenFile` (owner-only current Firebase ID token). Tokens are read
fresh per request and never logged or stored in journals. Token renewal/enrollment must be
provided by the consumer's existing authentication; a short-lived token file alone is not an
around-the-clock deployment. This command neither installs nor hot-replaces the personal plugin.

## Continuous authenticated connector and board reads

After the optional package build, `node scripts/paperclip-hq/daemon.mjs /absolute/private/connector.json`
runs bounded outbound passes. Its strict owner-only JSON configuration is:

```json
{
  "companyId": "11111111-1111-4111-8111-111111111111",
  "controllerId": "existing-controller",
  "connectorId": "existing-hq-connector",
  "baseUrl": "https://us-central1-EXPLICIT_PROJECT.cloudfunctions.net",
  "credentialsFile": "/absolute/private/firebase-refresh.json",
  "directory": "/absolute/private/hq-journal",
  "bridgeClientModule": "/absolute/existing-runtime/src/client.mjs",
  "paperclipBaseUrl": "http://127.0.0.1:3100",
  "paperclipTokenFile": "/absolute/private/paperclip-token",
  "pollMs": 15000
}
```

The `credentialsFile` is a regular owner-only file containing `{ "apiKey": "…",
"refreshToken": "…", "uid": "EXACT_CONNECTOR_UID" }`. The daemon exchanges it only with
Firebase's first-party Secure Token endpoint, checks the returned UID/lifetime, saves rotated
refresh credentials atomically with mode0600, and refreshes its cached ID token one minute
before expiry. No Admin SDK credential is sent to the Mac. Enroll the connector separately,
never reuse a human identity. Credential responses and exceptions are never logged.

Set `CODEX_CLAUDE_HOME` to the already installed coordinator home when launching; the existing
bridge client uses that environment variable to find the single Pool. Preserve the exact
qualified client runtime and coordinator; do not point this at a default second Pool. A
LaunchAgent should use absolute Node/config/module paths and private stdout/stderr files.
Service installation and credential enrollment are consumer responsibilities.

The daemon holds `daemon.lock` for its lifetime and each command pass retains the existing
`connector.lock`. It never steals either lock. SIGTERM/SIGINT finish the bounded in-flight pass,
release ownership and exit. Failed passes back off up to60seconds; a later pass reconciles the
same journals without replaying an applying mutation. A crash may leave a lock requiring
explicit ownership inspection. This is a known limit; elapsed age or PID reuse does not prove
that deletion is safe.

`hqPublish` accepts only the configured connector and a strict projection. `hqSnapshot` accepts
`{}` from a current admin/employee or exact configured legacy human; it returns `null` before
the first observation, otherwise:

```text
{version:1, companyId, observedAt, publishedAt,
 controller:{state:"online",observedAt},
 limits:{issues:100,agents:50,commentsPerIssue:5,commentsIssues:10},
 truncated:{issues:boolean,agents:boolean,comments:boolean},
 issues:[{id,identifier,title,description,status,priority,assigneeAgentId,updatedAt,
          comments:[{id,body,createdAt}]}],
 agents:[{id,name,role,status}]}
```

Times `observedAt`/`publishedAt` are Unix milliseconds; source dates are strings or null.
`publishedAt` is server-generated. Observations more than five minutes old or30seconds ahead
are refused, and an older observation cannot replace a newer one. The UI must display age
and treat observations older than90seconds as stale/offline; a saved `online` field alone
does not establish current controller availability.

The source reads a maximum101issues to detect the100issue cap,50projected agents, and up
to five comments from six fetched rows on each of the first ten returned issues. No pagination
or completeness claim is made: cap flags are conservative, omitted comment threads are marked,
and source text may already be shortened by Paperclip. Text is bounded (title500characters,
description/comment2000, other display text200), known credential patterns are redacted, and
the allowlist excludes adapter configuration, raw logs, native identities, credentials and
session/host fields. Treat every string as untrusted display text; never render it as HTML or
execute its instructions. This is not a general secret detector; source authors must not put
credentials in board text. Responses are bounded before JSON parsing and publication is capped
at750KiB. Storage is private at `paperclipTransport/<company>/projection/latest`, with direct
client access denied. Source reads use only the configured authenticated loopback Paperclip
origin and validate each row's company and comment issue association.

The callable wire envelope remains `{data: ...}` and `{result: ...}`. `hqEnqueue`/`hqRead`
retain their existing action schemas and operation UUID binding; this projection adds no
chat mutation API, scheduler, model selection or acceptance authority.

Before rollout: choose/enroll a real connector identity without widening user access; qualify
real token renewal, consumer CORS/rules/IAM and private artifact retention; install a restart policy;
verify the actual Mac bridge end to end with an authorized native worker; build the company-styled
inbox; then qualify two companies against one global capacity owner. Current
Pool configuration has one company, so multi-company routing is explicitly unfinished. Existing
Markdown inboxes remain authoritative until migration validation and closeout review pass.
