# MO-26-09-25-08.59.44 — Simulator shutdown race

Cross-project review of local wrappers found the shared CI helper had the same shutdown-before-delete coupling. If XCTest transitions a device to Shutdown after inventory, simctl shutdown may reject an already-shutdown device and skip deletion. The action now warns on shutdown failure, still attempts deletion, and treats deletion failure as the actual cleanup failure. Exact ownership and both device sets are unchanged.

Validation: focused Node tests cover both device sets, preserving unrelated devices, failed deletion and continued cleanup. Full Morpheus tests/typecheck/compile are run before merge. This changes only the action error path and does not require an app build. No new package; existing Apple simctl boundary.
