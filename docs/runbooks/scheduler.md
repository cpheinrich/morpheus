# Repository-owned schedules

**Read this when** adding, moving or debugging a recurring run, enrolling a repository with the
shared scheduler, or wiring its host timer or GitHub backup. Design: [`architecture.md` §7.15](../../architecture.md#715-repository-owned-schedules).

Each repository declares its recurring runs in `.morpheus/schedules.json` on its default branch.
A host timer runs `morpheus scheduler tick` every minute; a GitHub-hosted backup runs the same
tick with `--backup` every 15 minutes. Both submit `workflow_dispatch` to the repository's own
workflow, and that workflow's first job runs the admission guard. **A dispatch is not a delivery**:
the scheduler's job ends when GitHub accepts the run. Whether the work succeeded is the receiver's
evidence, as it always was.

## The registry: `.morpheus/schedules.json`

```json
{
  "schemaVersion": 1,
  "schedules": [
    {
      "id": "nightly-release",
      "workflow": "nightly.yml",
      "cron": "0 3 * * *",
      "timezone": "America/New_York",
      "inputs": { "lane": "full", "dry-run": false }
    }
  ]
}
```

- `id` — stable, lower-case words joined by single hyphens, at most 64 characters. It is the
  occurrence identity, so renaming it starts a new schedule.
- `workflow` — a file in `.github/workflows/` of the same repository. The registry never names
  another repository.
- `cron` — five fields, read by [Croner](https://github.com/hexagon/croner) 11.0.0 in `timezone`
  (an IANA name). A spring-forward gap runs at the first valid minute after it; a fall-back
  repeat runs once.
- `inputs` — optional strings, booleans or numbers passed through. `scheduler-id` and
  `scheduled-for` are reserved.
- `"schedules": []` is valid; Morpheus's own registry is empty.

## The receiver workflow

The scheduler adds `scheduler-id` and `scheduled-for` (a UTC instant such as
`2026-11-03T08:00:00Z`) to the inputs. The workflow must accept both, put them in its `run-name`
with exactly the suffix ` [schedule:<id>:<instant>]`, and serialize its whole runs:

```yaml
name: Nightly
run-name: "Nightly${{ inputs.scheduler-id && format(' [schedule:{0}:{1}]', inputs.scheduler-id, inputs.scheduled-for) || '' }}"
on:
  workflow_dispatch:
    inputs:
      scheduler-id: { type: string, required: false, default: "" }
      scheduled-for: { type: string, required: false, default: "" }
concurrency:
  group: nightly           # one channel; whole runs, never cancelled in progress
  cancel-in-progress: false
permissions:
  contents: read
  actions: read            # the guard reads this workflow's run history
jobs:
  admission:
    runs-on: ubuntu-latest
    outputs:
      admitted: ${{ steps.guard.outputs.admitted }}
    steps:
      - id: guard
        name: Scheduler guard  # anything except "Scheduler admission"
        uses: cpheinrich/morpheus/.github/actions/scheduler-admit@main
        with:
          scheduler-id: ${{ inputs.scheduler-id }}
          scheduled-for: ${{ inputs.scheduled-for }}
      - name: Scheduler admission  # the marker: exactly this name
        if: steps.guard.outputs.admitted == 'true'
        run: echo admitted
  work:
    needs: admission
    if: needs.admission.outputs.admitted == 'true'
    # ... the existing jobs, with their existing eligibility and receipt checks ...
```

The tick refuses to dispatch to a workflow whose file lacks a `run-name:` line containing
`[schedule:` or either input name: without the suffix its runs are invisible to history and every
tick would dispatch again.

### What `morpheus scheduler admit` decides

`admit --scheduler-id <id> --scheduled-for <instant>` reads `GITHUB_REPOSITORY`, `GITHUB_RUN_ID`,
`GITHUB_RUN_ATTEMPT` and `GH_TOKEN`, writes `admitted=true|false` to `GITHUB_OUTPUT`, and exits 0
for either answer. It exits non-zero — and admits nothing — when:

- only one of the two inputs is present, the id is malformed, or the instant is not canonical;
- this run's name does not end with the suffix for those inputs;
- the guard step itself is named `Scheduler admission`;
- any history page is unreadable or truncated.

Both inputs empty is a manual run: admitted, with no history read. The workflow's own eligibility
rules still apply to it.

Otherwise the run is turned away when an earlier attempt of this run, or any other run of this
workflow with the same suffix, has a **successful `Scheduler admission` step**. Only an admission
consumes an occurrence: a duplicate cancelled while queued, or one the guard turned away (its marker
is skipped), consumes nothing, and an admitted run whose later work failed has still spent it.

**What this is not.** History plus whole-run serialization makes the second run of an occurrence see
the first one's marker; it is not exactly-once and not an atomic claim on any external effect. Keep
the receiver's existing domain receipts and idempotency checks. Without the `concurrency` group two
duplicates can be admitted at once.

The action installs Morpheus's locked production dependencies at the action's own ref and sets up
Node 22 for the rest of that job, which is one reason to keep it in its own first job.

## The host config

Private to the host; it lists repositories, never job definitions:

```json
{
  "schemaVersion": 1,
  "repositories": ["example-org/example-app"],
  "instanceId": "scheduler-primary",
  "statusPath": "scheduler-status.json",
  "githubAccount": "example-bot"
}
```

- `statusPath` — optional; relative to the config file's directory. Default `scheduler-status.json`.
- `githubAccount` — optional. When set, the tick runs `gh auth token --user <account>` with any
  ambient `GH_TOKEN`/`GITHUB_TOKEN` removed. Otherwise it uses `GH_TOKEN` (or `GITHUB_TOKEN`). No
  credential is an error. The token stays in the process; it is never printed or written.
- The token needs, on every enrolled repository: metadata and contents read, and actions write
  (read runs, submit dispatches).

## Commands

```sh
morpheus scheduler tick --config <host.json>            # primary: dispatch due slots, write status
morpheus scheduler tick --config <host.json> --backup   # backup: dispatch only overdue slots
morpheus scheduler tick --config <host.json> --dry-run  # real reads, no dispatch, no status write
morpheus scheduler status --config <host.json>          # health JSON; exit 0 healthy, 1 otherwise
```

`tick` exits 1 when any repository or schedule recorded an error, so the backup's run turns red.
Prerequisites: Node 22 or later, and a production install of Morpheus from its lockfile:

```sh
git clone --depth 1 https://github.com/cpheinrich/morpheus.git morpheus-scheduler
cd morpheus-scheduler && npx --yes pnpm@11.9.0 install --prod --frozen-lockfile --ignore-scripts
node dist/cli/index.js scheduler tick --config /path/to/host.json --dry-run
```

## What a tick decides

Per enrolled repository, in order, each failure isolated to that repository (or that schedule):

1. Read the default branch, `.morpheus/schedules.json` on it, and the commit time of that file —
   the **activation baseline**. A missing registry, an unreadable repository and a 401/403/404 are
   errors, never "no schedules".
2. The **due slot** is the latest occurrence at or before now, and only if it is not before the
   baseline. Older missed slots are never replayed: catching up dispatches the latest one only.
   Editing the registry therefore forgoes catch-up of slots due before the edit.
3. Read every page of the workflow's `workflow_dispatch` runs created since an hour before the
   slot and match their names to the suffix. Any run for the slot — failed, cancelled or
   successful — means it was **accepted**; the next slot is unaffected.
4. **Primary** dispatches an unaccepted due slot. Its own last submission is kept in the status
   file: a confirmed one is not resubmitted while history catches up; a lost response (timeout,
   5xx, no run details) waits five minutes for the run to appear, then resubmits — the guard
   absorbs a duplicate.
5. **Backup** finds the newest slot at least 30 minutes old. If neither it nor any later slot was
   accepted, the primary is not running, and the backup dispatches the *latest* slot. Looking back
   from the past-grace slot is what lets it notice a dead primary for a schedule that runs more
   often than every 30 minutes. It does not read the primary's status file.
6. Before submitting: a missing workflow is an error, a disabled one is `skipped`, and a workflow
   without the scheduler inputs and suffix is an error. The submission requests
   `return_run_details` and records the run id and URL.

A lock beside the status file stops a manual tick overlapping the timer's.

## Status and health

The status file is replaced atomically after every non-dry tick:

| Field | Meaning |
|---|---|
| `schemaVersion`, `schedulerVersion`, `instanceId`, `mode` | what wrote it |
| `tick.startedAt`, `tick.finishedAt`, `observedAt` | when; `observedAt` is the freshness clock |
| `ok`, `errors` | whether any repository or schedule failed |
| `repositories[]` | `repository`, `ok`, `defaultBranch`, `activatedAt`, `error` |
| `repositories[].schedules[]` | `id`, `workflow`, `dueAt`, `outcome`, `reason`, `runId`, `runUrl`, `error`, `lastDispatch` |

`outcome` is one of `idle` (no slot since activation), `accepted`, `waiting` (backup within grace,
or a lost response settling), `planned` (dry run), `dispatched`, `uncertain`, `skipped` (workflow
disabled) or `error`. `scheduler status` is healthy when the last tick finished within 3 minutes
(20 for a backup status) and recorded no error. Health is about the scheduler: a red receiver run
is the receiver's failure, visible in its own history.

## Host timer and backup

The host's timer and the backup workflow are owned with the host operations, not here. What they
must provide:

- **Primary** — run the tick every minute with an absolute Node path and config path. A macOS
  LaunchAgent with `StartInterval` 60 never overlaps itself; it runs only while its user is logged
  in, not from boot.
- **Backup** — a scheduled workflow in a private repository, every 15 minutes, with its own copy of
  the enrolled list and its own token in `GH_TOKEN`; it checks out Morpheus `main`, installs as
  above, and runs `tick --backup`. Give it `concurrency` with `cancel-in-progress: false`.

## Migrating an existing cron

In one PR in the receiving repository: add the inputs, `run-name`, `concurrency` and admission job
above; add the registry entry; and remove the workflow's `on.schedule`. Then add the repository to
the host config and backup list. The baseline is the merge's commit time, so nothing older replays.
A `dry-run` tick shows the next `dueAt` before anything is submitted.
