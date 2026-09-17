# A mark runs from its opening delimiter to the next one, across elements if that is where it closes

**A mark opens at a delimiter and closes at the next matching delimiter. Where that delimiter
falls in a later element, the mark spans the elements between them.** Everything in between is
italic, or bold, or underlined, exactly as the writer wrote it.

This is the first thing in the document model that crosses an element boundary, so it is
recorded on its own rather than folded into
[ADR-0019](0019-the-document-model-is-flat-typed-elements.md). Nothing about flatness changes: a
mark is still a set over a range, ranges still never nest into a tree, and no element contains
another. What changes is only how far one range may reach.

## The forcing reason

**The writer never types the syntax.** They select a run of text and press the button, or the
hotkey. Fountain's asterisks are a *storage encoding* — [ADR-0018](0018-comments-are-the-text.md)
already forbids showing the writer any syntax at all, and
[ADR-0019](0019-the-document-model-is-flat-typed-elements.md) makes the model canonical and the
file a rendering of it.

So the question "what does the delimiter mean?" is not a question about Fountain's grammar. It
is a question about what the writer selected when they pressed Cmd-I. They selected from here to
there. The mark runs from here to there. Any rule that stops the mark at a line ending is the
model inventing a boundary that the writer never drew and cannot see.

The alternative fails in the only place it is visible. With marks stopping at the element
boundary, the reference draft of *Big Fish* opens in Write-ist reading like this:

```
*Sometimes a girl can feel so alone
Without a lover to call her own.
Sometimes it's so bad, she wants to explode.
Wants to grab the first man she sees and tear off his clothes.*
```

— four lines of a sung speech, un-italicised, with two literal asterisks on screen, and a single
bold word three lines further down where a `**special**` happened to open and close on one line.
That is syntax in front of the writer, which ADR-0018 rules out, and it is wrong about what the
writer meant, which is worse.

## The evidence

**The produced PDF of *Big Fish* renders those lines italic.** [V] — checked against the PDF,
2026-09-16. That is the decisive fact: it is what the real tool chain did with this exact file.

**fountain.io's syntax page says the opposite.** [V] — *"As with Markdown, emphasis is not
carried across line breaks. So there are no italics in the formatted output of this example — just
asterisks."* It is recorded here because it is the obvious objection and it should not have to be
rediscovered. It loses to the PDF: a sentence about what a renderer should do is weaker evidence
than what the renderers actually did with the script in front of us. Highland's own syntax
reference does not address the case at all [V].

**Three spans in the corpus cross an element boundary, all of them sung dialogue.** [V] —
measured across `Big-Fish.fountain`, 2026-09-16:

| Span | Lines | Elements covered |
|---|---|---|
| `*Sometimes a girl can feel so alone … his clothes.*` | 2751–2754 | 4 |
| `*But she won't. … but she has needs.*` | 2765–2770 | 6 |
| `*I've had twice the adventure, … love to give.*` | 2782–2786 | 5 |

**Zero in the acceptance corpus and zero in *Brick & Steel*** [V]; both keep every one of their
298 spans inside a single line. And **zero instances, anywhere in the three screenplays, of
adjacent lines each wrapped separately** [V] — the ambiguous spelling this decision has to be
careful of does not occur.

**One of the three has a `**bold**` nested inside it** [V], at line 2767. So a cross-element
italic and a within-element bold overlap, and the model has to hold both at once. A mark set
handles that without comment, which is the point of it being a set.

## Pairing is in document order, and that is the whole rule

Each delimiter pairs with the next unclosed one of its kind. That single sentence decides both
cases, which is why no normalisation follows from this ADR:

- `*a` … `b*` across four elements is **one** span. One opener goes back at the start, one closer
  at the end. Byte-identical.
- `*a*` on one line and `*b*` on the next is **two** spans, because the second delimiter closes
  the first. Both keep their own delimiters. Byte-identical.

**No eighth entry is added to [ADR-0020](0020-what-write-ist-may-change-in-a-writers-file.md)'s
list.** An earlier draft of this decision proposed inferring a single span whenever a mark
reached the end of one element and resumed at the start of the next. It was wrong: it cannot tell
those two spellings apart, so it would have rewritten the second into the first and spent a
writer's file on an inference. Pairing in document order needs no inference and loses nothing.

## What it costs the model

A mark range can no longer be described as offsets into one element's text. Its two ends name an
element as well as an offset, and it is held once for the span rather than once per element the
span touches. Recorded as a consequence rather than legislated here — the shape is the
implementer's, and more than one shape satisfies the rule.

Two shapes were considered and are recorded so they are not re-derived:

- **Per-element ranges plus a "continues into the next element" flag.** Rejected: this is the
  `precededByBlank` design ADR-0019 already rejected, wearing different clothes — state stored on
  an element purely so the serialiser can put a delimiter back. It also needs the flag maintained
  on every edit that splits or joins an element.
- **Per-element ranges with no flag, delimiters re-derived from adjacency.** Rejected above: it
  cannot distinguish one span from two, so it silently rewrites the writer's file.

The arithmetic that rejected newlines-inside-elements in ADR-0019 does not reject this, and the
difference is worth stating because the counts look similar. There, the cost was a permanent
per-type question — *may a scene heading contain a newline?* — answered differently for four
types. Here there is no per-type question: a mark range reaches wherever it reaches, for every
element type equally, and the three instances in *Big Fish* are the proof that the reach is
real rather than a hypothetical.

## Consequences

- **A mark may cross an element boundary. It may not cross a blank line.** A blank line ends a
  speech in Fountain and separates elements everywhere else; a delimiter left unclosed at one is
  unclosed, and stays literal text. This keeps an unmatched `*` from marking the rest of the
  script, which is the same failure mode the boneyard's `closesLater` check already exists to
  prevent (ADR-0021).
- **An unpaired delimiter stays the character the writer typed.** Unchanged from the rule the
  implementation already holds, and it is what makes the bytes safe: the parser may be wrong
  about the mark, never about the file.
- **This decision moves no bytes.** The file keeps the delimiters the writer wrote, in the places
  they wrote them, whichever way the question had gone. It changes what the screen shows and what
  a selection means — not what is stored. ADR-0020's contract is untouched.
- **Write-ist renders such a span italic where a strict reading of fountain.io would show
  asterisks.** A deliberate divergence, recorded so it is not later filed as a bug. The produced
  PDF is the standard being met.
- **The prose surface gets this for free and needs it less.** A prose paragraph is one element
  holding its own line wraps (ADR-0019), so emphasis across a wrapped line never crosses an
  element there. The rule is the same on both surfaces; only the screenplay surface exercises it.
- **The emission order is unaffected.** `EMISSION_ORDER` and the underline-outermost rule
  (ADR-0019, ADR-0020) decide how overlapping marks nest on the way out, which is a different
  question from how far one reaches. Worth noting that the underline-outermost evidence is two
  instances, `_**THE END**_` at the end of both the acceptance corpus and *Big Fish* [V] — thin,
  consistent, and the only evidence there is.
