---
roadmap: MO-26-10-12-12.21.28
---
# Keep comment QA changes together

Verified #363 against both skill copies, the generated template and QA_GUIDE. Moved the session
boundary before the procedural short form and to the guide's first section. It explicitly keeps
batches on one claimed branch with local commits, defers push/PR/review/CI until the person ends
the session, and requires notice before rebuilding, relaunching, reloading or navigating.

Used skill-creator guidance for a narrow correction to the existing skill. No new behavioral
unit test for a prose-only change: the existing skill/template consistency checks protect
scaffold propagation, and independent review assesses the operative instructions. Graph transport
and coverage calls failed, so exact source/template/tests were inspected directly.

Validation: frozen install;149 focused tests across qa-preview/init/qa-web; typecheck,compile,pm index,lint,inbox and diff checks passed. Both skill folders passed skill-creator quick_validate using uv with PyYAML (system and bundled Python lacked yaml). Merged current main before review; full pnpm test passed2110tests/75files in66.32seconds. No UI behavior changed, so no simulator/browser session was needed.
