/**
 * The files `morpheus web init` writes.
 *
 * Every template here was extracted from a working surface rather than
 * designed: the waitlist from Darwin's `feat(web): capture waitlist emails`
 * (darwin-health/darwin#35), the `/hq` gate from DW-002, which Chris verified
 * renders `chris@darwin.health · admin`. That is the same rule the repository
 * scaffold followed — *the retrofit is the specification* — and it is why the
 * comments explaining a decision travel with the code instead of being
 * summarised away.
 *
 * **Styling is deliberately neutral.** Generated components use Tailwind core
 * utilities and nothing from a project's semantic layer: `border`, not
 * `border-line`. The kit generates primitives and each project owns its
 * vocabulary (§12.1), so a template that reached for `text-ink` would render
 * unstyled in every project that names its tokens differently — and would look
 * finished while doing it.
 */
// ---------------------------------------------------------------- waitlist ---
export const waitlistSchema = () => `/**
 * Canonical shape of a waitlist signup.
 *
 * Provider-neutral, like \`schema/analytics.ts\`. Firestore is where the records
 * happen to live today; this file says what a record *is*, so an export, a CRM
 * sync, or a second surface writes the same fields under the same names rather
 * than each inventing its own.
 *
 * The stored record is deliberately narrow. It holds the address, where the
 * person was standing when they gave it, and nothing that would make the
 * collection worth stealing for anything but the addresses themselves.
 */

export const WAITLIST_COLLECTION = "waitlist";

export const WAITLIST_SCHEMA_VERSION = 1 as const;

/**
 * Which call to action produced the signup. A closed set rather than free text:
 * it is the only field a form controls, so anything the browser can put here
 * must be a value we already recognise. Add a placement here before shipping a
 * form that sends it.
 */
export const WAITLIST_SOURCES = ["hero", "closing"] as const;
export type WaitlistSource = (typeof WAITLIST_SOURCES)[number];

export function isWaitlistSource(value: unknown): value is WaitlistSource {
  return typeof value === "string" && WAITLIST_SOURCES.includes(value as WaitlistSource);
}

/**
 * Lifecycle of an address. Only \`pending\` is ever written today — the states
 * exist so a later double opt-in or unsubscribe has somewhere to land that is
 * not a second collection, and so "who can we email" is a query against a
 * field rather than against the absence of one.
 */
export const WAITLIST_STATUSES = ["pending", "confirmed", "unsubscribed"] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

/**
 * Campaign parameters, read from the submitting page's query string.
 *
 * An explicit allowlist of three, not the whole query: an arbitrary query value
 * can carry internal paths, identifiers, or something a visitor typed, and
 * marketing attribution is not a good reason to keep any of that.
 */
export const WAITLIST_CAMPAIGN_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;
export type WaitlistCampaignKey = (typeof WAITLIST_CAMPAIGN_KEYS)[number];

export type WaitlistCampaign = Partial<Record<WaitlistCampaignKey, string>>;

/**
 * A waitlist document, keyed in Firestore by the normalised email address.
 *
 * The address is the document id so submitting twice updates one record rather
 * than creating two. \`signupCount\` is what a duplicate row would have told us,
 * and it is more useful as a number.
 */
export interface WaitlistRecord {
  schema_version: typeof WAITLIST_SCHEMA_VERSION;
  /** Normalised: trimmed and lowercased. The document id holds the same value. */
  email: string;
  status: WaitlistStatus;
  source: WaitlistSource;
  /** Path of the submitting page, without query or hash. */
  path: string;
  /** Referring origin only — never the full referring URL. */
  referrer?: string;
  campaign?: WaitlistCampaign;
  /**
   * Two-letter country from the edge, when the host supplies one. Present
   * instead of an IP address: the country answers "where is demand coming
   * from", and the IP only additionally answers "which household".
   */
  country?: string;
  userAgent?: string;
  signupCount: number;
  createdAt: string;
  updatedAt: string;
}
`;
export const waitlistRecord = (ctx) => {
    const self = "lib/waitlist/record.ts";
    return `import {
  WAITLIST_CAMPAIGN_KEYS,
  WAITLIST_SCHEMA_VERSION,
  isWaitlistSource,
  type WaitlistCampaign,
  type WaitlistRecord,
  type WaitlistSource,
} from "${ctx.schema(self)}";

/**
 * Turning a form submission into a stored record, as pure functions.
 *
 * Separated from the route handler because this is the part with the decisions
 * in it — what counts as an address, what is kept, what is discarded — and it
 * can be tested exhaustively without a Firestore, a credential, or a running
 * request.
 */

/**
 * RFC 5321 caps a path at 254 characters. Enforced because it is the only
 * bound on a field that becomes a document id; without it the rejection comes
 * from the database rather than from validation, which is a worse error and a
 * wasted write.
 */
export const MAX_EMAIL_LENGTH = 254;

/** Longest campaign or referrer value stored. Beyond this it is not attribution. */
export const MAX_METADATA_LENGTH = 200;

/**
 * Deliberately not an RFC 5322 grammar. That regex accepts addresses no mail
 * provider issues and is a well-known source of catastrophic backtracking;
 * this one accepts what a person can actually be reached at, and the real
 * verification is that a sent email arrives.
 *
 * Anchored, no nested quantifiers, so it is linear on any input.
 *
 * \`/\` is excluded from the local part even though RFC 5321 permits it there,
 * because the address becomes the Firestore document id and an id may not
 * contain one. Escaping instead would put the id and the address out of sync
 * for the sake of an address form nobody is issued.
 */
const EMAIL =
  /^[^\\s@,;:<>()[\\]\\\\"/]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

/**
 * Trim and lowercase. The local part is technically case-sensitive and in
 * practice never is — treating \`Chris@\` and \`chris@\` as two people puts one
 * person on the list twice and mails them twice.
 */
export function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export function isValidEmail(email: string): boolean {
  return email.length > 0 && email.length <= MAX_EMAIL_LENGTH && EMAIL.test(email);
}

/**
 * A Firestore document id may not contain \`/\`, may not be \`.\` or \`..\`, and may
 * not be wrapped in double underscores. A validated address is none of those,
 * so this guards against being reached with something unvalidated rather than
 * transforming anything.
 */
export function docId(email: string): string {
  if (!isValidEmail(email)) {
    throw new Error("Refusing to build a document id from an invalid address.");
  }
  return email;
}

function trimmedString(value: unknown, max = MAX_METADATA_LENGTH): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Path only — no query, no hash, and same-origin.
 *
 * The value arrives from the browser, so it is an attacker-controlled string
 * landing in a record a human will read. Rebuilding it from a parsed URL rather
 * than sanitising the input means anything unexpected becomes \`"/"\` instead of
 * a shorter version of itself. The base below is only a parsing base; no part
 * of it is stored.
 */
export function safePath(value: unknown): string {
  const raw = trimmedString(value, 2048);
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";

  try {
    return new URL(raw, "https://parse.invalid").pathname;
  } catch {
    return "/";
  }
}

/**
 * Referrer reduced to its origin.
 *
 * The full referring URL is a path through someone else's site and can carry
 * their query parameters, including identifiers belonging to whoever sent the
 * visitor. The origin answers what the record is for — which site sends
 * signups — and stops there.
 */
export function safeReferrerOrigin(value: unknown): string | undefined {
  const raw = trimmedString(value, 2048);
  if (!raw) return undefined;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return url.origin.slice(0, MAX_METADATA_LENGTH);
  } catch {
    return undefined;
  }
}

/**
 * The three UTM keys, if present. Returns \`undefined\` rather than \`{}\` so an
 * organic signup has no \`campaign\` field at all — an empty map reads as "we
 * tried to attribute this and failed", which is not what happened.
 */
export function safeCampaign(value: unknown): WaitlistCampaign | undefined {
  if (typeof value !== "object" || value === null) return undefined;

  const input = value as Record<string, unknown>;
  const campaign: WaitlistCampaign = {};
  for (const key of WAITLIST_CAMPAIGN_KEYS) {
    const parameter = trimmedString(input[key]);
    if (parameter) campaign[key] = parameter;
  }

  return Object.keys(campaign).length > 0 ? campaign : undefined;
}

/** ISO 3166-1 alpha-2, as edge hosts supply it. \`XX\` means "unknown" on Vercel. */
export function safeCountry(value: unknown): string | undefined {
  // Tested before any truncation. Slicing first would turn "USA" — which this
  // header never carries, so a sign of something unexpected — into a confident
  // "US".
  const raw = trimmedString(value, MAX_METADATA_LENGTH);
  if (!raw || !/^[A-Za-z]{2}$/.test(raw)) return undefined;
  const country = raw.toUpperCase();
  return country === "XX" ? undefined : country;
}

export type WaitlistSubmission = {
  email: unknown;
  source: unknown;
  path?: unknown;
  referrer?: unknown;
  campaign?: unknown;
};

export type ParsedSubmission =
  | {
      ok: true;
      email: string;
      source: WaitlistSource;
      path: string;
      referrer?: string;
      campaign?: WaitlistCampaign;
    }
  | { ok: false; error: string };

/**
 * Validate a submission body.
 *
 * \`source\` is required and must be a known value. It is the one field a form
 * chooses rather than a person types, so an unrecognised one means the request
 * did not come from a page we shipped — and accepting it would let anyone write
 * arbitrary strings into the field the funnel is measured on.
 */
export function parseSubmission(body: WaitlistSubmission): ParsedSubmission {
  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  if (!isWaitlistSource(body.source)) {
    return { ok: false, error: "Unrecognised form." };
  }

  return {
    ok: true,
    email,
    source: body.source,
    path: safePath(body.path),
    referrer: safeReferrerOrigin(body.referrer),
    campaign: safeCampaign(body.campaign),
  };
}

/**
 * The fields written on both create and update.
 *
 * \`createdAt\` and \`signupCount\` are excluded on purpose — a second submission
 * refreshes where someone came from without rewriting when they first arrived.
 * \`undefined\` values are dropped rather than stored as null, so an absent
 * referrer is an absent field.
 */
export function mutableFields(
  parsed: Extract<ParsedSubmission, { ok: true }>,
  context: { country?: string; userAgent?: string; now: string },
): Omit<WaitlistRecord, "createdAt" | "signupCount"> {
  return {
    schema_version: WAITLIST_SCHEMA_VERSION,
    email: parsed.email,
    status: "pending",
    source: parsed.source,
    path: parsed.path,
    ...(parsed.referrer ? { referrer: parsed.referrer } : {}),
    ...(parsed.campaign ? { campaign: parsed.campaign } : {}),
    ...(context.country ? { country: context.country } : {}),
    ...(context.userAgent ? { userAgent: context.userAgent } : {}),
    updatedAt: context.now,
  };
}
`;
};
export const waitlistThrottle = () => `/**
 * A per-instance submission throttle.
 *
 * **This is a speed bump, not a rate limit, and the difference matters.** The
 * counter lives in the memory of one serverless instance: Vercel runs several
 * concurrently and recycles them, so a determined script gets a fresh budget
 * per instance and again after every cold start. Nothing here would stop one.
 *
 * It is worth having anyway, for the case it does cover. The realistic abuse of
 * an open form is a naive loop from one address, and on Firebase's free tier
 * the damage is a daily write quota spent by a script rather than by people.
 * A bound of {@link MAX_PER_WINDOW} per key stops that loop in its first second.
 *
 * The honest fix is a shared counter, which means a store this project does not
 * have yet. If signups ever justify one, replace this module and keep the
 * interface; the route does not know how the decision is made.
 */

export const WINDOW_MS = 10 * 60 * 1000;
export const MAX_PER_WINDOW = 5;

/**
 * Cap on distinct keys held, so a stream of unique addresses cannot grow this
 * map without bound. At the cap the oldest window is dropped, which is the
 * entry closest to expiring anyway.
 */
const MAX_KEYS = 5_000;

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

function evictExpired(now: number) {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

/**
 * Record an attempt for \`key\`, and say whether it is allowed. Called before the
 * write, so a rejected attempt costs nothing but the function invocation.
 */
export function allowAttempt(key: string, now = Date.now()): boolean {
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    if (windows.size >= MAX_KEYS) {
      evictExpired(now);
      // Still full: every window is live, so drop the least recently created.
      // Map preserves insertion order, which makes the first key the oldest.
      if (windows.size >= MAX_KEYS) {
        const oldest = windows.keys().next().value;
        if (oldest !== undefined) windows.delete(oldest);
      }
    }
    windows.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  existing.count += 1;
  return existing.count <= MAX_PER_WINDOW;
}

/** Test seam. Never called in a request path. */
export function resetThrottle() {
  windows.clear();
}
`;
/**
 * The Firestore REST encoding, kept pure and apart from the request.
 *
 * Separate from `store.ts` for the same reason `record.ts` is separate from the
 * route: this is a total function from a record to a wire shape, it is the part
 * that silently corrupts data when it is wrong, and it can be tested without a
 * credential, a network, or `server-only`.
 */
