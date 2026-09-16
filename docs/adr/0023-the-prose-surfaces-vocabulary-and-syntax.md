# The prose surface's vocabulary, and what it writes into the file

The prose surface's element vocabulary is the list ADR-0011 derived from the publishing
research, made explicit: **paragraph**, part and chapter **headings**, **scene break**,
**epigraph**, **block quote**, **verse**, **small caps**, **front and back matter**, and the
inline marks italic, bold and underline. Plus ADR-0020's **passthrough**, for Pandoc Markdown
outside the subset Write-ist specifies.

Two things it writes into the file, which ADR-0018 and ADR-0011 named as inputs to the
document model rather than deciding:

- **Non-printing content — comments, and prose's counterpart to the boneyard — is carried in
  HTML comments**, `<!-- … -->`.
- **Paragraph indentation is a rendered style, never characters in the file.**

## HTML comments as the non-printing vehicle

Fountain hands the screenplay surface two ready-made constructs for content that is in the file
and absent from the output: `[[ ]]` notes and `/* */`. **Pandoc Markdown has neither.** ADR-0018
flagged this explicitly, guessed at HTML comments, and left it here.

HTML comments are the one construct in the Markdown world universally understood to mean
present-in-the-file, absent-from-the-output — which is exactly the contract. The alternatives
both cost something real:

- **A Pandoc fenced div** (`::: comment … :::`) is native and *renders as visible text in a
  plain CommonMark viewer*, which breaks ADR-0003's promise in the small — a stranger opening
  the file sees the writer's private remarks inline in the prose.
- **Our own delimiter** forfeits the one thing borrowing Pandoc's syntax was supposed to buy.

ADR-0011 already establishes that Write-ist specifies its own subset and writes its own parser,
so it can simply say that an HTML comment carrying our id prefix is a Write-ist comment and
everything else is a passthrough.

### The forms, pinned

Decided 2026-09-16, and deliberately a mirror of the screenplay surface rather than a second
invention. [ADR-0018](0018-comments-are-the-text.md) carries the reasoning.

```
<!--c:a1 this line is weak-->She left.<!--/c:a1-->     a comment
<!--cut--> … <!--/cut-->                                cut prose
<!-- anything else -->                                  a passthrough
```

- **The remark lives in the opening delimiter.** ADR-0018's inline argument — *a deleted span
  takes its comment with it* — holds only while the remark sits inside the span's own opener.
- **Comments are matched by id**, so they may nest and may cross, which is ADR-0018's specific
  claim and the reason marks may not do the same.
- **Cut prose carries no id and is delimiters, not a container** — the elements between are
  ordinary elements flagged `omitted`, exactly as ADR-0021 settled for Fountain's boneyard after
  a container implementation was found writing `(CONT'D)` into cut material.
- **`-->` is escaped as `--&gt;` inside a remark**, because an HTML comment ends at the first
  one and a writer typing an arrow would otherwise corrupt the file. A bare `--` is untouched.
- **Everything else in `<!-- -->` round-trips byte-for-byte and is never reinterpreted**, which
  is ADR-0020's passthrough rule.

## Indentation means two different things

A **typed indent** is tab or space characters the writer put in the file. A **rendered
first-line indent** is a typographic style applied to every paragraph, with no character
existing in the text. Standard manuscript format uses the second: every paragraph indents on
screen and in the exported `.docx`, and the file has no leading whitespace at all.

Conflating them is dangerous in Markdown specifically, because **leading whitespace is syntax
there** — four spaces at the start of a line is a code block in Pandoc. "Preserve leading
whitespace" and "paragraphs are indented" are different instructions, and treating them as one
produces a file where the writer's prose parses as code.

So: **paragraphs get a rendered indent and carry no whitespace in the file. Literal leading
whitespace is preserved only inside verse**, where it is authored and meaningful — which is
the mechanism ADR-0005 says poetry runs on, making it load-bearing rather than decorative.

## Footnotes: the syntax, not the feature

ADR-0011's comparison table names footnotes as something Pandoc has and Fountain lacks, which
reads as an intention to support them. The catalog triages *"Footnotes and endnotes"* as
`someday`, with the note: *"Notes anchored in text that also paginate. Same anchoring question
as comments."*

The catalog is right, and the two halves separate cleanly:

- **The syntax is in the subset**, so a file containing footnotes parses, round-trips and is
  never destroyed. This is required by ADR-0020 regardless of whether the feature exists.
- **The authoring feature stays `someday`.** A footnote is not a parsing problem; it is a
  pagination problem, because the note must land on the same page as its marker. That is real
  work for a `someday` item.

## A paragraph holds its own line wraps

Prose arrives hard-wrapped. On the acceptance manuscript, **2,140 of 4,322 paragraphs span more
than one line and the longest runs 72**, so a paragraph is one element whose text carries the
writer's wraps. Rewrapping is not on ADR-0020's list and will not be added to it: where a
novelist broke their lines is theirs.

[ADR-0019](0019-the-document-model-is-flat-typed-elements.md)'s *one element, one line* is
therefore scoped to the screenplay surface, where it was measured and where it holds. The rest
of that ADR — flat, typed, marks as a set, no containers — applies to both surfaces unchanged.

## Consequences

- **Prose has no scenes, and this vocabulary says so.** A scene break is an element of the text
  and a boundary of nothing, exactly as ADR-0010 requires. The catalog's own note is the reason
  it is an element rather than blank lines: *"a blank-line break is lost at the top of a printed
  page."*
- **The prose surface has no corpus, no fixture and no round-trip gate.** ADR-0004's acceptance
  test is named for Fountain and the 170 KB screenplay; everything here is specified against
  evidence about *publishing requirements* and nothing against a real prose manuscript. ADR-0011
  states outright that Write-ist writes its own lossless parser because *"no Markdown tool
  round-trips byte for byte."* This is the largest untested claim in the design and is tracked
  as [issue #10](https://github.com/nwilps/write-ist/issues/10).
- **Markdown export is nearly free** and `.docx` export goes through the route ADR-0011
  researched. Neither is affected by anything decided here.
- **The sidecar files use this same subset and this same parser** (ADR-0025), so there is one
  prose parser in the application rather than two.
