# Production web QA comments

- An opted-in site can mount the shared panel on its current page, switch between Pin
  and Browse, place a comment with keyboard or pointer, and restore ordinary navigation
  on close. The launcher itself can close the panel in Pin mode.
- The panel retains drafts per site, identity and tab. The shared transport schema
  includes a safe path, optional explicit anchor, text and bounded viewport geometry.
  The panel collects no page text, markup, input values or images.
- Only an entitled mount shows the two Factory options. They default to off for each
  new batch and the flag depends on Build and deploy.
- A lost response retries the exact same batch. A first, definite server rejection
  can be corrected. A closed panel cannot overwrite a reopened panel's newer draft.
- Existing loopback web QA tests and the shared package checks pass.