export const firestoreValue = () => `/**
 * Firestore's REST value encoding.
 *
 * The REST API does not take plain JSON. Every field is a tagged union —
 * \`{"stringValue": "…"}\`, \`{"integerValue": "1"}\`, \`{"mapValue": {"fields": …}}\`
 * — and an untagged value is rejected rather than coerced. Integers travel as
 * *strings*, which is the detail most likely to be got wrong: JSON numbers
 * would silently become doubles.
 *
 * Only the shapes a waitlist record actually contains are handled. An
 * unsupported one throws rather than being dropped, because a field that
 * vanishes on the way to storage is the failure nobody notices.
 */

export type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { booleanValue: boolean }
  | { mapValue: { fields: Record<string, FirestoreValue> } };

export function toFirestoreValue(value: unknown): FirestoreValue {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error(\`Refusing to store a non-integer number: \${value}\`);
    }
    // A string, deliberately. \`{"integerValue": 1}\` is read as a double.
    return { integerValue: String(value) };
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { mapValue: { fields: toFirestoreFields(value as Record<string, unknown>) } };
  }
  throw new Error(\`Unsupported Firestore value: \${Object.prototype.toString.call(value)}\`);
}

/** Encode a record, dropping \`undefined\` so an absent field stays absent. */
export function toFirestoreFields(
  record: Record<string, unknown>,
): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue;
    fields[key] = toFirestoreValue(value);
  }
  return fields;
}

/** Every field path in an encoded record, for an update mask. */
export function fieldPaths(fields: Record<string, FirestoreValue>): string[] {
  // Top level only. A mask naming \`campaign\` replaces the whole map, which is
  // what a resubmission should do — naming \`campaign.utm_source\` would leave a
  // stale key behind from a previous submission.
  return Object.keys(fields);
}

/**
 * The resource name of one document.
 *
 * **Not URL-encoded**, and that is the whole point of this function existing.
 * A resource name in a request *body* is an identifier, not a URL: encoding it
 * makes \`a@b.com\` into the literal id \`a%40b.com\`, which is a different
 * document. Firestore then happily writes it and answers 200, so a returning
 * subscriber silently gets a second row and \`signupCount\` never increments —
 * exactly what happened on Evo's first resubmission test.
 *
 * The \`documentId\` *query parameter* on create is the opposite case and must
 * be encoded. Safe either way because \`docId\` has already refused anything
 * that is not a valid address, and a valid address cannot contain \`/\`.
 */
export function documentName(project: string, collection: string, id: string): string {
  return \`projects/\${project}/databases/(default)/documents/\${collection}/\${id}\`;
}
`;
export const waitlistStore = (ctx) => {
    const self = "lib/waitlist/store.ts";
    return `import "server-only";

import { WAITLIST_COLLECTION } from "${ctx.schema(self)}";

import { googleAccessToken } from "${ctx.imp(self, "lib/firebase/admin")}";
import { PROJECT_ID } from "${ctx.imp(self, "lib/firebase/config")}";
import { docId, mutableFields, type ParsedSubmission } from "${ctx.imp(self, "lib/waitlist/record")}";
import {
  documentName,
  fieldPaths,
  toFirestoreFields,
} from "${ctx.imp(self, "lib/waitlist/firestore-value")}";

/**
 * The Firestore write, over the REST API.
 *
 * Not through \`firebase-admin\`'s Firestore client, and the reason is worth
 * keeping: that client goes through google-gax, which rejects the credential
 * federation mints and answers \`firestore/invalid-credential\` — on a
 * deployment whose Google sign-in works, because Auth and Firestore fail
 * independently behind one credential. REST takes a plain bearer token, so
 * every environment authenticates the same way.
 *
 * The one decision inside it is unchanged: what happens when an address is
 * already on the list.
 */

export type SaveOutcome = "created" | "updated";

const BASE = "https://firestore.googleapis.com/v1";

/** Firestore answers 409 when \`documentId\` is already taken. */
const ALREADY_EXISTS = 409;

async function firestore(
  path: string,
  init: { method: string; body: unknown; query?: string },
): Promise<Response> {
  const token = await googleAccessToken();
  return fetch(\`\${BASE}/\${path}\${init.query ?? ""}\`, {
    method: init.method,
    headers: {
      Authorization: \`Bearer \${token}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(init.body),
  });
}

async function failure(response: Response, context: string): Promise<Error> {
  // The body names the project, the collection and the refused identity, which
  // is exactly what the route must log and must not return.
  const detail = await response.text().catch(() => "");
  return new Error(\`\${context} failed (\${response.status}): \${detail.slice(0, 500)}\`);
}

/**
 * Write a signup, keyed by the normalised address.
 *
 * Create first, then fall back to a commit that merges, rather than a
 * transaction: the overwhelmingly common case is a new address and that path is
 * a single round trip. A transaction would make every signup pay for the rare
 * one.
 *
 * A repeat submission refreshes the metadata and increments \`signupCount\` but
 * leaves \`createdAt\` alone — when someone first asked is a fact about them,
 * and re-entering an address should not rewrite it.
 *
 * The outcome is returned for the caller's telemetry only. It must not reach
 * the browser: a response distinguishing "added" from "already here" turns this
 * endpoint into an oracle for testing whether an address is on the list.
 */
export async function saveSignup(
  parsed: Extract<ParsedSubmission, { ok: true }>,
  context: { country?: string; userAgent?: string; now?: string } = {},
): Promise<SaveOutcome> {
  const now = context.now ?? new Date().toISOString();
  const id = docId(parsed.email);
  const mutable = toFirestoreFields({ ...mutableFields(parsed, { ...context, now }) });

  const created = await firestore(
    \`projects/\${PROJECT_ID}/databases/(default)/documents/\${WAITLIST_COLLECTION}\`,
    {
      method: "POST",
      query: \`?documentId=\${encodeURIComponent(id)}\`,
      body: { fields: { ...mutable, ...toFirestoreFields({ createdAt: now, signupCount: 1 }) } },
    },
  );
  if (created.ok) return "created";
  if (created.status !== ALREADY_EXISTS) throw await failure(created, "Creating a waitlist signup");

  // Already present. \`updateMask\` is what keeps this a merge rather than a
  // replace — without it the commit would drop \`createdAt\` and \`signupCount\`,
  // silently resetting both. The increment is a server-side transform, so two
  // simultaneous resubmissions cannot read the same count and write it twice.
  const updated = await firestore(
    \`projects/\${PROJECT_ID}/databases/(default)/documents:commit\`,
    {
      method: "POST",
      body: {
        writes: [
          {
            update: { name: documentName(PROJECT_ID, WAITLIST_COLLECTION, id), fields: mutable },
            updateMask: { fieldPaths: fieldPaths(mutable) },
            updateTransforms: [
              { fieldPath: "signupCount", increment: { integerValue: "1" } },
            ],
          },
        ],
      },
    },
  );
  if (!updated.ok) throw await failure(updated, "Updating a waitlist signup");
  return "updated";
}
`;
};
export const waitlistRoute = (ctx) => {
    const self = "app/api/waitlist/route.ts";
    return `import { NextResponse } from "next/server";

import {
  parseSubmission,
  safeCountry,
  type WaitlistSubmission,
} from "${ctx.imp(self, "lib/waitlist/record")}";
import { saveSignup } from "${ctx.imp(self, "lib/waitlist/store")}";
import { allowAttempt } from "${ctx.imp(self, "lib/waitlist/throttle")}";

// The Admin SDK needs Node built-ins; this route must not run on Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Nobody's address is 8KB. A cap here means a large body is refused before it
 * is parsed rather than after.
 */
const MAX_BODY_BYTES = 8 * 1024;

/** Enough to tell a browser from a phone from a script. Not a fingerprint. */
const MAX_USER_AGENT_LENGTH = 300;

/**
 * A single, unchanging success response.
 *
 * Every accepted request gets this, whether the address was new, already on the
 * list, or submitted five times in a row. The endpoint is public and unguarded
 * by design, so any variation in what it says back is a way to ask it questions
 * about who is on the list.
 */
const ACCEPTED = { ok: true } as const;

function clientKey(request: Request): string {
  // Vercel sets both; \`x-forwarded-for\` may be a chain, and the client is first.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return request.headers.get("x-real-ip") ?? forwarded ?? "unknown";
}

/**
 * Join the waitlist.
 *
 * Server-side rather than a client Firestore write, which is the choice worth
 * pinning. A browser write needs a rule allowing anyone to create documents in
 * this collection, and a rule cannot see an IP, cannot throttle, and cannot
 * decide that a referrer should be stored as an origin. Here every field the
 * browser sends is re-derived or discarded, and the client never holds
 * Firestore credentials at all.
 */
export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "That request was too large." }, { status: 413 });
  }

  let body: WaitlistSubmission;
  try {
    body = (await request.json()) as WaitlistSubmission;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const parsed = parseSubmission(body ?? ({} as WaitlistSubmission));
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // After validation, so a malformed flood does not consume the budget that
  // protects the write, and before the write, so a rejected attempt costs
  // nothing but this invocation.
  if (!allowAttempt(clientKey(request))) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 },
    );
  }

  try {
    await saveSignup(parsed, {
      country: safeCountry(request.headers.get("x-vercel-ip-country")),
      userAgent: request.headers.get("user-agent")?.slice(0, MAX_USER_AGENT_LENGTH) ?? undefined,
    });
  } catch (error) {
    // Logged rather than returned. A Firestore error message can name the
    // project, the collection, and the identity that was refused.
    console.error("waitlist: write failed", error);
    return NextResponse.json(
      { error: "Something went wrong on our end. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json(ACCEPTED);
}
`;
};
export const waitlistForm = (ctx) => {
    const self = "app/WaitlistForm.tsx";
    return `"use client";

import { useState } from "react";

import {
  WAITLIST_CAMPAIGN_KEYS,
  type WaitlistSource,
} from "${ctx.schema(self)}";

/**
 * The email capture form.
 *
 * Styling is intentionally minimal — Tailwind core utilities only, no semantic
 * token names — because this file is generated into projects whose design
 * vocabularies differ. Restyle it; do not regenerate it.
 *
 * Analytics is an \`onJoined\` callback rather than an import. The event belongs
 * in the project's own \`schema/analytics.ts\` vocabulary, and a scaffold that
 * reached into it would either invent an event name or fail to compile.
 */

type Status = "idle" | "working" | "done" | "error";

function campaignFromLocation(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const campaign: Record<string, string> = {};
  for (const key of WAITLIST_CAMPAIGN_KEYS) {
    const value = params.get(key);
    if (value) campaign[key] = value;
  }
  return campaign;
}

export function WaitlistForm({
  source,
  label = "Join the waitlist",
  confirmation = "You're on the list. We'll be in touch.",
  onJoined,
}: {
  source: WaitlistSource;
  label?: string;
  confirmation?: string;
  onJoined?: (source: WaitlistSource) => void;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (status === "working") return;

    setStatus("working");
    setMessage(null);

    try {
      const response = await fetch("${ctx.waitlistEndpoint}", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          source,
          path: typeof window === "undefined" ? "/" : window.location.pathname,
          referrer: typeof document === "undefined" ? undefined : document.referrer || undefined,
          campaign: campaignFromLocation(),
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setStatus("error");
        setMessage(body.error ?? "Something went wrong. Please try again.");
        return;
      }

      setStatus("done");
      // Never the address. The event says a signup happened and where from.
      onJoined?.(source);
    } catch {
      setStatus("error");
      setMessage("Could not reach the server. Check your connection and try again.");
    }
  }

  if (status === "done") {
    return (
      <p role="status" className="text-sm">
        {confirmation}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3 sm:flex-row">
      <label className="sr-only" htmlFor={\`waitlist-email-\${source}\`}>
        Email address
      </label>
      <input
        id={\`waitlist-email-\${source}\`}
        type="email"
        name="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        // Never \`disabled\` while submitting: disabling the focused control moves
        // focus to the document, so a screen reader loses its place and the
        // error below is announced from nowhere.
        readOnly={status === "working"}
        className="w-full flex-1 rounded-lg border px-4 py-3 text-sm"
      />
      <button
        type="submit"
        disabled={status === "working"}
        className="rounded-lg border px-6 py-3 text-sm font-medium disabled:opacity-60"
      >
        {status === "working" ? "Joining…" : label}
      </button>

      {message && (
        <p role="alert" className="text-sm sm:basis-full">
          {message}
        </p>
      )}
    </form>
  );
}
`;
};
/**
 * The one generated test.
 *
 * `record.ts` is where the decisions are, and it is pure — so it is the module
 * whose behaviour a project can regress without noticing. Emitted in whichever
 * runner the app already uses: a scaffold that brought its own runner would be
 * adding a dependency to make its own output pass.
 */
