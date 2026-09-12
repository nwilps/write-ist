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
