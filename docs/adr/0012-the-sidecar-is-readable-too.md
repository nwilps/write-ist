# The sidecar is readable too: the writer's words as documents, bookkeeping as data

ADR-0003 guarantees the manuscript survives the application disappearing. That guarantee
extends to the sidecar, split along one line:

- **Writing the author produced** — a note, a character description, the text of a plan card —
  is stored so that it comes back as a **readable document**.
- **Structure the app maintains** — a card's position on the grid, a task's due date, an
  anchor id, daily word totals — is stored as **plain structured text**: intact and legible,
  but not required to read well.

The evidence is in v1. The notes file was plain Markdown anchored to nothing, and it survived
the bug that emptied every highlight. The highlights lived in a 532 KB machine-readable file
that was unreadable and unrecoverable (ADR-0008). Readability is not only a courtesy to some
future reader: it is what lets a person diagnose and rescue their own data when the app is
wrong about it.

## Consequences

- **Round-trip applies wherever the writer's words are stored**, not only to the manuscript.
  Any sidecar format holding prose needs a lossless parser of its own.
- **Prose embedded in a structured record stays plain.** A plan card's text sits in the record
  as readable text, never escaped past recognition or encoded.
- **"Data" is not permission to be opaque.** No binary formats (ADR-0009), no compression, no
  database files. Legible means a person can open it and see what it says.
- **Which file formats implement this is decided with the document model.** This ADR sets only
  the standard those formats must meet.

## The split, worked through

Plan and the Log were built as prototypes before this ADR existed, and they divide along the
line cleanly enough to be worth recording as the first example:

| The writer's words — a readable document | Structure the app maintains — plain structured text |
|---|---|
| A plan card's label and description | Its target, its target length, which lane it is in |
| A log entry's text | Which day it sits on, whether it is done, its due date, which push it belongs to |
| A push's name | Its first and last day |

The useful thing the table shows is the proportion. Almost everything is bookkeeping, and the
writer's words are a handful of free-text fields — so the readable-document obligation is
narrow and cheap, and there is no excuse for the whole file being opaque because part of it is
structured.