export const waitlistRecordTest = (ctx, runner) => {
    // Two runners, two file extensions, and the extension is not cosmetic.
    //
    // A `node --test` project runs the file directly, so the specifier has to be
    // real ESM — relative *and* extensioned. TypeScript rejects a `.ts` specifier
    // unless `allowImportingTsExtensions` is set, so such a test cannot both
    // typecheck and run as `.ts`. It is `.mjs`, which is what these projects
    // already write and what their tsconfig `include` deliberately leaves out.
    //
    // Vitest resolves like a bundler, so there the idiomatic `.ts` test with an
    // extensionless import is right.
    const path = runner === "vitest"
        ? "__tests__/waitlist-record.test.ts"
        : "__tests__/waitlist-record.test.mjs";
    // Relative, never the alias, and this is the one file where that is true.
    // `@/` comes from tsconfig paths: Next resolves it, `node --test` reads it as
    // a package name and fails with `Cannot find package '@/lib'`, and vitest
    // resolves it only when the project has configured it to — which a scaffold
    // cannot know.
    const record = ctx.relative(path, "lib/waitlist/record") + (runner === "node" ? ".ts" : "");
    const encoder = ctx.relative(path, "lib/waitlist/firestore-value") + (runner === "node" ? ".ts" : "");
    const header = runner === "vitest"
        ? `import { describe, expect, it } from "vitest";\n\nconst eq = (actual: unknown, expected: unknown) => expect(actual).toEqual(expected);`
        : `import assert from "node:assert/strict";\nimport { describe, it } from "node:test";\n\nconst eq = (actual, expected) => assert.deepStrictEqual(actual, expected);`;
    const content = `${header}

import {
  docId,
  isValidEmail,
  normalizeEmail,
  parseSubmission,
  safeCampaign,
  safeCountry,
  safePath,
  safeReferrerOrigin,
} from "${record}";
import {\n  documentName,\n  fieldPaths,\n  toFirestoreFields,\n  toFirestoreValue,\n} from "${encoder}";

/**
 * The pure half of the waitlist. Every case here is a shape a real form or a
 * real script has sent — header injection, an address list, a bracketed
 * address, a country that is not a country.
 */
describe("waitlist record", () => {
  it("normalises and validates addresses", () => {
    eq(normalizeEmail("  Chris@Example.com "), "chris@example.com");
    eq(isValidEmail("chris@example.com"), true);
    eq(isValidEmail("chris"), false);
    eq(isValidEmail("a@b"), false);
    eq(isValidEmail("chris@example.com\\nBcc: someone@else.com"), false);
    eq(isValidEmail("one@example.com,two@example.com"), false);
    eq(isValidEmail("<chris@example.com>"), false);
    eq(isValidEmail(\`\${"a".repeat(250)}@example.com\`), false);
  });

  it("refuses to build a document id from anything unvalidated", () => {
    eq(docId("chris@example.com"), "chris@example.com");
    let threw = false;
    try {
      docId("not an address");
    } catch {
      threw = true;
    }
    eq(threw, true);
  });

  it("reduces page, referrer, campaign and country", () => {
    eq(safePath("/pricing?utm_source=x#top"), "/pricing");
    eq(safePath("//evil.example/path"), "/");
    eq(safePath("https://evil.example/path"), "/");
    eq(safeReferrerOrigin("https://news.example/story?who=me"), "https://news.example");
    eq(safeReferrerOrigin("javascript:alert(1)"), undefined);
    eq(safeCampaign({ utm_source: "x", other: "dropped" }), { utm_source: "x" });
    eq(safeCampaign({}), undefined);
    // Validated before truncation, so a three-letter value is unknown rather
    // than a confident "US".
    eq(safeCountry("USA"), undefined);
    eq(safeCountry("us"), "US");
    eq(safeCountry("XX"), undefined);
  });

  it("rejects a source the site never shipped", () => {
    const parsed = parseSubmission({ email: "chris@example.com", source: "footer" });
    eq(parsed.ok, false);
  });

  it("accepts a submission and keeps only what it should", () => {
    const parsed = parseSubmission({
      email: " Chris@Example.com ",
      source: "hero",
      path: "/?utm_source=x",
      referrer: "https://news.example/story",
      campaign: { utm_source: "x", utm_medium: "social", nope: "dropped" },
    });
    eq(parsed.ok, true);
    if (!parsed.ok) return;
    eq(parsed.email, "chris@example.com");
    eq(parsed.path, "/");
    eq(parsed.referrer, "https://news.example");
    eq(parsed.campaign, { utm_source: "x", utm_medium: "social" });
  });
});

/**
 * The wire encoding. Firestore's REST API rejects untagged JSON rather than
 * coercing it, and an integer sent as a JSON number silently becomes a double.
 */
describe("firestore value encoding", () => {
  it("tags every scalar, and sends integers as strings", () => {
    eq(toFirestoreValue("hello"), { stringValue: "hello" });
    eq(toFirestoreValue(1), { integerValue: "1" });
    eq(toFirestoreValue(true), { booleanValue: true });
  });

  it("refuses what it cannot represent rather than dropping it", () => {
    for (const bad of [1.5, [], null]) {
      let threw = false;
      try {
        toFirestoreValue(bad);
      } catch {
        threw = true;
      }
      eq(threw, true);
    }
  });

  it("encodes a record, drops undefined, and nests a campaign map", () => {
    const fields = toFirestoreFields({
      email: "chris@example.com",
      signupCount: 2,
      referrer: undefined,
      campaign: { utm_source: "x" },
    });
    eq(fields, {
      email: { stringValue: "chris@example.com" },
      signupCount: { integerValue: "2" },
      campaign: { mapValue: { fields: { utm_source: { stringValue: "x" } } } },
    });
    // An absent referrer is an absent field, not a stored null.
    eq(Object.keys(fields).includes("referrer"), false);
    // The mask names top-level paths only, so a resubmission replaces the whole
    // campaign map instead of leaving a stale key from a previous one.
    eq(fieldPaths(fields), ["email", "signupCount", "campaign"]);
  });

  it("does not encode the document name, because a body is not a URL", () => {
    // Encoding turns a@b.com into the *different* document a%40b.com, which
    // Firestore writes happily and answers 200 to — so a returning subscriber
    // gets a second row and signupCount never increments.
    eq(
      documentName("p", "waitlist", "chris@example.com"),
      "projects/p/databases/(default)/documents/waitlist/chris@example.com",
    );
  });
});
`;
    return { path, content };
};
/**
 * The Firestore block for the waitlist collection.
 *
 * Written out explicitly rather than left to the catch-all deny: a collection
 * closed by omission looks like an oversight, and the next person wanting a
 * signup form would "fix" it by opening it up.
 */
