# MO-26-10-25-03.13.21 — bounded optional native diagnostics

Evo delivery staging-20261020000000000 run40168456839 succeeded at test execution
but screenshot admission exceeded the stored-byte bound. That artifact failure
then selected full failure evidence, which also exceeded the bound. The existing
all-selected barrier correctly refused publication. Independent diagnosis and
strategy analysis confirmed mandatory metadata already admitted (27 files,
4,750,712 raw bytes,10,663,804 stored upper bound).

Repair confines deterministic whole-file selection to optional screenshot/failure
channels, reports all omissions in the bounded payload, preserves atomic result
bundles and full source-census mutation checks, and captures native failure before
artifact staging. Mandatory qualification and uploader limits remain unchanged.
This is domain-specific extension of the existing stdlib staging implementation.

Funding independently checked against the native ledger: paidId
`evo-ordinary-native-artifact-upstream-20261025`, digest
`a724709d48ea9ada23aabc082a84a13c233e04e9234fe64cd161cf4412b6c35b`,
maximum10,000,000micros, reserved. Covers this upstream repair cycle only,
at most7fullCI+4metadataCI groups. Consumer has separate reservation.
No deployment, full CD qualification, or receipt is asserted.

Focused validation: `python3 tests/artifacts/test_stage.py`:23 passing,
including oversize omission, mandatory rejection, atomic bundles, omitted-file
mutation and report-only accounting. Independent source review pending.
