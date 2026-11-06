# Function complexity

**Read this when** you change code in a Morpheus project, a complexity finding needs a decision, or
you are enrolling a project or moving the analyzer pin.

## The agent's loop

```sh
morpheus complexity install --check   # once per device; install if it is not operational
morpheus complexity install           # idempotent: pinned Lizard commit + hash-locked wheels
morpheus complexity check             # after each changed function family
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
the full report; `--ci` adds GitHub annotations and a job summary and, in `enforce`, implies `--all`.

## Policy: `morpheus.json` → `complexity`

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
Swift and TSX that exercise the pinned parser fixes) measure exactly as recorded.

The current pin is the `cpheinrich/lizard` tag `morpheus-analyzer-2026-11-06`: upstream master
`4f6979da` plus open upstream PRs 556 (Swift computed and closure properties), 558 (enum cases),
559 (string interpolation) and 560 (JSX text). Return to plain upstream once all four merge. Python 3.9 is the floor both wheels declare; a test holds the pin to it.
