"""Measure files with the pinned Lizard and print one JSON document.

Usage (from the repository root, with the pinned venv's interpreter):
  python -I lizard_runner.py --lizard <checkout>  < paths.json
  python -I lizard_runner.py --lizard <checkout> --canary

stdin is a JSON array of repository-relative paths. Python 3.9 or newer; the
standard library plus Lizard's own dependencies in the venv.

Lizard honours two in-source suppressions that silently remove code from its
results: a "lizard" + " forgive" comment drops the next function, and a comment
containing "GENERATED" + " CODE" stops analysis of the rest of the file. Each hit is
rewritten with a same-length, newline-free substitute before analysis, so every
line keeps its number and the whole file is measured; the hit is reported.
"""
import argparse
import json
import os
import re
import sys

# Spelled in pieces so this file does not report itself.
DIRECTIVE = re.compile("lizard" + " forgive|GENERATED" + " CODE")

# JSX spread attributes ({...x}) and hyphenated attribute names inside children (PR560 at bb9efad),
# measured as both .tsx and .jsx. 484bbd0 runs Grid on to line 15 and measures neither Card nor after.
ATTRIBUTES = """function Row(props) {
  return <i {...props} />;
}
function Grid({ rows, extra, open, k }) {
  return (
    <div>
      <Row {...extra} />
      <Row {...(open ? extra : rows)} />
      <table><tbody><tr><td key={k} data-state={open && 'on'}>x</td></tr></tbody></table>
    </div>);
}
function Card({ r, href }) {
  return <ul>{r ? <li><a href={href}>Open the result <span aria-hidden="true">↗</span></a></li> : null}</ul>;
}
function after(x) { if (x) { return 1 } return 2; }
"""

# A valueless JSX attribute after a braced one (PR560 at 24c6ff3), measured as both .tsx and .jsx.
# 3b53c11 runs Chart on to line 10 and measures no after.
VALUELESS = """function Chart({ data, wide }) {
  return (
    <div>
      <chart margin={{ top: 6 }} accessibilityLayer>
        <axis data={data} hide />
      </chart>
      <label x={1} flag>{wide ? 'wide' : 'narrow'}</label>
    </div>);
}
function after(x) { if (x) { return 1 } return 2; }
"""

# A slash in JSX text (PR560 at d2d52d9), measured as both .tsx and .jsx. The regex pre-scan reads
# `/ 11%</th` as a literal, swallowing the closing tag: 541623c runs Rates on to line 9 (CCN 4) and
# measures neither escape nor after. escape keeps a real regex containing `<` (`/</g`).
SLASH_TEXT = """function Rates({ rows }) {
  return (
    <table>
      <thead><tr><th>At 9% / 11%</th><th>Share (/ total)</th><th>like-for-like</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.id}><td>{r.ok ? 'yes' : 'no'}</td></tr>)}</tbody>
    </table>);
}
function escape(s) { return s.replace(/</g, '&lt;').replace(/>/g, s && '&gt;'); }
function after(x) { if (x) { return 1 } return 2; }
"""

# Known measurements of the pinned build (pin.ts CANARY_EXPECTED). The Swift, TSX and TS files exercise
# the fork's fixes, so an upstream or older Lizard measures them differently and fails the canary.
CANARY = {
    "canary.js": """function canary(a, b) {
  if (a && b) {
    for (const x of a) {
      if (x) { return 1; }
    }
  }
  return a ? 2 : 3;
}
""",
    "canary.swift": """enum Mode {
  case fast, slow
  case off
}

struct Gauge {
  var level: Int
  var label: String {
    if level > 9 { return "high" }
    return "level \\(level > 5 ? "mid" : "low")"
  }
  func check(a: Int?, b: Int) -> Bool {
    guard let a = a, a > b, b > 0 else { return false }
    return true
  }
}
""",
    "canary.tsx": """export function pick<T>(a: T | null, b: T): T {
  return a ?? b;
}

export function Notice(props: { show: boolean }) {
  return <p>If this and that, or else while case: {props.show && "yes"}</p>;
}
""",
    # Template literal types inside interface and object-type bodies; compiles under tsc --strict.
    "canary.ts": """type Prefix = `x-${string}`;
interface Options {
  kind?: Extract<string, `x-${string}`>;
  name: `id-${number}`;
  tag: Map<string, Array<`t-${Uppercase<`k${string}`>}`>>;
  nested: `a-${`b-${string}`}`;
}
type Shape = { label: `s-${string}`; size?: number };
interface Tagged extends Array<`e-${string}`> { first: Prefix; }
function choose(x: boolean, o: Options): string {
  if (x) return `${o.name ? 'a' : 'b'}`;
  return o.kind ?? '';
}
class Box {
  run(s: Shape, t: Tagged): number {
    return s.size && t.length ? 1 : 0;
  }
}
""",
    "attributes.tsx": ATTRIBUTES,
    "attributes.jsx": ATTRIBUTES,
    "valueless.tsx": VALUELESS,
    "valueless.jsx": VALUELESS,
    "slash-text.tsx": SLASH_TEXT,
    "slash-text.jsx": SLASH_TEXT,
}


