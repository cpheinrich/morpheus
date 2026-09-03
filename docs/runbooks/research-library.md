# Private research library

This runbook adds an uploadable, authenticated book library to an existing Morpheus `/hq`.
Babel is the independent acquisition/conversion tool; it must finish a canonical directory with
`docling/source.json` before Morpheus publishes it.

## Initialize

```sh
morpheus research-library init \
  --project <firebase-project-id> \
  --bucket <firebase-default-bucket>
```

Initialization merges `researchLibrary` into `morpheus.json`, creates
`hq/research/library/catalog/`, and ignores `local/research-library/`. It does not inspect or
write anything inside that local directory, so a partially converted or hand-curated book is
preserved.

## Project-owned storage boundary

The project's Firebase Storage rules must allow HQ roles to read the immutable prefix and deny
browser writes:

```text
match /research-library/books/{slug}/{artifact} {
  allow read: if canAccessHq();
  allow write: if false;
}
```

Keep the project's existing `canAccessHq()` helper and default deny. Configure the default bucket
with uniform bucket-level access, public-access prevention, seven-day soft delete, versioning off,
and a GET-only CORS origin list containing the production HQ origin and localhost. Operators who
publish need a prefix-scoped `roles/storage.objectAdmin` binding; read-only CI needs
`roles/storage.objectViewer`. The project owns those principals because accounts and repository
names are not reusable configuration.

## Catalog and publish

One `research-library-book-2` JSON manifest lives at
`hq/research/library/catalog/<slug>.json`. `sourceDirectory` is one directory name under the
configured local root. The publisher replaces only the manifest's derived `bundle` and `reader`
identities after both remote objects verify.

```sh
morpheus research-library push <slug>       # omit slug for the complete catalog
morpheus research-library verify --remote
morpheus research-library pull <slug>
```

Push is idempotent and uploads with generation-match zero. Pull leaves a matching local directory
alone and refuses a divergent one unless `--replace` is explicitly supplied. Neither command
deletes a remote object.

## Web surface

Import shared types and parsing from `morpheus-kit/research-library`, filesystem catalog loading
from `morpheus-kit/research-library/server`, and browser verification from
`morpheus-kit/research-library/client`. The explicit split prevents a client component from
pulling `node:fs` into its bundle. The project supplies its repository root and bucket contract on
the server, and a Firebase-authenticated `getBlob` callback in the browser. Render HTML through a
blob URL in `<iframe sandbox="">`;
the generated document has no scripts, no referrer, and a restrictive content security policy.
