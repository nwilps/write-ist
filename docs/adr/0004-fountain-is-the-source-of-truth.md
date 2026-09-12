# Fountain is the source of truth

For screenplay documents, the Fountain plain-text file **is** the manuscript — not an export
format, not a serialisation of some richer internal model. Anything the app knows that is not
manuscript text lives beside it in a sidecar, and a project is therefore a **folder bundle**
rather than a single file. The prose surface's counterparts are ADR-0010 (one file per draft)
and ADR-0011 (Pandoc Markdown).

This follows from ADR-0003: a manuscript that must stay readable without the app has to be
plain text, and plain text cannot hold notes, plan cards or log entries.

## Considered options

A richer internal document model with Fountain as an import/export format would make the
editor easier to write — structured elements, unambiguous identity, no round-trip problem.
It fails the readability constraint, and it puts the writer's work one migration away from
being stranded.

## Consequences

- **The document model is judged by round-trip.** Parsing a manuscript and serialising it
  back must return what was read. This is the acceptance test for any editor design, and it
  is why the 170 KB v1 manuscript is the corpus.
- **The parser cannot gate elements by format**, because Fountain does not. See ADR-0006.
- **Write a format version into the bundle from day one.** It costs one field now and is
  unrecoverable later — there is no way to migrate files that never said what they were.
  [ADR-0015](0015-a-project-carries-an-id.md) puts the **project id** in the same file, and
  records why the id is *not* the same shape as this instruction.
- Everything the sidecar says about the manuscript must be anchored to it, which is the
  entire subject of ADR-0008.
