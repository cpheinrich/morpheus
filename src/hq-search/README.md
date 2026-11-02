# HQ search

`morpheus-kit/hq-search` owns the browser-side MiniSearch contract and ranking. The adjacent
subpaths keep surface-specific dependencies out of consumers that do not use them:

- `morpheus-kit/hq-search/build` converts reviewed Markdown catalogue entries into search records
  and serializes an index at build time.
- `morpheus-kit/hq-search/pdf` optionally extracts embedded PDF text. It deliberately does no OCR;
  scanned PDFs remain searchable by filename and path.
- `morpheus-kit/hq-search/react` supplies the lazy-loading, keyboard-accessible dialog. Projects
  provide copy and classes so the HQ retains its own visual system.

The project remains responsible for choosing the source catalogue, mapping each record to its
authenticated route, placing the index endpoint behind the HQ gate, and returning it with a
private cache policy. The browser does not fetch either the index or MiniSearch chunk until search
is opened.

Default ranking puts complete title, path, filename and roadmap-ID matches ahead of token
scores, before the result limit. This keeps an exact punctuated ID lookup on its record even
when inbox prose contains many of the same numbers. Ordinary topic searches still prefer
canonical READMEs over roadmap history. An explicit `sourceWeight` callback replaces this
default ranking policy, including exact-match precedence. Existing version-1 indexes work
without rebuilding their format.
