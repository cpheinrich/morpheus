# Function complexity

**Read this when** you change code in a Morpheus project, a complexity finding needs a decision, or
you are enrolling a project or moving the analyzer pin.

## The agent's loop

```sh
morpheus complexity install --check   # once per device; install if it is not operational
morpheus complexity install           # idempotent: pinned Lizard commit + hash-locked wheels
morpheus complexity check             # after each changed function family
morpheus complexity prompt            # the refactoring prompt to use on a finding
```

`check` measures every function whose lines your changes touch since the merge base with the trunk
(`--base <ref>` to choose another): committed, staged, unstaged and **untracked** files, renames at
their new path, and pure deletions (the function around the gap). Code outside every function is
Lizard's `*global*` row and is scored like a function. It prints the verdict, the scope, any change
to the policy, every `exclude`, then each finding. Put that summary (or why it did not run) in the
PR test plan before review; `morpheus review prepare` prints it into the reviewer packet.

Exit codes: **0** passes (advisory always passes), **1** a blocking finding in `enforce`, **2** the
check could not run — no analyzer, a broken venv, no merge base, invalid policy. Never read 2 as a
pass.

`--all` measures every tracked or untracked in-scope file (a baseline inventory); `--json` prints
the full report, including `files[].functions[]`: every function Lizard found in each measured file
(`longName`, `start`, `end`, `ccn`, `cognitive`, `nloc`), flagged or not, with `targeted` true where
the check judged it; `--ci` adds GitHub annotations and a job summary, measures tracked files only (the
CI workspace also holds the workflow's `.morpheus/` checkout of Morpheus), and in `enforce` implies
`--all`.

Locally, routine work never needs `--all`: the targeted `check` is the whole loop, before and after
a refactor. `--all` is for a baseline inventory, before switching a project to `enforce`, and when
moving the pin. Enforcing CI measures every in-scope file anyway, as the backstop.

## Refactoring a finding

Use the canonical prompt, `morpheus complexity prompt`, for every refactor a finding prompts. It
ships with the CLI, so every project reads the same version; change it in Morpheus
(`src/complexity/refactoring-prompt.md`), never in a project copy. Give it the task's inputs, which
its first section lists with defaults. For routine work the declared scope is the function families
your change touches and the acceptance commands are their focused tests; a baseline refactor
declares the project's whole `complexity` scope. Neither needs the whole repository's full suite
unless the task says so.

After each changed family, run `check` again and inspect the whole family by hand: the entry
function, every helper you added or changed, its enclosing function and its tests. A new helper
counts the same as the function it came from. For the before/after metrics the prompt asks for,
save the `check --json` that found the candidate, with its commit and the analyzer pin, before you
edit; run the same `check --json` on the final source; and read the same family's rows from `files`
on both sides. Label the first side "before the refactor", not "before the PR", when your branch
wrote the code. A missing row is unmeasured, not zero: a clean tree's targeted report is empty, so a
cleanup of untouched code needs the candidate report that named it, or reports the before metrics
as unavailable. A `*global*` row is the file's top-level
code, not a family member: keep it out of family totals on both sides and report it separately when
the change moved top-level code. Report the check's summary and the family
metrics for review.

## Policy: `morpheus.json` → `complexity`

Illustrative format only: the example exception is historical, since the current pin includes
Lizard PR 558's enum-case fix (see [Moving the pin](#moving-the-pin)), so do not copy it.

```json
"complexity": {
  "mode": "advisory",
  "ccn": 15,
  "cognitiveWarn": 15,
  "include": ["**"],
  "exclude": ["packages/shared/generated/**"],
  "exceptions": [
    {
      "path": "apps/ios/Evo/Model.swift",
      "longName": "init decoder : Decoder",
      "ccn": 18,
      "kind": "analyzer-false-positive",
      "reason": "Lizard counts each enum case of the nested CodingKeys as a decision.",
      "ref": "https://github.com/terryyin/lizard/pull/558"
    }
  ]
}
```

| Finding | Advisory | Enforce |
|---|---|---|
| CCN over `ccn` in a touched function (all functions under `--ci`) | warning | **error** |
| a file in a language Lizard reads that failed to decode or analyse | warning | **error** |
| exception stale: function gone, ambiguous `longName`, measured CCN above the recorded one, or (under `--all`) its file gone | warning | **error** |
| cognitive over `cognitiveWarn` | warning | warning |
| exception looser than measured, or no longer needed | warning | warning |
| `lizard forgive` / `GENERATED CODE` text (neutralised, file measured in full) | warning | warning |
| a file in a language Lizard does not read (Markdown, Metal, images…) | note | note |
| the `complexity` block changed between the merge base and the head | warning | warning |

**Do not lower the bar to pass.** No suppression comments (they are neutralised anyway), no wider
`exclude` for hand-written code, no raised `ccn`. `exclude` is for generated and vendored code and
is printed in every report. An exception is narrow by construction: one function by path and
Lizard's `longName` (a Swift file has several `init`s), the CCN it covers (growth past it fails),
and a reason plus a reference — an upstream issue or PR for an analyzer false positive confirmed in
the source, or the review or decision for a semantic one. It is evaluated only where its file was
analysed; in a targeted run an untouched file's exception is "not evaluated", never stale. Under
`--all` (and so in enforcing CI) an exception whose in-scope file no longer exists is stale.

**Cognitive complexity is advisory**, with a warning above 15 (SonarSource's long-standing default
for the same metric). It measures nesting and reading effort; CCN counts paths. A high-CCN,
low-cognitive mapping is still over the CCN limit: refactor it or record a semantic exception.

## Enrolment

In CI only `advisory`, written or defaulted by an absent `mode` key, is non-blocking. Any other
`mode` value (a typo such as `Enforce`, an empty string, `null`, `false`, a number), a `complexity`
value that is not an object, or a `morpheus.json` that cannot be parsed is treated as enforcing, and
the invalid policy then fails the step rather than leaving a project believing it enforces. Only an
absent block or manifest means not enrolled.

A new project's manifest starts `advisory`. An existing project enrols with a reviewed edit to its
own `morpheus.json`; nothing here enrols other repositories. CI runs inside the required `pr /
conventions` job, so enforcing needs no branch-protection change. Before switching a project to
`enforce`, run `morpheus complexity check --all` on the exact tree that will merge: the enrolled
scope must already be within the limit, or every unrelated PR goes red.

Symlinks are never followed (Git stores a link, not the file), so a changed symlink is a note.
Coverage limits are reported, not hidden: shell, Metal, Firestore rules, inline HTML scripts and
other languages Lizard does not read are listed as notes.

## Moving the pin

`src/complexity/pin.ts` names the Lizard repository, commit, the tag or branch that keeps it
reachable (never one that is rewritten), and exact wheel hashes for `pygments` and `pathspec`, which
Lizard imports at load. A move reaches every consumer's CI at once, because they call
`pr-check.yml@main`. Before merging one, run `morpheus complexity check --all` with the new pin on
each enforcing consumer, and update `CANARY_EXPECTED` only if the canary's measurement legitimately
changed. Every status check proves the install three ways: the checkout is the pinned commit with no
local modification, Python loaded Lizard from that checkout, and the canary files (JavaScript, plus
Swift, TSX, JSX and TypeScript that exercise the pinned parser fixes) measure exactly as recorded.
Tests install the previous pins and assert the canary refuses each, so a pin move whose canary would not
notice a regression back fails.

The current pin is the `cpheinrich/lizard` tag `morpheus-analyzer-2026-11-06-jsx-text-slash`
(`b57041bf`): upstream master `4f6979da` plus open upstream PRs 556 (Swift computed and closure
properties), 558 (enum cases), 559 (string interpolation), 560 (JSX text, at `d2d52d9`) and 562
(template literal types inside TypeScript interface and object-type bodies, which earlier builds
read as closing the body, folding every later function in the file into `*global*`). Return to plain
upstream once all five merge. PR 560's later commits also read three JSX attribute forms inside
children: a spread (`{...x}`) and a hyphenated name (`data-state`, `aria-hidden`), fixed at
`bb9efad`, and a valueless attribute after a braced one (`margin={{ top: 6 }} accessibilityLayer`),
fixed at `24c6ff3`. Earlier pins abandoned the tag there, ran the enclosing function on past its end
and dropped the functions after it. At `d2d52d9` a slash in JSX text (`At 9% / 11%`) no longer
swallows the next closing tag: Lizard's regex pre-scan is not JSX-aware and read `/ 11%</th` as a
regex literal, which unbalanced the elements once PR 560 read children as text. In `.jsx` and `.tsx`
a literal may now not end at a `<` that starts a closing tag; JavaScript and TypeScript are
unchanged, and a real regex such as `/</g` is still read as one. The canary's `attributes.*`,
`valueless.*` and `slash-text.*` files record line bounds as well as CCN for that reason. Known
forms still misread: an element used directly as an attribute value without braces (`icon=<i />`)
loses the functions after it; a `key={...}` attribute ends an enclosing expression-bodied arrow early
(the canary's `rows.map` arrow measures one line); a valueless attribute literally named `extends`
is read as a TypeScript type parameter; a valueless attribute is only recognised where an expression
is expected; and in `.jsx`/`.tsx` an unescaped `/a</b>/` is not read as a regex (a valid literal must
escape that slash anyway). The list is what has been found, not a proof that no other form misreads.

The previous pin, `541623c0` (`-jsx-boolean`), has the slash fault. On Lakina it made
`SaasBottomUp.tsx` `CompanyDetail` measure 99–184 at CCN 17 and dropped `SaasBottomUp`. At
`b57041bf` the real file measures `CompanyDetail` 99–156 at CCN 14 and `SaasBottomUp` 158–184 at
CCN 4. Lakina still has functions with misread bounds at this pin (`marketCells` absorbs six DCF
helpers, each at most CCN 15 alone), so the fix is bounded, not complete. Older tags (`morpheus-analyzer-2026-11-06`
at `7f14ea5`, `-ts` at `484bbd05`, `-tsx` at `3b53c116`, `-jsx-boolean` at `541623c0`) stay in place
and are never moved. Python 3.9 is the floor both wheels declare; a test holds the pin to it.
