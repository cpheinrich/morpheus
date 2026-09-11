export const HELP = `morpheus — an operating system for building and running companies

Usage
  morpheus pm validate [--dir <hq/product>]
  morpheus pm index    [--dir <hq/product>] [--check]
  morpheus pm new <roadmap|goals|requests> <title> [--priority P1] [--goal G-2026-Q3-01]
                            [--slug fix-photo-picker] [--issue 123]
                            — name the slug like a branch; derived otherwise
  morpheus pm claim <RM-014>
  morpheus pm claims
  morpheus pm link-issue <RM-014> <123>
  morpheus pm block <MO-051> --needs "<what would unblock this>" [--owner <handle>]
                            [--context "<where it stopped>"]
  morpheus pm unblock <MO-051>
  morpheus pm ship [<MO-020> ...]  [--check]
  morpheus pm migrate-ids   [--check] — integer roadmap ids to the dated scheme (MO-057)
  morpheus check pr    [--dir <hq/product>] [--base origin/main]
  morpheus review prepare   independent local review handoff and worklog template [--base <ref>]
  morpheus review prompt    assemble the rung-2 reviewer prompt for this branch
  morpheus review needed    [--base <ref>] [--prior-review <file>]
                            is this change worth a review, or a re-review?
  morpheus review delivery  [--before-comment-id <id>] [--comment-id <id>]
                            [--body-file <file>] [--pr-body-file <file>]
                            confirm the review was posted; the PR body may
                            carry "review-waived: <reason>" when it was not
  morpheus inbox validate   [--dir <hq/team>]
  morpheus team validate    the roster and every meeting note
  morpheus brand init             [--dir <hq/brand>] [--name <Acme>] [--prefix <ac>]
                            — repair or retrofit the optional brand-vibes scratchpad and moodboard input
  morpheus brand explore          refresh the agent handoff for five concept packages
  morpheus brand finalize --selection "Name"
                            — write the finalization handoff after a concept wins
  morpheus brand migrate          copy legacy answers.md into brand-vibes.md, retaining the original
  morpheus brand build            legacy alias for brand explore
  morpheus brand status           [--dir <hq/brand>] [--name <Acme>]
  morpheus brand check            [--dir <hq/brand>] — required workflow and final package
  morpheus web init         [--project <gcp-project>] [--domain <public-origin>]
                            [--account <google-email>] [--organization <gcp-org-id>]
                            [--vercel-team <slug>] [--no-provision]
                            [--no-waitlist] [--no-hq] [--no-browser]
                            provision the cloud resources, then scaffold the site:
                            a Next.js app, waitlist email capture, and /hq behind
                            Google sign-in. Never overwrites an existing file.
  morpheus web add-consumer-auth  [--staging-project <id>] [--account <google-email>]
                            [--no-provision] [--check]
                            consumer accounts on the two-project stack contract:
                            auth plumbing, policy routes, starter pages, and the
                            three emulator-backed test suites. --check reports
                            drift against the current templates and writes nothing.
  morpheus web status       what the web surface has, and what it is missing
  morpheus access sync      [--project <firebase-project>] [--dry-run]
  morpheus firebase auth setup [--project <firebase-project>] [--domain <public-origin>]
                            [--support-email <email>] [--brand <name>] [--no-browser]
  morpheus firebase auth check [--project <firebase-project>] [--domain <public-origin>]
  morpheus hq rules         --rules-path <path> [--check]
                            — role helpers in the deployed rules file, from the vocabulary
  morpheus hq rules --print print the generated block, to paste into existing rules
  morpheus research-library init --project <firebase-project> --bucket <bucket>
                            configure the immutable private library without touching local books
  morpheus research-library publish <source-directory> --slug <slug> --title <title> --author <name>
  morpheus research-library push|pull|verify|bundle|verify-bundle [arguments]
                            publish, restore, and verify canonical Babel book directories
  morpheus registry list | add [--prefix XX] | remove <name>
  morpheus init             [--name <Acme>] [--prefix XX] [--kind company|personal|internal]
  morpheus init status      [--offline]
  morpheus init done | doing | todo <task-id>
  morpheus tokens build     [--source hq/brand/tokens.json] [--css <path>] [--ts <path>]
                            [--prefix brand] [--check]
  morpheus context refresh  take a receipt — run it after reading the canonical records
  morpheus context check    exit non-zero unless context is fresh; for hooks and scripts
  morpheus context status   what the current lease says, and how old it is
  morpheus context brief    session start: discards the last receipt, says what to read
  morpheus context install  [--check] [--handle <github-handle>]
                            wire .claude/settings.json, .codex/hooks.json and context.handle
                            — the repair path for a project scaffolded before they existed
                            Governed commands (pm claim|new|link-issue|block, access sync) refuse without
                            a fresh receipt. --offline, or MORPHEUS_OFFLINE=1, permits local
                            work on an unverified trunk and still refuses anything external.
  morpheus codebase-memory install [--check]
                            install the pinned official package when absent,
                            configure detected agent clients, enable auto-index
                            and auto-watch, and fully index this exact checkout
  morpheus self check       verify the installed CLI contains current Morpheus main
  morpheus self update      install current main from a disposable clean checkout
  morpheus self install     install this clean current-main checkout as a copied package
  morpheus self ensure      update if consented and stale; used by managed Git hooks
  morpheus self auto-update enable|disable|status
                            manage consented post-pull updates across the local registry
  morpheus doctor           [--all] [--offline]
                            --offline skips project-trunk and Morpheus-main network checks
  morpheus heartbeat        [--ceiling N] [--json] [--dispatch]
                            what should happen next, and whether anything should
  morpheus voice knowledge  the standing explainer, to upload once as project knowledge
  morpheus voice brief ["<topic>"] [--slug x] [--notes "..."] [--full]
                            today's state, to paste into a voice session

Options
  --dir <path>   Product directory (default: hq/product)
  --base <ref>   Base ref for the PR diff (default: origin/main)
  --name <str>   Display name for brand init
  --prefix <str> Two-letter token prefix for brand init
  --project <id> Firebase project id for access and Auth commands
  --domain <url> Public app origin/hostname for Firebase Google sign-in
  --support-email <email> OAuth support email; successful setup records it in morpheus.json
                            (defaults to the recorded value, then active gcloud account)
  --brand <name> OAuth brand name (defaults to the project display name)
  --account <email> Google account to provision as; passed to gcloud explicitly
  --organization <id> GCP organisation that should own a newly created project
  --vercel-team <slug> Vercel team slug, for the Workload Identity issuer
  --no-provision Scaffold only; create nothing in GCP, Firebase or Vercel
  --no-waitlist  Skip email capture
  --no-hq        Skip /hq and Google sign-in
  --no-browser   Do not open browser-backed login or Firebase-console recovery
  --check        Verify indexes are current without writing; exits non-zero if stale
  --offline      Declare the context-freshness offline exception (same as
                 MORPHEUS_OFFLINE=1), and skip the network checks in "init status",
                 "doctor" and "context refresh|check|status" that it would answer
  -h, --help     Show this message
`;

