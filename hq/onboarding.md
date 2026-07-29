# T — setup

**9 of 9 required steps done.** Regenerate with `morpheus init status`.

Nothing here is sequential and nothing is lost if you stop halfway — that is the whole point. Do
them in any order, over as many days as it takes.

Steps marked `detected` are checked by reading the repository, so their boxes are rewritten every
run; ticking one by hand will be undone. Everything else is yours: set `[x]` when done or `[~]`
while in progress, and write notes underneath — an account id, who to ask, why it is blocked. Notes
are preserved.

Keep the `<!-- morpheus:task ... -->` comments; they are how the file is read, and they are
invisible when the markdown is rendered.


## Repository

<!-- morpheus:task manifest -->
- [x] **morpheus.json with a name, prefix and kind** — `detected`
  The prefix namespaces every id. Without it, two projects' MO-001s collide.
  <br>*How:* morpheus registry add --prefix XX
  <!-- morpheus:notes -->

<!-- morpheus:task agents-md -->
- [x] **AGENTS.md, with CLAUDE.md symlinked to it** — `detected`
  One file so Claude and Codex read the same instructions rather than two that drift.
  <br>*How:* Write AGENTS.md, then `ln -s AGENTS.md CLAUDE.md`
  <!-- morpheus:notes -->

<!-- morpheus:task agent-records -->
- [x] **.agent/ records: decisions, learned, worklog, inbox-archive** — `detected`
  Git history cannot hold a dead end that produced no code, and that is the expensive knowledge.
  <br>*How:* morpheus doctor names whichever are missing
  <!-- morpheus:notes -->

<!-- morpheus:task registry -->
- [x] **Registered on this machine** — `detected`
  Prefix collisions are caught at registration; discovering one later means renaming every id.
  <br>*How:* morpheus registry add — from the project root
  <!-- morpheus:notes -->

## CI and protection

<!-- morpheus:task workflows -->
- [x] **CI delegates to the Morpheus reusable workflows** — `detected`
  Improving CI everywhere becomes one commit here rather than a change in every repo.
  <br>*How:* uses: cpheinrich/morpheus/.github/workflows/node-ci.yml@main
  <!-- morpheus:notes -->

<!-- morpheus:task pm-check -->
- [x] **pm and PR convention checks run in CI** — `detected`
  Instructions get ignored eventually; a failing check does not.
  <br>*How:* Add the pm-check.yml and pr-check.yml reusable workflows
  <!-- morpheus:notes -->

<!-- morpheus:task branch-protection -->
- [x] **main is protected, with agent self-merge allowed** — `detected`
  Nothing reaches main unreviewed, and agents still merge their own green PRs unattended.
  <br>*How:* Settings → Branches → add a rule for main requiring status checks
  <!-- morpheus:notes -->

<!-- morpheus:task actions-secrets -->
- [ ] **Deploy and API secrets set in GitHub Actions** *(optional)* — `detected`
  A workflow that needs a secret it does not have fails at the least convenient moment.
  <br>*How:* gh secret set NAME — do this once at setup so no agent has to ask you for a token later
  <!-- morpheus:notes -->

## Product

<!-- morpheus:task goal -->
- [x] **At least one goal written down** — `detected`
  A roadmap with no goal is a list of work nobody can decline.
  <br>*How:* morpheus pm new goals "Ship the thing by Q4"
  <!-- morpheus:notes -->

<!-- morpheus:task roadmap -->
- [x] **At least one roadmap item** — `detected`
  The board is how agents pick up work without being told what to do.
  <br>*How:* morpheus pm new roadmap "First thing to build"
  <!-- morpheus:notes -->
