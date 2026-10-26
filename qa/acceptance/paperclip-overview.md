# Paperclip architecture overview

- A succinct Markdown overview opens with a Paperclip work-in-progress notice and is linked
  from `docs/README.md`.
- Three Mermaid diagrams explain deployment, Git task linkage and interactive delegation.
- Ownership and new functionality match the existing implementation; separate Git linkage and
  interactive stores, native host credentials and tested-versus-pending behavior are explicit.
- Local links resolve and all diagrams parse/render. Documentation-only validation does not
  rerun live worker tasks or change runtime configuration.
