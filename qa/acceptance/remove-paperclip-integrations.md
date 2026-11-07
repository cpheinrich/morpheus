# Remove active Paperclip integrations

- Internal Factory `pool.*` / `hq.*` dispatch rejects; all six direct `factory_*` operations
  keep their routing, gateway, permission, worktree and process ownership contracts.
- Dedicated pool runner/config/store/controller modules, pilot/bridge/HQ executables and HQ
  workflow are absent. Retired CLI commands refuse without starting a service.
- Workflow-repair cannot launch provider workers or call Paperclip. Offline grading remains.
- Frozen agent-stack manifest and inputs verify unchanged. Tracked `.agent/paperclip*` records
  and their append-only validation workflow remain intact; closeout tools stay offline-only.
- Current architecture/navigation and mirrored generated skills reflect retirement; host planner
  and generic CI/Xcode pools plus read-only reporting remain.
- Typecheck, focused repository tests, generation, complexity, Factory plugin check/full suite,
  optional host focused checks and source audit pass.
- Deliver an unlabelled draft PR and exact-head review packet. Controller coordinates independent
  review, protected CI/merge and installation; no runtime stop/install/configuration changes here.