export const WAITLIST_RULES_BLOCK = `
    // Waitlist signups are written only by the server, through
    // /api/waitlist, with the Admin SDK — which bypasses these rules. Every
    // client operation is denied in both directions, deliberately and
    // explicitly: a public form does not need a public collection, and reading
    // the list is not something a browser should ever do.
    match /waitlist/{email} {
      allow read, write: if false;
    }
`;
// -------------------------------------------------------------- hq / auth ---
export const firebaseConfigFile = (facts) => {
    const wif = facts.workloadIdentity;
    return `/**
 * Firebase web config. These values are public by design — they identify the
 * project to Google, they do not authorise anything. Access is enforced by
 * Firebase Auth, the \`role\` custom claim, and Firestore rules, never by hiding
 * these strings. Committing them keeps preview deploys working without a
 * per-environment secret.
 */
export const firebaseConfig = {
  apiKey: "${facts.apiKey}",
  authDomain: "${facts.authDomain}",
  projectId: "${facts.projectId}",
  storageBucket: "${facts.storageBucket}",
  messagingSenderId: "${facts.messagingSenderId}",
  appId: "${facts.appId}",
} as const;

export const PROJECT_ID = firebaseConfig.projectId;
${wif
        ? `
/**
 * Workload Identity Federation, which is how the Admin SDK authenticates on
 * Vercel. None of these are secrets — they name a trust relationship rather
 * than prove one. The proof is the OIDC token Vercel mints per request, which
 * GCP validates against Vercel's published certificates.
 *
 * There is deliberately no service-account key: nothing to create, store, leak,
 * or rotate, and key creation is disabled by org policy on some organisations
 * anyway.
 */
export const WORKLOAD_IDENTITY = {
  /** Project *number*, not id — the audience is built from the number. */
  projectNumber: firebaseConfig.messagingSenderId,
  poolId: "${wif.poolId}",
  providerId: "${wif.providerId}",
  serviceAccount: "${wif.serviceAccount}",
} as const;

/** The \`audience\` an external-account credential presents to STS. */
export const WORKLOAD_IDENTITY_AUDIENCE =
  \`//iam.googleapis.com/projects/\${WORKLOAD_IDENTITY.projectNumber}\` +
  \`/locations/global/workloadIdentityPools/\${WORKLOAD_IDENTITY.poolId}\` +
  \`/providers/\${WORKLOAD_IDENTITY.providerId}\`;
`
        : ""}
