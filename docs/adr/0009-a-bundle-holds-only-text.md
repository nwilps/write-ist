# A bundle holds only text, forever

Everything in a project bundle is text: the manuscript, the sidecar, and anything added to
either in future. A bundle never holds images, PDFs, audio, or any other binary file. This
is permanent, not deferred.

The obvious objection is not the real one. Readability is not the issue: a JPEG opens on any
computer, so ADR-0003 would survive images. The cost falls on the draft model. Locking
freezes the manuscript and the sidecar together as a full copy (ADR-0002), so a binary file
in the sidecar is copied on every lock. A 200 MB mood board across ten drafts is 2 GB of
identical photos. Avoiding that means a shared asset store that holds each file once — real
design, with its own integrity rules, for no feature the app needs. Text only keeps locks
cheap, backups small, and ADR-0008's integrity rules about text alone.

## Considered options

- **Deferred:** text only in v2, with the rules for a future asset store written down now.
  Considered and declined in favour of a permanent answer.
- **Allowed in v2:** real scope with no v2 feature asking for it.
- **Keeping export records** — a copy of each exported PDF or `.fdx` stored with the locked
  draft it came from, as a record of exactly what was sent. Rejected as over-engineering.
  Notes on a draft are usually general, quote the lines they mean, or arrive as a marked-up
  copy the writer keeps themselves; they rarely depend on page numbers staying put, and some
  drift is part of revising anyway. A file that needs sending again is exported again.

## Consequences

- **Permanently out:** mood boards, research clippings with images or PDFs, character and
  location photos, inline illustrations.
- **The set of workspaces is open, but every workspace works with text** (ADR-0005).
- **Export can produce binary files** — PDF, EPUB, DOCX — written wherever the writer chooses,
  outside the bundle. No copy of any export is kept. An ebook cover image is chosen from disk
  at export time and never stored in the bundle.
- **This rule binds inside a bundle only.**
  [ADR-0016](0016-the-layer-above-a-bundle-holds-no-work.md) re-derived it for the layer above
  and did not extend it: the forcing argument here is that locking copies the sidecar, and
  nothing outside a bundle is ever copied by a lock.
- **App resources are not project content.** The bundled Courier Prime font (ADR-0001) and
  spellcheck dictionaries ship with the application, not inside each project.