def neutralise(text):
    """Return (text with directives defused, [{line, text}] of each hit)."""
    hits = []
    for match in DIRECTIVE.finditer(text):
        line = text.count("\n", 0, match.start()) + 1
        hits.append({"line": line, "text": match.group(0)})
    return DIRECTIVE.sub(lambda m: m.group(0).replace(" ", "_"), text), hits


def function_row(f):
    return {
        "name": f.name,
        "longName": f.long_name,
        "start": f.start_line,
        "end": f.end_line,
        "ccn": f.cyclomatic_complexity,
        "cognitive": getattr(f, "cognitive_complexity", None),
        "nloc": f.nloc,
    }


def measure(analyzer, path, text):
    """One file's result: measured functions plus the directives defused in it."""
    clean, hits = neutralise(text)
    result = analyzer.analyze_source_code(path, clean)
    return {
        "path": path,
        "status": "measured",
        "directives": hits,
        "functions": [function_row(f) for f in result.function_list],
    }


def read_text(path):
    """The file as text, or an error string. A BOM is accepted; anything else
    that is not UTF-8 is an error, never a guess."""
    try:
        with open(path, "rb") as fh:
            data = fh.read()
    except OSError as error:
        return None, "read-error: %s" % error.strerror
    try:
        return data.decode("utf-8-sig"), None
    except UnicodeDecodeError as error:
        return None, "decode-error: byte %d is not UTF-8" % error.start


def outside(path, root):
    """A symlink, or a path that resolves outside the repository, is never read: Git stores a
    link as its target string, and following it could measure (or read) a file elsewhere."""
    if os.path.islink(path):
        return "symlink, not followed"
    if not os.path.realpath(path).startswith(root + os.sep):
        return "resolves outside the repository"
    return None


def analyse_path(analyzer, get_reader_for, path, root):
    if get_reader_for(path) is None:
        return {"path": path, "status": "unsupported"}
    skipped = outside(path, root)
    if skipped is not None:
        return {"path": path, "status": "skipped", "error": skipped}
    text, error = read_text(path)
    if error is not None:
        return {"path": path, "status": "unmeasured", "error": error}
    try:
        return measure(analyzer, path, text)
    except Exception as error:  # Lizard raising on one file must not abort the batch.
        return {"path": path, "status": "unmeasured", "error": "analyzer-error: %s: %s" % (type(error).__name__, error)}


def lizard_version():
    from lizard_ext import version  # noqa: E402

    return version if isinstance(version, str) else getattr(version, "version", None)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lizard", required=True)
    parser.add_argument("--canary", action="store_true")
    args = parser.parse_args()

    sys.path.insert(0, args.lizard)
    import lizard  # noqa: E402
    from lizard_languages import get_reader_for  # noqa: E402

    analyzer = lizard.FileAnalyzer(lizard.get_extensions(["cognitive", "outside"]))
    if args.canary:
        files = [measure(analyzer, path, source) for path, source in CANARY.items()]
    else:
        paths = json.load(sys.stdin)
        root = os.path.realpath(os.getcwd())
        files = [analyse_path(analyzer, get_reader_for, p, root) for p in paths]
    identity = {"lizardVersion": lizard_version(), "lizardFile": os.path.realpath(lizard.__file__), "python": sys.version.split()[0]}
    json.dump(dict(identity, files=files), sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