export type CredentialStrategy = "service-account"${wif ? ' | "workload-identity"' : ""} | "adc";

/**
 * How the Admin SDK should authenticate, given the environment.
 *
 * Split out from \`admin.ts\` so it can be tested without importing
 * \`server-only\`, and because the choice is the part worth pinning: picking the
 * wrong branch does not fail loudly, it falls back to a credential that is
 * absent, and the first symptom is sign-in breaking in a deployed environment.
 */
export function credentialStrategy(env: {
  FIREBASE_SERVICE_ACCOUNT?: string;
  VERCEL?: string;
}): CredentialStrategy {
  if (env.FIREBASE_SERVICE_ACCOUNT) return "service-account";
${wif ? '  if (env.VERCEL) return "workload-identity";\n' : ""}  return "adc";
}

/**
 * Name of the session cookie. Firebase issues the value; we choose where it
 * lives. \`__session\` is not arbitrary — it is the only cookie name Firebase
 * Hosting forwards to a CDN-cached origin, so keeping it here means the hosting
 * choice can change without invalidating every live session.
 */
export const SESSION_COOKIE_NAME = "__session";

/** Firebase caps session cookies at 14 days. */
export const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
`;
};
export const firebaseClient = (ctx) => {
    const self = "lib/firebase/client.ts";
    return `"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, type Auth } from "firebase/auth";

import { firebaseConfig } from "${ctx.imp(self, "lib/firebase/config")}";

/**
 * Browser-side Firebase. Next.js re-executes modules across HMR and route
 * transitions, so guard against a second \`initializeApp\` for the same name.
 */
export function getClientApp() {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function getClientAuth(): Auth {
  return getAuth(getClientApp());
}

export function googleProvider() {
  const provider = new GoogleAuthProvider();
  // Always show the chooser. Without this, anyone with several Google accounts
  // is silently signed in as whichever one the browser prefers, which is
  // usually the personal account that is not on the allowlist.
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}
`;
};
export const firebaseAdmin = (ctx, facts) => {
    const self = "lib/firebase/admin.ts";
    const config = ctx.imp(self, "lib/firebase/config");
    const wif = facts.workloadIdentity;
    return `import "server-only";

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type Credential,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
${wif
        ? `import { getVercelOidcToken } from "@vercel/functions/oidc";
import { ExternalAccountClient } from "google-auth-library";

`
        : ""}import {
  credentialStrategy,
  PROJECT_ID,${wif ? "\n  WORKLOAD_IDENTITY,\n  WORKLOAD_IDENTITY_AUDIENCE," : ""}
} from "${config}";

const ADMIN_APP = "${facts.projectId}-admin";

/**
 * Admin SDK, for what the client cannot do: mint a session cookie from an ID
 * token, read a session cookie with revocation checked, and write to
 * collections the rules deny every client.
 *
 * Credentials resolve most specific first — an explicit service-account blob,
 * then${wif ? " Workload Identity Federation on Vercel, then" : ""} Application Default Credentials, so a local
 * \`gcloud auth application-default login\` just works under \`next dev\`.
 */
function getAdminApp(): App {
  const existing = getApps().find((app) => app.name === ADMIN_APP);
  if (existing) return existing;

  return initializeApp({ credential: resolveCredential(), projectId: PROJECT_ID }, ADMIN_APP);
}

function resolveCredential(): Credential {
  // Read through explicitly: \`process.env\` is an index signature, so passing it
  // whole would type-check against anything.
  const env = {
    FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT,
    VERCEL: process.env.VERCEL,
  };

  switch (credentialStrategy(env)) {
    case "service-account":
      return serviceAccountKey(env.FIREBASE_SERVICE_ACCOUNT!);
${wif ? "    case \"workload-identity\":\n      return workloadIdentity();\n" : ""}    case "adc":
      return applicationDefault();
  }
}

function serviceAccountKey(raw: string): Credential {
  let parsed: { project_id: string; client_email: string; private_key: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT is set but is not valid JSON. Paste the whole " +
        "service-account key, not just the private key.",
    );
  }

  // Newlines survive most secret stores literally; the SDK needs them real.
  return cert({
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key.replace(/\\\\n/g, "\\n"),
  });
}
${wif
        ? `
/**
 * Exchange Vercel's per-deployment OIDC token for short-lived GCP credentials.
 *
 * Vercel signs a JWT asserting which team, project and environment is running.
 * GCP's STS validates it against Vercel's published certificates, applies the
 * provider's attribute condition, and returns a federated token, which is then
 * used to impersonate the service account. There is no key anywhere in that
 * chain.
 *
 * The token is fetched per call rather than read once from
 * \`process.env.VERCEL_OIDC_TOKEN\`. Vercel injects a fresh token per invocation
 * and each lives about twelve hours, so a token captured at module load works
 * on a warm deployment and then starts failing with \`invalid_grant\` once it
 * ages out — the slowest possible way to find a bug.
 */
function workloadIdentity(): Credential {
  const client = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience: WORKLOAD_IDENTITY_AUDIENCE,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url:
      "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" +
      \`\${WORKLOAD_IDENTITY.serviceAccount}:generateAccessToken\`,
    subject_token_supplier: {
      getSubjectToken: () => getVercelOidcToken(),
    },
  });

  if (!client) {
    throw new Error(
      \`Could not build a Workload Identity credential from \${WORKLOAD_IDENTITY_AUDIENCE}. \` +
        "That is a malformed audience, not a missing token.",
    );
  }

  return {
    async getAccessToken() {
      const { token } = await client.getAccessToken();

      if (!token) {
        throw new Error(
          "Workload Identity Federation returned no access token. Check that OIDC " +
            "Federation is enabled on the Vercel project and its issuer mode is Team.",
        );
      }

      // firebase-admin wants a lifetime, not a deadline.
      const expiry = client.credentials?.expiry_date;
      return {
        access_token: token,
        expires_in: expiry ? Math.max(0, Math.floor((expiry - Date.now()) / 1000)) : 3600,
      };
    },
  };
}
`
        : ""}
export function adminAuth() {
  return getAuth(getAdminApp());
}

/**
 * A Google access token for the identity this deployment runs as.
 *
 * Firestore is reached over its REST API rather than through
 * \`firebase-admin\`'s Firestore client, and that is not a style preference —
 * that client goes through google-gax, which wants a real GoogleAuth credential
 * and rejects the token-minting object \`firebase-admin\` accepts everywhere
 * else. The symptom is \`firestore/invalid-credential\` on the first write of a
 * deployment whose sign-in works perfectly, because Auth and Firestore fail
 * independently behind one credential. Found in production on Evo.
 *
 * Going through the credential resolved above means all three strategies —
 * service-account key, federation, local ADC — mint a token the same way, so
 * there is one path to test rather than one per environment.
 *
 * Still requires \`roles/datastore.user\` on that identity. A missing grant
 * surfaces as a 403 on the first write and nowhere earlier.
 */
let cachedCredential: Credential | undefined;

