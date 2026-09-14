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

## The corpus and its numbers, pinned

An acceptance test needs an unambiguous number, and this one had two. The Phase 2 review
flagged that the spike reports `EXACT — 170,679 bytes identical` against a fixture its own
`.gitattributes` calls 170,682 bytes. Measured directly at `nwilps/write-ist-ng@3812312`,
`spike/public/script.fountain`:

| | Bytes | Characters |
|---|---|---|
| On disk | **170,682** | 170,681 |
| After the gate's declared normalization | **170,680** | **170,679** |

- **The file is LF-only** — zero CR bytes — and UTF-8. It is **not** pure ASCII: it contains
  one non-ASCII character, `é`, which costs two bytes and one character. There are no
  astral-plane characters.
- **The declared normalization** is CRLF to LF, runs of three or more newlines collapsed to
  two, and trailing whitespace trimmed. It removes **two stray blank lines**, reported at line
  4086 and at EOF, costing two bytes.
- **The three-byte gap is two different things.** Two bytes are the normalization. The third
  is not a size change at all: the gate prints `b.length`, which is a JavaScript string length
  — **characters, not bytes** — and the single `é` makes those differ by one. The headline
  number is mislabelled, not wrong.

Two further properties of the gate, which Phase 3 should know before it decides with the spike
in hand:

- **It never writes a file, so it does not test byte serialization.** It compares two
  in-memory strings. The claim it actually establishes is character equality after a lossy
  normalization — a weaker property than this ADR's "must return what was read", and one that
  cannot see an encoding-level difference.
- **The byte-exact claim is for the manuscript without scene ids.** With ids present the gate
  asserts *idempotence* instead — serialize, reparse, serialize again, compare — which is the
  right property, since a file carrying ids is a different file from the source. But the
  corpus as ADR-0008 rule 1 requires it to be written has never been pinned to a number.

**An input to the document model, not decided here:** Unicode normalization form. A round-trip
that preserves characters while silently renormalizing `é` between NFC and NFD would change
the bytes on disk without failing a character comparison. That is the same family of silent
file mutation as the mark-nesting normalization the spike already declares, and it deserves
the same scrutiny.
