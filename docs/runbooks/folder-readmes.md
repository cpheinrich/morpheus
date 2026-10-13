# Folder documentation

**Read this when** creating a directory, or deciding whether one needs a `README.md`.

**A folder gets a `README.md` when an agent could plausibly do the wrong thing without it.**
Concretely, when any of these is true:

| Trigger | Example |
|---|---|
| It is an **input to something** | `hq/` feeds the dashboard; `qa/acceptance/` feeds verifier rung 3 |
| It has a **convention filenames do not reveal** | worklog naming, inbox markers, id formats |
| It is **generated**, or partly | `hq/product/goals/README.md`, the role helpers in `firestore.rules` |
| It is a **seam** | shared packages, kit boundaries, anywhere two projects meet |

**Not** for framework-standard directories — `app/`, `components/`, `__tests__/` — whose meaning
is universal. A README restating the folder name is noise that can also go stale.

**Keep them short, and point rather than repeat.** Three lines and a link into `architecture.md`
beats a second copy of the reasoning. Locality is what a README buys: eight lines where an agent
is standing beat 1,400 lines in another repo. Two copies of the same explanation drift, so depth
stays in one place.

This exists because a `/hq` dashboard was built that did not match the folder structure it was
rendering. The explanation existed — in `architecture.md`, in another repo — and the agent never
reached it.

**A tool reads the filesystem, not the README.** If a dashboard derives its sections from prose,
the README has quietly become a config file that looks like documentation, and the two will
disagree. The README explains *intent* to a reader; code reads *reality*.

`morpheus init` scaffolds these for the directories it creates. It is a convention, not a check —
a check that demands a file gets a file, and the result is stubs written to satisfy the check.