export async function googleAccessToken(): Promise<string> {
  cachedCredential ??= resolveCredential();
  const token = await cachedCredential.getAccessToken();
  if (!token?.access_token) {
    throw new Error("Could not mint a Google access token for the Firestore REST API.");
  }
  return token.access_token;
}
`;
};
export const authRoles = () => `/**
 * The role vocabulary. One \`role\` claim is the single fact that gates route
 * middleware and Firestore rules — which is the whole reason \`/hq\` is not on
 * Auth.js.
 *
 * The allowlists themselves live in \`morpheus.json\` and are applied to Firebase
 * custom claims by \`morpheus access sync\`. Nothing here reads that file at
 * runtime: the claim on the token is the authority, and this module only
 * describes what the claim is allowed to say.
 */
export const ROLES = ["admin", "employee", "investor"] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/**
 * Roles that may load \`/hq\` at all. \`investor\` is deliberately absent: the
 * investor surface is a separate route with its own allowlist in
 * \`morpheus.json\`, and conflating the two is how an investor ends up reading
 * supplier terms.
 *
 * This list and the vocabulary above must match Morpheus's \`access/schema.ts\`
 * exactly — \`morpheus access sync\` writes those strings, and a role this file
 * does not recognise is treated as no role at all. \`employee\`, not \`member\`.
 */
const HQ_ROLES: readonly Role[] = ["admin", "employee"];

export function canAccessHq(role: Role | null): boolean {
  return role !== null && HQ_ROLES.includes(role);
}

export function isAdmin(role: Role | null): boolean {
  return role === "admin";
}
`;
export const authSessionCookie = (ctx) => {
    const self = "lib/auth/session-cookie.ts";
    return `import { importX509, jwtVerify, type JWTPayload } from "jose";

import { isRole, type Role } from "${ctx.imp(self, "lib/auth/roles")}";

/**
 * Edge-safe verification of a Firebase session cookie.
 *
 * \`firebase-admin\` cannot run in the route gate — it needs Node built-ins the
 * Edge runtime does not provide. So the gate verifies the cookie itself,
 * against the same Google-published certificates the Admin SDK uses. That keeps
 * the role check at the edge rather than deferring every decision to a server
 * component, which is what makes the gate real rather than a redirect for
 * unauthenticated users.
 *
 * Session cookies are signed with a *different* key set than ID tokens and
 * carry a different issuer. Using the ID-token keys here silently fails to
 * verify every cookie.
 */
const SESSION_COOKIE_CERT_URL =
  "https://www.googleapis.com/identitytoolkit/v3/relyingparty/publicKeys";

/** jose 6 returns a WebCrypto key from importX509; it dropped the KeyLike alias. */
type PublicKey = Awaited<ReturnType<typeof importX509>>;

export type SessionClaims = {
  uid: string;
  email: string | null;
  role: Role | null;
};

type CertCache = { keys: Map<string, PublicKey>; expiresAt: number };

let cache: CertCache | null = null;

/**
 * Google returns X.509 certificates keyed by kid, not a JWKS document, so
 * \`createRemoteJWKSet\` cannot be pointed at this URL. The cache honours the
 * endpoint's own \`max-age\`; these certificates rotate roughly daily.
 */
