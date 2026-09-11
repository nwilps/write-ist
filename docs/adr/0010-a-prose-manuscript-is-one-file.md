# A prose manuscript is one file, with chapters as headings

Each draft's prose manuscript is a single file. Parts and chapters are marked inside the
text as headings, so reading order is simply the order of the text. This is the shape the
screenplay surface already has: one Fountain file, with `#` sections for acts.

**Prose has no scenes.** A novel's structure is parts and chapters only. A scene break is a
typographic mark inside a chapter — a real element of the text, so it survives print and
export — but not a boundary of anything the model tracks. This is the simplest model. Its
cost is that per-scene word counts and scene cards have nothing to attach to in a novel.
Because scene breaks are already elements in the text, making them boundaries later would
need no change to existing files.

## Considered options

- **One file per chapter, with order carried by filenames or an order file.** This is what
  every specialist tool surveyed does — Scrivener, Longform, Manuskript, Ulysses. Rejected,
  because the reasons those tools give do not apply here:
  - Easier moving and overview is an *editor* concern. Write-ist's editor can present
    chapters as separate pieces however they are stored.
  - Crash safety is covered by atomic saves (ADR-0008).
  - Easier sync and version control are covered by sync being rejected (ADR-0003) and by
    the draft model (ADR-0002).

  Scrivener's own guidance calls the split "personal preference", and no publishing
  requirement asks for it: publishers and self-publishing platforms take a single `.docx`.
  Evidence in `docs/research/`.
- **A chapter tree held in the sidecar over flat text.** Fails ADR-0008, because boundaries
  held only by the sidecar are not anchors, and ADR-0003, because reading order is lost
  without the app.

## Consequences

- Chapter order can never be lost or disagree with the text. A reader without the app reads
  the book top to bottom.
- Splitting and merging chapters are heading edits. Moving a chapter moves its text, so
  anchors into prose must be written into the text or derived from it, as ADR-0008 already
  requires.
- Every save of the manuscript is a single-file atomic write, with no multi-file transaction
  to keep consistent (ADR-0008 rules 5 and 6).
- A novel is one large file, about 600 KB at 100,000 words. The editor must stay fast at that
  size, which the 400-page requirement already demands.
- Everything *about* the tree that a reader does not need in order to read the book —
  synopses, labels, status, targets — can live in the sidecar, anchored to boundaries in the
  text.
