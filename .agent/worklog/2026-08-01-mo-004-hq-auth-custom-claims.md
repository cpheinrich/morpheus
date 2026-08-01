# MO-004 — /hq auth: Firebase custom claims

2026-08-01, `claude`.

## What the item turned out to be

Half of MO-004 already shipped. `src/access/` and `morpheus access sync` were written before the
item was claimed — the allowlist in `morpheus.json`, the Identity Toolkit calls, revocation of
unlisted users. What did not exist was anything a *project* could import: the item's "gating both
the route and the data from one fact" had no code on the reading side at all.

So the work was the kit half, and the interesting part was not writing it — Darwin's DW-002 is a
working reference and most of this is a generalisation of it — but noticing what the reference was
quietly asking for.

## The comment that became the item

Darwin's `apps/web/lib/auth/roles.ts` carries this:

> This list and the vocabulary above must match Morpheus's `access/schema.ts` exactly — `morpheus
> access sync` writes those strings, and a role this file does not recognise is treated as no role
> at all. `employee`, not `member`.

That is an invariant expressed as a request to the next reader. It has three copies to keep aligned
— the zod enum that writes claims, the TypeScript guard that gates the route, the Firestore rules
that gate the data — and no way to notice when they diverge. A role added on one side and missed on
another grants nothing; a role removed on one side and left on another keeps granting. Neither
shows up at the time.

So `src/hq/roles.ts` holds the vocabulary and everything else derives from it:

- `access/schema.ts` builds its zod enum with `z.enum(ROLES)` rather than restating the strings
- `canAccessHq()` is imported by the route gate
- `renderRoleHelpers()` generates the Firestore functions, and `morpheus hq rules --check` fails CI
  when they drift

The dependency had to be inverted rather than added — `access/schema.ts` previously *owned* `Role`
and `HQ_ROLES`. It now imports them and re-exports for compatibility.

## Decisions worth keeping

**The gate returns a decision, not a `NextResponse`.** Putting Next in the kit pins every project
to one framework and one major version in exchange for reusing about forty lines. `decideHqAccess`
returns `allow | sign-in | no-access` and the project adapts it in fifteen. `no-access` is a
separate case from `sign-in` because redirecting a signed-in investor to the sign-in page loops —
they are already signed in.

**`morpheus-kit/hq` is deliberately absent from the root barrel.** `src/index.ts` re-exports pm,
brand, registry and doctor, all of which reach `node:fs`. An edge middleware importing
`morpheus-kit` would pull the entire CLI into an edge bundle. The subpath export is the entry point
and the root barrel says so in a comment, because the omission looks like an oversight otherwise.

**Only the role helpers are generated, between markers.** Generating the whole `firestore.rules`
would mean every project that adds a collection fights the generator, and a generator people work
around stops being run. Which roles exist is a shared fact; what each collection allows is a
per-project decision.

**Implication is not generated.** Darwin's `isEmployee()` returns true for an admin. The generated
version is exact per role, and `/hq/{document=**}` spells out `canAccessHq()`. A generated helper
that quietly widens who it admits is an authorisation rule nobody wrote down. This differs from
Darwin's current rules, which will need the one-line change when it adopts the generated block.

**`prepare: pnpm build` was missing.** MO-003 settled that projects consume the kit as
`github:cpheinrich/morpheus#main`, but `exports` points into `dist/` and nothing built it on
install. The git dependency could not have worked. One line, and invisible until someone tried.

## The dead end, and it is the useful part

I tried to validate the generated rules with `firebase emulators:exec --only firestore ... 'echo
OK'`, reasoning that the emulator compiles rules at startup. It printed OK, and I nearly wrote that
down as verification.

Then I deleted an operand — `return role() == ;`, which cannot parse — and ran it again. **It still
exited 0.** `emulators:exec` does not fail on rules that cannot compile, and `firestore-debug.log`
recorded nothing either. The check would have passed on any input, including an empty file.

This is exactly the shape in `learned.md`: *a check that skips what is absent will report an empty
thing as correct.* The variant here is a check that never looked. The rule I applied afterwards,
and would apply again: **before trusting a check, break the thing it checks and watch it fail.**

The real harness is `@firebase/rules-unit-testing` — Darwin already had it — which loads the rules
and asserts what they permit. Twelve cases, run against `renderFirestoreRules()` output rather than
a checked-in file, so the generator is what is under test. Verified it can fail by adding
`investor` to `HQ_ROLES` and watching "stops an investor reading hq" go red: a TypeScript constant
changing what Firestore enforces, which is the whole thesis of the item demonstrated end to end.

Cost: `firebase` and `@firebase/rules-unit-testing` as devDependencies, and Java. Kept out of
`pnpm test` for that reason — a default test command that needs a JDK is one people skip.

## Loose ends

- **Darwin should adopt this.** Its `roles.ts`, `session-cookie.ts` and `firestore.rules` are now
  duplicates of kit code, and its `isEmployee()` has the widening described above. Not done here:
  it is a Darwin PR, and consuming `morpheus-kit/hq` needs the `prepare` fix on `main` first.
- **No `init` scaffolding.** `morpheus init` does not write `firestore.rules` or a `proxy.ts`.
  Scaffolding a Next proxy into a repo with no `apps/web` would be wrong, and MO-005 is where the
  app surface actually gets created. Left as the seam rather than guessed at.
- **`pnpm-workspace.yaml` gained an `allowBuilds` block.** pnpm 11 writes placeholder entries for
  packages with build scripts and then fails `pnpm install` while they are unanswered. Both are
  `false` — nothing imports protobufjs's generated types.
