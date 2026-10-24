# Artifact guard fixtures

These scripts use private temporary files and fake provider children only. Run them
with `python3 -I -S -B`; supported test interpreters are 3.9 and 3.14. The two mutant
scripts alter in-memory modules and require substantive guard failures; never edit
canonical source to run them. Temporary read-only snapshots are restored for cleanup.

`abi_fixture.py` has only fixed synthetic prepare/readback modes for the normal CI
`artifact-abi` job. Its bounded fixture is not delivery evidence. Upload/download
Actions execution occurs only in CI; local tests never contact an artifact service.

Receipt regressions cover two apps in one run, immutable first payloads, successful and
refused same-directory duplicates, output drift and invalid roots. A legacy-leaf mutant
must fail that real two-invocation regression. Audit-link regressions include actual
local CLI refusal with no output commands, spent refusal and genuine optional absence.
