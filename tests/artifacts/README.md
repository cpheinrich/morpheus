# Artifact guard fixtures

These scripts use private temporary files and fake provider children only. Run them
with `python3 -I -S -B`; supported test interpreters are 3.9 and 3.14. The two mutant
scripts alter in-memory modules and require substantive guard failures; never edit
canonical source to run them. Temporary read-only snapshots are restored for cleanup.

`abi_fixture.py` has only fixed synthetic prepare/readback modes for the normal CI
`artifact-abi` job. Its bounded fixture is not delivery evidence. Upload/download
Actions execution occurs only in CI; local tests never contact an artifact service.
