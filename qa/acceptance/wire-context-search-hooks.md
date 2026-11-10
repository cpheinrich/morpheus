# Context MCP by default in Claude and Codex

- A Claude session in a Morpheus project starts `morpheus_context` from `.mcp.json` without an approval prompt once the folder is trusted.
- A Claude Grep or shell search over project records receives cited `[morpheus-context]` excerpts and shows a visible notice; code searches receive nothing.
- Codebase-memory skips record globs listed in `.cbmignore`, while project rules outside the generated block survive.
- An opted-in device has no user-level Claude `morpheus_context` entry written by Morpheus; another entry under that name is untouched.
- `morpheus init` and `context install` produce all of the above; every managed project carries it on `main`.
- A headless Claude task in Evo on a second machine uses the context MCP or the hint for record lookups.
