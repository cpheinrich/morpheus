"""Build or query one immutable Morpheus search index with the pinned binding."""

import importlib.metadata
import json
import sys

TANTIVY_VERSION = "0.27.0"
FIELDS = ("title", "heading", "pathWords", "body")
BOOSTS = dict(zip(FIELDS, (2.5, 2, 1.5, 1), strict=True))


def build(path):
    builder = tantivy.SchemaBuilder()
    for field in FIELDS:
        builder.add_text_field(field)
    builder.add_unsigned_field("chunk", stored=True)
    schema = builder.build()
    index = tantivy.Index(schema, path=path)
    writer = index.writer(num_threads=1)
    for line in sys.stdin:
        for row in json.loads(line):
            writer.add_document(tantivy.Document.from_dict(row, schema))
    writer.commit()
    writer.wait_merging_threads()


def search(path):
    try:
        index = tantivy.Index.open(path)
        searcher = index.searcher()
    except (OSError, ValueError, RuntimeError):
        return 3
    terms = sys.stdin.read()
    query = index.parse_query(terms, list(FIELDS), field_boosts=BOOSTS)
    results = searcher.search(query, 120, count=False)
    print(json.dumps([searcher.doc(address).get_first("chunk") for _, address in results.hits]))
    return 0


if __name__ == "__main__":
    try:
        import tantivy

        if importlib.metadata.version("tantivy") != TANTIVY_VERSION:
            sys.exit(2)
    except ImportError:
        sys.exit(2)
    action, directory = sys.argv[1:]
    if action == "build":
        build(directory)
    elif action == "search":
        sys.exit(search(directory))
    else:
        sys.exit(1)
