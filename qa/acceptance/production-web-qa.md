# Production web QA comments

- An opted-in site can mount the shared panel on its current page, switch between Pin
  and Browse, place a comment with keyboard or pointer, and restore ordinary navigation
  on close. The launcher itself can close the panel in Pin mode.
- The panel retains drafts per site, identity and tab. The shared transport schema
  includes a safe path, optional explicit anchor, text and bounded viewport geometry.
  Without evidence enabled, the panel collects no page text, markup, input values or images.
- With `captureEvidence: true`, Chromium and WebKit attach distinct synthetic scrolled
  viewport JPEGs to their matching pins, including visible content at placement, fixed
  and sticky UI, and masks for private/unsupported content and form values. Later page
  changes do not affect the image. Neither the QA UI nor an external asset refresh is
  included in capture. Inspect both engines' images and verify pixels before delivery.
- Each opted-in pin reports capture progress and the reason if unavailable. Send waits
  for progress, not a successful JPEG. Completed screenshots and their date, input,
  browser/version availability, OS, theme and bounded diagnostics survive reload and
  identical retries. A reload during encoding marks capture interrupted, never later.
- The shared schema rejects raw page data and unbounded diagnostics or JPEGs. The
  integration proves private authorized readback and atomic capture writes in the host
  emulator; replay preserves attachment bytes and conflicting retries are refused.
- Only an entitled mount shows the two Factory options. They default to off for each
  new batch and the flag depends on Build and deploy.
- A lost response retries the exact same batch. A first, definite server rejection
  can be corrected. A closed panel cannot overwrite a reopened panel's newer draft.
- Existing loopback web QA tests and the shared package checks pass.
