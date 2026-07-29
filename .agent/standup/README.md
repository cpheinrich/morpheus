# Status archive

One file per status cycle: what I reported, and Chris's inline replies under each `~`.

Naming: `YYYY-MM-DD-HHMM.md`, stamped when archived.

## Why this exists separately from the journal

Three records, three different questions:

| File | Answers | Written by |
|---|---|---|
| `journal/` | What was attempted and learned, including dead ends | Agent, per task |
| `status/` | What was asked and how Chris answered | Both, per cycle |
| `../decisions.md` | Which choices are settled, and why | Distilled from status |

The journal captures *technical* discovery — why the code looks the way it does. The status
archive captures *judgment* — the choices Chris made, which are not derivable from the code
and which an agent would otherwise re-ask or contradict.

## Reading order

**Read `../decisions.md` first, not this directory.** The archive is raw and grows without
bound; the decisions file is the distillation and is meant to stay short. Come here only when
you need the context behind a decision, or to check whether something was already asked.

## Pruning

When the archive gets long, fold anything still load-bearing into `decisions.md` and delete
the old files. The distillation is the point — an agent should never have to read forty status
files to learn that we decided not to publish to npm.
