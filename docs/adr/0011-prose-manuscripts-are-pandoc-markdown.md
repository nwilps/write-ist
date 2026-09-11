# Prose manuscripts are written in Pandoc Markdown

The prose surface's manuscript is plain text in **a subset of Pandoc Markdown that Write-ist
specifies**. It is the prose counterpart of ADR-0004: Fountain for screenplay, Pandoc Markdown
for prose, one file per draft on both surfaces (ADR-0010).

The manuscript must be able to express what publishers and ebook platforms need — italics,
bold, underline, scene breaks, part and chapter headings, epigraphs, block quotes and letters,
verse with indentation, notes, and typed front and back matter — while staying readable in a
text editor (ADR-0003). Of the plain-text candidates surveyed, Pandoc Markdown covers nearly
all of it, and has the best-documented route to `.docx`, which every publisher and
self-publishing platform accepts, and to EPUB. Evidence is in
`docs/research/prose-publishing-standards.md`.

## Considered options

- **CommonMark:** no underline and no verse; indentation is stripped and single newlines are
  ignored when rendered.
- **AsciiDoc:** the strongest native book structure, but its spec is still being written,
  there is no evidence of fiction use, and its route to Word goes through intermediate tools.
- **Markua:** a real spec written with novels in mind, but one vendor's format with no open
  parser, and hard line breaks are a whole-document setting.
- **Fountain for prose:** one syntax family for both surfaces, but it has no epigraphs, block
  quotes, verse blocks, footnotes or front matter, and it reuses screenplay elements under
  other names, contrary to ADR-0005.
- **XML formats** (DocBook, flat ODT, Standard Ebooks XHTML): complete, but too tag-dense to
  be readable in the sense ADR-0003 means. The Standard Ebooks manual remains useful as a
  checklist of what fiction markup needs.

## Consequences

- **Write-ist writes its own lossless parser and its own specification of the subset.** No
  Markdown tool round-trips byte for byte — Pandoc calls its own conversions lossy — and
  round-trip is the acceptance test (ADR-0004). We borrow Pandoc's syntax, not its software.
  The subset is defined together with the document model.
- **Anchors can use Pandoc's attribute syntax.** Headings and spans take ids —
  `## Chapter 2 {#ch-8f3a}` — which other tools treat as identifiers rather than text. That
  is the in-text anchor ADR-0008 requires.
- **Other Markdown tools may render some of it literally.** Underline and small caps are
  attribute syntax (`[word]{.underline}`) and verse uses line blocks (`| `), so a plain
  CommonMark renderer shows the markup. The text itself is always intact; ADR-0003 is about
  reading, not rendering.
- **The same characters mean different things on the two surfaces.** `_word_` is underline in
  Fountain and italics in Markdown. That is invisible when formatting is applied with
  shortcuts, but it matters if the editor ever shows raw syntax — an input to the open
  buffer-first vs model-first question.
- **Markdown export becomes nearly free** for prose.
