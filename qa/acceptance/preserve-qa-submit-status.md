# Preserve QA submission confirmation

- A legacy cleanup retry after successful batch acknowledgment leaves the Queued confirmation and the explicit storage warning visible together.
- Leaving the affected route clears the legacy warning while preserving the Queued confirmation and its success styling.
- Cleanup failure does not duplicate a batch POST or replay sent/deleted pins after reload.
- The regression waits for an actual failed cleanup attempt after the acknowledged draft becomes empty, without a fixed sleep.
- Focused Chromium/WebKit and QA unit checks pass, with final warning/cleared screenshots inspected by author and independent reviewer; full CI passes before protected merge.
