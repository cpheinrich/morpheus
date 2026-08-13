---
date: 2026-08-13
roadmap: MO-26-08-13-09.57.08
outcome: shipped
---

# Website initializer — `morpheus web init`

## What was actually missing

The question was "is there a website initializer, and does it provision GCP, Firebase and
Vercel". The answer to both was no, and the second no was *deliberate* — §12.11 states that
`init` provisions nothing so it can never be blocked on a token. That made the shape of this work
a design question rather than a gap to fill, and Chris settled it: a separate `morpheus web init`.

Worth recording because the opposite conclusion was available and would have been wrong. Folding
provisioning into `init` would have broken a property that exists for a reason — `init` is run
routinely on established repositories to bring them up to standard, and a version of it that
shells out to `gcloud` fails on a machine with no Google session.

## The order is the design

Provision first, scaffold second. The reason is narrow and load-bearing: `apiKey` and `appId`
cannot be derived from a project id, so the web config has to be *read* from Firebase. A scaffold
that ran first would have to write placeholders, and a `/hq` sign-in page with a placeholder
`firebaseConfig` compiles, deploys, renders, and cannot work. That is the exact shape `learned.md`
records four times — a check that skips what is absent reports the empty thing as correct.

So: no Firebase project, no waitlist and no `/hq`. Both are skipped and reported instead.

## Absence and refusal are different answers

The provisioner reads `gcloud projects describe` to decide whether to create a project. A
permission error is *not* evidence that a project does not exist — it is evidence we cannot tell,
and `dh-evo` returns exactly that under the wrong gcloud account, which is the state this machine
was in when the work started. Creating on that basis makes a duplicate project under the wrong
identity, and there is no clean undo. Only a `NOT_FOUND` leads to a create; anything else is
`blocked` with the reason attached.

## Three tests I wrote were passing for no reason

Caught on a re-read, and all three were the failure `learned.md` calls *a test can pass for a
reason you did not write*:

1. A `expect(x).toBe(true ? x : false)` that asserts nothing at all.
2. The Terms-of-Service test scripted `projects:list` to *include* the project, so
   `projects:addfirebase` was never called and the 403 path never ran. Fixed by returning an empty
   list, so the call happens and the assertion is on the wrapped message.
3. A rules-placement assertion comparing an index against `lastIndexOf(...) + rules.length`, which
   is always true. Replaced with the real property: the block sits inside the database match scope,
   above the catch-all, and the braces still balance.

The second is the instructive one. It looked like a test of error handling and was a test of the
fixture.

## Styling is not a small decision

Templates use Tailwind core utilities only — `border`, never `border-line`. §12.1 puts the
semantic layer in each project, and Darwin's components are written against `text-ink`,
`bg-surface`, `border-line`. Copying them verbatim would have produced components that render
unstyled in Evo while looking finished in the diff.

## Dead ends

- **Generating tests in one runner.** Darwin uses vitest; Evo runs `node --test` with `.test.mjs`
  and has no vitest at all. Emitting vitest tests would mean the scaffold adds a dependency to
  make its own output pass. Solved by defining a two-line `eq` helper per runner and sharing one
  test body — the detection is the app's own `package.json`.
- **`@/` aliases assumed rather than detected.** Both Darwin and Evo declare `@/*`, and assuming
  it would have worked for them and shipped non-compiling files to the first project without one.
  `importPath` falls back to a computed relative specifier.
- **Analytics import in the generated form.** Darwin's form captures `waitlist_joined` through its
  own PostHog module. A scaffold cannot import that — the event belongs to the project's
  vocabulary — so the form takes an `onJoined` callback and a note says to wire it.

## Verified against a real project, and it found two defects

The templates typechecked in Morpheus's own suite and were still wrong in two ways that only a
real checkout could show. Both were found by scaffolding into a throwaway worktree of Evo, running
`tsc`, `node --test` and `next build`.

**1. The generated test could not resolve its own import, twice.** First `@/lib/waitlist/record` —
`@/` is a tsconfig-paths alias that Next resolves and `node --test` reads as a package name
(`Cannot find package '@/lib'`). Made relative, it then failed again on `Cannot find module
.../record`, because node ESM wants a real extension and `tsc` rejects a `.ts` specifier without
`allowImportingTsExtensions`. The answer was in the project already: Evo's own tests are `.mjs`
importing `./thing.ts`, and its tsconfig `include` lists `**/*.mts` but not `**/*.mjs`, so they run
without being typechecked. A vitest project keeps the `.ts` test.

The general form: **every other generated file is resolved by the bundler, and a test run directly
by node is not.** One file, one different resolver, and the template treated them alike.

**2. Evo is `output: "export"`.** A static export builds HTML and nothing else — no route handlers,
no route gate, no server rendering. Everything server-side here compiles and then fails
`next build` with `export const dynamic = "force-dynamic" ... cannot be used with "output: export"`.
`web init` now detects it and writes nothing, because the fix is a decision about how the site
deploys and that is not a scaffold's to take.

Worth stating plainly: **the Morpheus test suite passed at every point during both defects.** A
scaffold's output is code in someone else's project, and the only test of it is being that code.
