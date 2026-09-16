#!/usr/bin/env python3
"""Export one DoclingDocument JSON file as a self-contained, inert HTML reader."""

from __future__ import annotations

import argparse
import os
from contextlib import contextmanager
from html import escape
from pathlib import Path

from docling_core.types.doc import DoclingDocument, ImageRefMode

CONTENT_SECURITY_POLICY = (
    "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"
)
READER_STYLE = """
:root { color-scheme: light; background: #f4f1e9; color: #1b1e1c; overflow-x: hidden; }
* { box-sizing: border-box; }
html { font-size: 17px; }
body {
  width: min(100% - 2rem, 58rem);
  margin: 0 auto;
  padding: clamp(2rem, 6vw, 5rem) 0 8rem;
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.68;
  text-rendering: optimizeLegibility;
  overflow-x: hidden;
}
.page { min-width: 0; max-width: 100%; }
h1, h2, h3, h4, h5, h6 {
  margin: 2.2em 0 0.65em;
  font-family: Georgia, "Times New Roman", serif;
  font-weight: 500;
  line-height: 1.12;
}
h1, h2 { text-wrap: balance; }
p, li { max-width: 76ch; }
img, svg { max-width: 100%; height: auto; }
figure { max-width: 100%; margin: 2.5rem 0; }
figcaption { margin-top: 0.6rem; color: #5d625f; font-size: 0.82rem; }
table {
  width: 100%;
  margin: 2rem 0;
  display: block;
  overflow-x: auto;
  border-collapse: collapse;
  font-size: 0.88rem;
  line-height: 1.45;
}
th, td { padding: 0.5rem 0.65rem; border-bottom: 1px solid #c9c5bb; text-align: left; }
pre {
  max-width: 100%;
  overflow-x: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}
pre code { white-space: inherit; overflow-wrap: inherit; word-break: inherit; }
math { width: 100%; max-width: 100%; display: block; overflow-x: auto; overflow-y: hidden; }
a { color: #245b4a; text-underline-offset: 0.18em; }
@media (max-width: 40rem) {
  html { font-size: 16px; }
  body { width: min(100% - 1.25rem, 58rem); padding-top: 1.5rem; }
}
"""


@contextmanager
def source_directory(path: Path):
    previous = Path.cwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(previous)


def export_html(source: Path, output: Path) -> None:
    source = source.resolve()
    if not source.is_file():
        raise ValueError(f"{source}: Docling JSON is unavailable")
    document = DoclingDocument.load_from_json(source)
    head = (
        '<meta charset="utf-8">'
        f'<meta http-equiv="Content-Security-Policy" content="{CONTENT_SECURITY_POLICY}">'
        '<meta name="referrer" content="no-referrer">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f"<title>{escape(document.name or source.stem)}</title>"
        f"<style>{READER_STYLE}</style>"
    )
    # Docling resolves REFERENCED image paths relative to the current directory,
    # even when the selected export mode embeds them. Run beside source.json so
    # every image becomes part of this one immutable HTML object.
    with source_directory(source.parent):
        html = document.export_to_html(
            image_mode=ImageRefMode.EMBEDDED,
            html_head=head,
        )
    if "<script" in html.lower():
        raise ValueError("Docling HTML unexpectedly contains a script element")
    output.write_text(html, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    export_html(args.source, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