async function getCertificates(): Promise<Map<string, PublicKey>> {
  if (cache && cache.expiresAt > Date.now()) return cache.keys;

  const response = await fetch(SESSION_COOKIE_CERT_URL);
  if (!response.ok) {
    throw new Error(\`Failed to fetch session cookie certificates: \${response.status}\`);
  }

  const certificates: Record<string, string> = await response.json();
  const keys = new Map<string, PublicKey>();
  for (const [kid, pem] of Object.entries(certificates)) {
    keys.set(kid, await importX509(pem, "RS256"));
  }

  const maxAge = /max-age=(\\d+)/.exec(response.headers.get("cache-control") ?? "");
  const ttlMs = maxAge ? Number(maxAge[1]) * 1000 : 60 * 60 * 1000;
  cache = { keys, expiresAt: Date.now() + ttlMs };

  return keys;
}

/** Exported for tests — certificate rotation must not leak between cases. */
export function resetCertificateCache(): void {
  cache = null;
}

/** Exported for tests: the payload-to-claims mapping is worth pinning down. */
export function toClaims(payload: JWTPayload): SessionClaims | null {
  const uid = typeof payload.sub === "string" ? payload.sub : null;
  if (!uid) return null;

  return {
    uid,
    email: typeof payload.email === "string" ? payload.email : null,
    role: isRole(payload.role) ? payload.role : null,
  };
}

/**
 * Returns the claims, or null for any cookie that is missing, malformed,
 * expired, or signed by something other than Google for this project. Never
 * throws on an untrusted cookie — a bad cookie is a signed-out user.
 */
export async function verifySessionCookie(
  cookie: string | undefined,
  projectId: string,
): Promise<SessionClaims | null> {
  if (!cookie) return null;

  try {
    const keys = await getCertificates();

    const { payload } = await jwtVerify(
      cookie,
      async (header) => {
        const key = header.kid ? keys.get(header.kid) : undefined;
        if (!key) throw new Error(\`Unknown key id: \${header.kid}\`);
        return key;
      },
      {
        issuer: \`https://session.firebase.google.com/\${projectId}\`,
        audience: projectId,
        algorithms: ["RS256"],
      },
    );

    return toClaims(payload);
  } catch {
    return null;
  }
}
`;
};
export const authCurrentUser = (ctx) => {
    const self = "lib/auth/current-user.ts";
    return `import "server-only";

import { cookies } from "next/headers";

import { PROJECT_ID, SESSION_COOKIE_NAME } from "${ctx.imp(self, "lib/firebase/config")}";
import { verifySessionCookie, type SessionClaims } from "${ctx.imp(self, "lib/auth/session-cookie")}";

/**
 * The signed-in user for server components.
 *
 * Uses the same edge-safe verifier as the route gate rather than the Admin SDK,
 * so a page and the gate protecting it can never disagree about who someone is.
 * Revocation is checked when the session is minted and when it is used to
 * write; a page render tolerates the gap until the cookie expires.
 */
export async function currentUser(): Promise<SessionClaims | null> {
  const store = await cookies();
  return verifySessionCookie(store.get(SESSION_COOKIE_NAME)?.value, PROJECT_ID);
}
`;
};
export const routeGate = (ctx) => {
    const self = "proxy.ts";
    return `import { NextResponse, type NextRequest } from "next/server";

import { canAccessHq } from "${ctx.imp(self, "lib/auth/roles")}";
import { verifySessionCookie } from "${ctx.imp(self, "lib/auth/session-cookie")}";
import { PROJECT_ID, SESSION_COOKIE_NAME } from "${ctx.imp(self, "lib/firebase/config")}";

/**
 * Gates \`/hq\` on the \`role\` custom claim — the same claim Firestore rules read.
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

  if (!claims) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(signIn);
  }

  if (!canAccessHq(claims.role)) {
    // Signed in and real, but without an HQ role — e.g. an investor. Sending
    // them to /sign-in would loop, since they are already signed in.
    return NextResponse.rewrite(new URL("/hq/no-access", request.url), { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  // Excludes /hq/no-access, which the rewrite above targets and which must stay
  // reachable for a signed-in user without a role.
  matcher: ["/hq((?!/no-access).*)"],
};
`;
};
export const apiAuthSession = (ctx, name) => {
    const self = "app/api/auth/session/route.ts";
    return `import { NextResponse } from "next/server";

import { isRole } from "${ctx.imp(self, "lib/auth/roles")}";
import { adminAuth } from "${ctx.imp(self, "lib/firebase/admin")}";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS } from "${ctx.imp(self, "lib/firebase/config")}";

// The Admin SDK needs Node built-ins; this route must not run on Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
 * Exchange a Firebase ID token for a session cookie.
 *
 * The role is not assigned here. It is a custom claim written by
 * \`morpheus access sync\` from the allowlists in \`morpheus.json\`, and this route
 * only refuses to mint a session for a user who has not been granted one. That
 * ordering matters: if this route could grant a role, the role would no longer
 * be the same fact that Firestore rules see.
 */
export async function POST(request: Request) {
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

  if (!isRole(decoded.role)) {
    // Authenticated with Google, but not on any allowlist. Deliberately not
    // "account not found" — they exist, they just have no role here.
    return NextResponse.json(
      { error: "This account is not authorised for ${name} HQ." },
      { status: 403 },
    );
  }

  const expiresIn = SESSION_MAX_AGE_MS;
  const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });

  const response = NextResponse.json({ ok: true, role: decoded.role });
  response.cookies.set({ ...sessionCookieOptions(expiresIn / 1000), value: sessionCookie });
  return response;
}

/** Sign out. Clears the cookie and revokes refresh tokens for the session. */
export async function DELETE(request: Request) {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(\`\${SESSION_COOKIE_NAME}=\`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);

  if (cookie) {
    try {
      const auth = adminAuth();
      const decoded = await auth.verifySessionCookie(cookie, false);
      await auth.revokeRefreshTokens(decoded.sub);
    } catch {
      // An unverifiable cookie is already useless; clearing it is enough.
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({ ...sessionCookieOptions(0) });
  return response;
}
`;
};
/**
 * The sign-in page.
 *
 * **It does not say what kind of account to use.** The allowlist is a list of
 * addresses and nothing more — personal or work is not a distinction it makes,
 * so the page must not imply one. The earlier version derived a domain from the
 * allowlist and said "personal Google accounts are not on the allowlist", which
 * was true when generated and false the first time anyone added one: a one-line
 * manifest change nobody pairs with a copy edit, telling exactly the people just
 * granted access not to bother trying. Darwin and Evo both shipped it.
 */
export const signInPage = (ctx, name) => {
    const self = "app/sign-in/page.tsx";
    return `import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { currentUser } from "${ctx.imp(self, "lib/auth/current-user")}";
import { canAccessHq } from "${ctx.imp(self, "lib/auth/roles")}";

import { SignInForm } from "./SignInForm";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

/** Only ever redirect to a path on this origin. */
function safeNext(value: string | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/hq";
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destination = safeNext(next);

  const user = await currentUser();
  if (user && canAccessHq(user.role)) redirect(destination);

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-[380px] flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest opacity-60">${name} HQ</p>
        <h1 className="text-3xl font-medium tracking-tight">Sign in</h1>
        <p className="text-sm leading-6 opacity-80">
          Access is limited to the ${name} team. The allowlist lives in{" "}
          <code>morpheus.json</code>.
        </p>
      </div>

      <SignInForm next={destination} />
    </div>
  );
}
`;
};
export const signInForm = (ctx) => {
    const self = "app/sign-in/SignInForm.tsx";
    return `"use client";

import { signInWithPopup } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { getClientAuth, googleProvider } from "${ctx.imp(self, "lib/firebase/client")}";

type Status = "idle" | "working" | "error";

/** Only the codes a person can act on themselves. */
const SIGN_IN_ERRORS: Record<string, string> = {
  "auth/popup-closed-by-user": "Sign-in was cancelled.",
  "auth/cancelled-popup-request": "Sign-in was cancelled.",
  "auth/popup-blocked": "Your browser blocked the sign-in window. Allow popups and try again.",
  "auth/unauthorized-domain": "This domain is not authorised for sign-in. Tell an admin.",
  "auth/network-request-failed": "Could not reach Google. Check your connection.",
};

export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSignIn() {
    setStatus("working");
    setMessage(null);

    try {
      const credential = await signInWithPopup(getClientAuth(), googleProvider());
      const idToken = await credential.user.getIdToken();

      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        // Sign out of Firebase too. Leaving the client signed in while the
        // server refused a session is how you get a page that looks signed in
        // and 403s on every request.
        await getClientAuth().signOut();
        setStatus("error");
        // A 500 has no JSON body, so the generic message below is all the user
        // would otherwise get — which reads exactly like a refused account.
        console.error(\`[sign-in] /api/auth/session refused: HTTP \${response.status}\`, body);
        setMessage(
          body.error ??
            (response.status >= 500
              ? "Sign-in is broken on the server, not with your account. Try again shortly."
              : "Could not sign in."),
        );
        return;
      }

      router.replace(next);
      router.refresh();
    } catch (error) {
      setStatus("error");
      const code = (error as { code?: string }).code;
      // Without this, popup-blocked, unauthorized-domain and a genuine network
      // failure are indistinguishable to whoever is debugging — three different
      // fixes behind one message.
      console.error(\`[sign-in] \${code ?? "unknown"}\`, error);
      setMessage(SIGN_IN_ERRORS[code ?? ""] ?? "Could not reach Google. Try again.");
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={handleSignIn}
        disabled={status === "working"}
        className="inline-flex w-full items-center justify-center gap-3 rounded-lg border px-6 py-3 text-sm font-medium disabled:opacity-60"
      >
        {status === "working" ? "Signing in…" : "Continue with Google"}
      </button>

      {message && (
        <p role="alert" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
`;
};
export const signOutButton = (ctx) => {
    const self = "app/hq/SignOutButton.tsx";
    return `"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { getClientAuth } from "${ctx.imp(self, "lib/firebase/client")}";

export function SignOutButton() {
  const router = useRouter();
  const [working, setWorking] = useState(false);

  async function handleSignOut() {
    setWorking(true);
    // Order matters: drop the server session first. If the client signs out
    // first and the request then fails, the cookie outlives the UI state.
    await fetch("/api/auth/session", { method: "DELETE" });
    await getClientAuth().signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={working}
      className="text-xs uppercase tracking-widest opacity-70 disabled:opacity-40"
    >
      {working ? "Signing out…" : "Sign out"}
    </button>
  );
}
`;
};
export const hqSearch = (name) => `"use client";

import { HqSearchDialog } from "morpheus-kit/hq-search/react";

/**
 * The shared interaction and ranking behavior stays in Morpheus. This wrapper
 * is deliberately project-owned: replace these neutral Tailwind classes with
 * the HQ's semantic tokens once its visual system is established.
 */
export function HqSearch({ indexUrl }: Readonly<{ indexUrl: string }>) {
  return (
    <HqSearchDialog
      indexUrl={indexUrl}
      copy={{
        dialogLabel: "Search ${name} HQ",
        emptyPrompt: "Search documents, plans, notes, and roadmap items.",
      }}
      classes={{
        trigger:
          "group flex min-w-[240px] items-center gap-3 rounded-lg border bg-transparent px-4 py-2.5 text-left text-xs shadow-sm transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 max-[700px]:min-w-[160px] max-[700px]:px-3",
        triggerIcon: "opacity-70",
        triggerLabel: "font-medium",
        shortcut: "ml-auto rounded border px-1.5 py-0.5 font-mono text-[10px] opacity-60 max-[900px]:hidden",
        overlay:
          "fixed inset-0 z-[100] overflow-y-auto bg-black/55 px-4 py-[min(12vh,96px)] backdrop-blur-[2px] max-[600px]:px-3 max-[600px]:py-4",
        panel:
          "mx-auto flex max-h-[min(76vh,720px)] w-full max-w-[760px] flex-col rounded-xl border bg-white text-black shadow-2xl dark:bg-neutral-950 dark:text-white max-[600px]:max-h-[calc(100vh-32px)]",
        header: "flex items-center gap-3 border-b px-5",
        input: "min-w-0 flex-1 bg-transparent py-5 text-base outline-none placeholder:opacity-55",
        closeButton: "text-xs uppercase tracking-widest opacity-60 hover:opacity-100",
        content: "min-h-[220px] overflow-y-auto",
        status: "px-5 py-8 text-sm opacity-70",
        results: "divide-y",
        resultLink: "block px-5 py-4 transition-colors hover:bg-black/5 dark:hover:bg-white/5",
        resultHeading: "flex items-start justify-between gap-4",
        resultTitle: "text-sm font-medium",
        resultKind: "shrink-0 text-[10px] uppercase tracking-widest opacity-55",
        resultPath: "mt-1 font-mono text-[10px] opacity-55",
        resultSnippet: "mt-2 text-xs leading-5 opacity-75",
        footer: "border-t px-5 py-3 text-[10px] leading-4 opacity-55",
        icon: "h-4 w-4 shrink-0 fill-none stroke-current",
      }}
    />
  );
}
`;
export const hqSearchBuild = (name) => `import {
  createHqSearchPayload,
  markdownSearchDocument,
} from "morpheus-kit/hq-search/build";

/**
 * The starter document keeps a new HQ's search path executable and testable.
 * Replace or extend this list from the same allowlisted catalogue that renders
 * the project's HQ pages. Never scan private repository files independently of
 * that catalogue: a search result is another way of publishing the document.
 */
const documents = [
  markdownSearchDocument({
    id: "hq:overview",
    title: "${name} HQ",
    href: "/hq",
    path: "hq/README.md",
    source:
      "${name} HQ is the private operating workspace. Access is granted by the allowlist in morpheus.json and applied with morpheus access sync.",
  }),
];

let payload: ReturnType<typeof createHqSearchPayload> | undefined;

/** Built once per process; Vercel prerenders the route once for each deployment. */
export function buildHqSearchPayload() {
  payload ??= createHqSearchPayload(documents);
  return payload;
}
`;
export const hqSearchRoute = (ctx) => {
    const self = "app/hq/search-index/route.ts";
    return `import { gzipSync } from "node:zlib";

import { hqSearchResponseHeaders } from "morpheus-kit/hq-search/build";

import { buildHqSearchPayload } from "${ctx.imp(self, "lib/hq/search")}";

export const dynamic = "force-static";

const WARNING_BYTES = 5 * 1024 * 1024;

export function GET() {
  const payload = buildHqSearchPayload();
  const body = JSON.stringify(payload);
  const compressedBytes = gzipSync(body).byteLength;

  if (compressedBytes > WARNING_BYTES) {
    console.warn(
      \`[hq-search] \${payload.documentCount} documents, \${(
        compressedBytes / 1024 / 1024
      ).toFixed(2)} MB gzip. Review the search architecture.\`,
    );
  }

  return new Response(body, { headers: hqSearchResponseHeaders() });
}
`;
};
export const hqLayout = (ctx, name) => {
    const self = "app/hq/layout.tsx";
    return `import type { Metadata } from "next";
import Link from "next/link";

import { currentUser } from "${ctx.imp(self, "lib/auth/current-user")}";

import { HqSearch } from "./HqSearch";
import { SignOutButton } from "./SignOutButton";

export const metadata: Metadata = {
  title: { default: "HQ", template: "%s · HQ" },
  // Belt and braces with the route gate: nothing under /hq should ever reach an
  // index, including an error page rendered before the gate runs.
  robots: { index: false, follow: false, nocache: true },
};

const NAV = [{ href: "/hq", label: "Overview" }];

export default async function HqLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const searchVersion = process.env.VERCEL_GIT_COMMIT_SHA ?? "dev";

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center justify-between gap-5 px-6 py-5">
          <div className="flex items-center gap-6">
            <Link href="/hq" className="text-xs font-medium uppercase tracking-widest">
              ${name} HQ
            </Link>
            <nav aria-label="HQ" className="flex flex-wrap gap-5">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="text-xs opacity-70">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <HqSearch indexUrl={\`/hq/search-index?v=\${encodeURIComponent(searchVersion)}\`} />
            {user?.email && <span className="hidden text-xs opacity-60 md:block">{user.email}</span>}
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1320px] px-6 py-12">{children}</div>
    </div>
  );
}
`;
};
export const hqPage = (ctx, name) => {
    const self = "app/hq/page.tsx";
    return `import { currentUser } from "${ctx.imp(self, "lib/auth/current-user")}";

/**
 * The first HQ page. It exists to prove the whole chain works end to end —
 * Google sign-in, a session cookie, a verified \`role\` claim — and says so
 * plainly rather than rendering an empty dashboard that cannot be distinguished
 * from a broken one.
 *
 * Everything in §11 of Morpheus's architecture hangs off this route. Add pages
 * beside it; the gate already covers them.
 */
export default async function HqPage() {
  const user = await currentUser();

  return (
    <main className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-medium tracking-tight">${name} HQ</h1>
        <p className="text-sm opacity-80">
          Signed in as <strong>{user?.email ?? "unknown"}</strong> · role{" "}
          <strong>{user?.role ?? "none"}</strong>
        </p>
      </div>

      <p className="max-w-prose text-sm leading-6 opacity-80">
        Access is granted by the allowlist in <code>morpheus.json</code> and applied with{" "}
        <code>morpheus access sync</code>, which writes the same <code>role</code> custom claim that
        Firestore rules read. Add pages under <code>app/hq/</code>; the route gate in{" "}
        <code>proxy.ts</code> already covers them.
      </p>
    </main>
  );
}
`;
};
export const noAccessPage = () => `import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "No access",
  robots: { index: false, follow: false },
};

/**
 * Rendered by a route-gate rewrite for a signed-in user whose role does not
 * include HQ. Redirecting to /sign-in instead would loop: they are signed in.
 */
export default function NoAccessPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-[440px] flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-medium tracking-tight">No access to HQ</h1>
      <p className="text-sm leading-6 opacity-80">
        Your account is signed in but is not on the HQ allowlist. If that is wrong, the allowlist
        lives in <code>morpheus.json</code> and is applied with <code>morpheus access sync</code>.
      </p>
    </div>
  );
}
`;
// ------------------------------------------------------------- a new app ---
export const appPackageJson = (scope, sharedName) => `${JSON.stringify({
    name: `${scope}/web`,
    version: "0.1.0",
    private: true,
    scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
        lint: "eslint",
        typecheck: "tsc --noEmit",
        test: "vitest run",
    },
    dependencies: {
        ...(sharedName ? { [sharedName]: "workspace:*" } : {}),
        next: "16.2.9",
        react: "19.2.4",
        "react-dom": "19.2.4",
    },
    devDependencies: {
        "@tailwindcss/postcss": "^4",
        "@types/node": "^20",
        "@types/react": "^19",
        "@types/react-dom": "^19",
        eslint: "^9",
        "eslint-config-next": "16.2.9",
        tailwindcss: "^4",
        typescript: "^5",
        vitest: "^3",
    },
}, null, 2)}\n`;
export const appTsconfig = () => `${JSON.stringify({
    compilerOptions: {
        target: "ES2017",
        lib: ["dom", "dom.iterable", "esnext"],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "react-jsx",
        incremental: true,
        plugins: [{ name: "next" }],
        paths: { "@/*": ["./*"] },
    },
    include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    exclude: ["node_modules"],
}, null, 2)}\n`;
export const nextConfig = () => `import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
`;
export const postcssConfig = () => `const config = {
  plugins: ["@tailwindcss/postcss"],
};

export default config;
`;
export const globalsCss = () => `@import "tailwindcss";

/*
 * The project's semantic layer belongs here — Morpheus generates primitives
 * only, so nothing above this line names a colour. Point these at the token
 * pipeline (\`morpheus tokens build\`) once the brand package is finalized.
 */
:root {
  color-scheme: light dark;
}

body {
  min-height: 100vh;
}
`;
export const rootLayout = (name, description) => `import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "${name}",
  description: ${JSON.stringify(description)},
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;
export const homePage = (ctx, name, description) => {
    const self = "app/page.tsx";
    return `import { WaitlistForm } from "${ctx.imp(self, "app/WaitlistForm")}";

/**
 * The first page. It asks for one thing — an email address — because a launch
 * page that asks for nothing captures nothing, and the list is the only asset a
 * pre-product site can build.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[720px] flex-col justify-center gap-8 px-6 py-24">
      <h1 className="text-4xl font-medium tracking-tight">${name}</h1>
      <p className="max-w-prose text-lg leading-7 opacity-80">${description}</p>

      <div id="waitlist" className="max-w-[480px]">
        <WaitlistForm source="hero" />
      </div>
    </main>
  );
}
`;
};
export const envExample = (facts) => `# Committed, with no values. The only record of which variables exist —
# without it a new machine finds out by crashing.

# Firebase Admin credentials.
#
# Nothing needs to be set locally: \`gcloud auth application-default login\`
# supplies Application Default Credentials under \`next dev\`.${facts?.workloadIdentity
    ? `
# On Vercel the deployment authenticates through Workload Identity Federation,
# which needs no variable either — Vercel injects the OIDC token itself.`
    : ""}
#
# FIREBASE_SERVICE_ACCOUNT is the escape hatch if federation has to be
# abandoned: the whole service-account JSON blob, on one line.
FIREBASE_SERVICE_ACCOUNT=
`;
/** The `/hq` and waitlist rows a project's README should carry. */
export const readmeSection = (name, hasHq, hasWaitlist) => {
    const rows = [
        hasWaitlist &&
            "| `/api/waitlist` | Email capture. Server-side write; the client never holds Firestore credentials. |",
        hasHq && "| `/sign-in` | Google sign-in for the team. |",
        hasHq &&
            "| `/hq` | Internal dashboard, gated on the `role` custom claim by `proxy.ts`. |",
    ].filter(Boolean);
    return `## Web surfaces

| Route | What |
|---|---|
${rows.join("\n")}

Access to \`/hq\` is the allowlist in \`morpheus.json\`, applied with
\`morpheus access sync\`. The same claim gates the route and the Firestore data —
see [Morpheus §11](https://github.com/cpheinrich/morpheus/blob/main/architecture.md).
`;
};
//# sourceMappingURL=templates.js.map