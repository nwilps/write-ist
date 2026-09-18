# A mark runs from its opening delimiter to the next one, across elements if that is where it closes

**A mark opens at a delimiter and closes at the next matching delimiter. Where that delimiter
falls in a later element, every element in between carries the mark.** All of it is italic, or
bold, or underlined, exactly as the writer wrote it.

**A mark is nevertheless stored inside one element and written back inside one element.** Reading
crosses lines; storing and writing do not. That asymmetry is the whole of this decision, and it
is what makes the file converge on a spelling every Fountain tool agrees with.

*Amended 2026-09-18. The first version of this ADR had the mark itself span elements — one range
reaching from the opening delimiter to the closing one. That is recorded at the foot of this
file, with why it changed.*

## The mechanism, in four parts

| | What it does | Crosses a line? |
|---|---|---|
| **Marking** | The writer selects across as many lines as they like and presses the hotkey. Each element the selection touches gets the mark, over the part the selection covers. | no |
| **Storing** | A mark is a range over one element's text. It never leaves that element. | no |
| **Writing** | Each element emits its own delimiter pair, inside its own forcing marker. No element consults its neighbours. | no |
| **Reading** | An opening delimiter with no partner on its own line looks ahead for one, and marks every element between them. | **yes** |

**Reading stops at a blank line.** A blank line ends a speech in Fountain and separates every
other element, so an opener that runs into one has no partner and stays the character the writer
typed. Without that bound a single stray `*` would italicise the rest of the script.

**Element syntax is resolved before marks.** `/*` and `*/` are boneyard delimiters, not
asterisks ([ADR-0021](0021-the-screenplay-surface-implements-all-of-fountain.md)); forcing
markers are element syntax and sit outside the mark delimiters. Recorded because it is an easy
mistake — a scan that pairs asterisks before classifying elements reads a boneyard's opening and
closing delimiters as one long italic span.

**The file converges.** After the first open every delimiter pairs on its own line, so reading
and writing agree from then on and nothing churns again. The seven-normalisation contract of
[ADR-0020](0020-what-write-ist-may-change-in-a-writers-file.md) needs that, and this shape gives
it: forgiving on the way in, strict on the way out.

## The forcing reason

**The writer never types the syntax.** They select a run of text and press the button, or the
hotkey. Fountain's asterisks are a *storage encoding* — [ADR-0018](0018-comments-are-the-text.md)
already forbids showing the writer any syntax at all, and
[ADR-0019](0019-the-document-model-is-flat-typed-elements.md) makes the model canonical and the
file a rendering of it.

So the question "what does the delimiter mean?" is not a question about Fountain's grammar. It is
a question about what the writer selected when they pressed Cmd-I. They selected from here to
there. The mark covers from here to there. Any rule that stops the mark at a line ending invents
a boundary the writer never drew and cannot see.

The alternative fails in the only place it is visible. With marks stopping at the element
boundary on the way *in*, the reference draft of *Big Fish* opens in Write-ist reading like this:

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

**And writing per element repairs the file rather than diverging from it.** This is the reason
the mechanism changed, and it is the stronger half of the argument. Under a strict reading of
fountain.io the source spelling above renders as literal asterisks *in every other tool*. Written
back a pair per element, it renders italic in all of them. Write-ist does not have to be the only
application that shows this speech the way its author meant it.

## The evidence

**The produced PDF of *Big Fish* renders those lines italic.** [V] — checked against the PDF,
2026-09-16. That is what settles what the writer meant: it is what the real tool chain did with
this exact file.

**fountain.io's syntax page says emphasis does not survive a line break.** [V] — *"As with
Markdown, emphasis is not carried across line breaks. So there are no italics in the formatted
output of this example — just asterisks."* Recorded because it is the obvious objection and should
not have to be rediscovered. It does not lose to the PDF so much as get *satisfied* by the
mechanism above: writing a pair per element produces exactly the spelling that page asks for.
Highland's own syntax reference does not address the case at all [V].

**Three spans in the corpus cross an element boundary, all of them sung dialogue.** [V] —
measured 2026-09-16, re-measured 2026-09-18:

| Span | Lines | Elements | Blank lines inside |
|---|---|---|---|
| `*Sometimes a girl can feel so alone … his clothes.*` | 2751–2754 | 4 | 0 |
| `*But she won't. … but she has needs.*` | 2765–2770 | 6 | 0 |
| `*I've had twice the adventure, … love to give.*` | 2782–2786 | 5 | 0 |

**Zero blank lines inside any of them** [V] — so bounding the lookahead at a blank line costs
nothing on real material while removing the runaway case entirely.

**Zero in the acceptance corpus and zero in *Brick & Steel*** [V]; the corpus keeps all 278 of its
spans inside a single line and *Brick & Steel* all 5 of its own, and the other 15 in *Big Fish*
close on the line they open on. And **zero instances, anywhere in the three screenplays, of
adjacent lines each wrapped separately** [V].

**One of the three has a `**bold**` nested inside it** [V], at line 2767. So a multi-element
italic and a within-element bold overlap, and the model has to hold both at once. A mark set
handles that without comment, which is the point of it being a set.

**The cost, measured:** 15 elements across the three songs. Six delimiter characters become
thirty. **+24 bytes in *Big Fish*, and zero in the other four manuscripts** [V].

## What it costs ADR-0020

**An eighth entry, added there by name:** *a mark spanning several elements gains its own
delimiter pair on each of them.* It is the second entry scoped to the screenplay surface, for the
same reason as the seventh — prose paragraphs hold their own line wraps, so a mark across a
wrapped line never leaves its element there.

The seventh entry is the precedent and the shape is identical: a construct that the one-element-
one-line rule cannot represent as the writer spelled it gets re-spelled once, on import, visibly,
and reported. Asterisk placement is squarely "the format is ours" rather than the writer's words.

It also absorbs the case the first version of this ADR had to worry about. A writer who
italicised each line separately and a writer who ran one span across them now produce the same
file, because both are written the same way. Nothing has to tell them apart.

## Considered options

- **The mark itself spans the elements** — one range from the opening delimiter to the closing
  one, held once. This is what the first version of this ADR decided; see below.
- **Per-element ranges plus a "continues into the next element" flag.** Rejected: this is the
  `precededByBlank` design ADR-0019 already rejected, wearing different clothes — state stored on
  an element purely so the serialiser can put a delimiter back. It also needs the flag maintained
  on every edit that splits or joins an element.
- **Per-element ranges with no flag, delimiters re-derived from adjacency.** Rejected: it cannot
  distinguish one span from two, so it would silently rewrite the writer's file. The eighth
  entry above does the rewriting openly instead, which is the difference between a normalisation
  and a bug.
- **Stopping at the element boundary on the way in too** — the pre-Phase-F behaviour. Rejected on
  the forcing reason above: it shows the writer syntax and loses formatting they authored.

## Consequences

- **A mark may be read across an element boundary. It may not be stored or written across one,
  and it may not cross a blank line.**
- **An unpaired delimiter stays the character the writer typed.** The parser may be wrong about
  the mark, never about the file.
- **Write-ist's output is strict Fountain, and every other tool agrees with it.** The divergence
  the first version of this ADR accepted is gone.
- **The model is unchanged from what Phase F already built.** A `MarkRange` stays offsets into one
  element's text. Only the parser's pairing and the eighth normalisation are new.
- **Marks must survive inside every element, the forcing marker outside them.** Verified across
  every type that takes one: `!*He runs.*`, `.**INT. KITCHEN - DAY**`, `~*la la la*`,
  `>**CUT TO:**`, `@**BOB**` [V], 2026-09-18.
- **The prose surface exercises none of this.** A prose paragraph is one element holding its own
  line wraps (ADR-0019), so emphasis across a wrapped line never leaves its element; and a blank
  line in Markdown ends the paragraph, so the bound above is the same bound Markdown already has.
- **The emission order is unaffected.** `EMISSION_ORDER` and the underline-outermost rule
  (ADR-0019, ADR-0020) decide how overlapping marks nest on the way out, which is a different
  question from how far one reaches. The underline-outermost evidence remains two instances,
  `_**THE END**_` at the end of both the acceptance corpus and *Big Fish* [V] — thin, consistent,
  and the only evidence there is.

## What the first version said, and why it changed

The first version, merged 2026-09-17, made the **mark** span the elements: one range from the
opening delimiter to the closing one, written back as the writer spelled it — one opener, one
closer, no bytes moved. It recorded as an accepted consequence that Write-ist would render such a
span italic where a strict reading of fountain.io shows asterisks.

It changed because that consequence was avoidable and nobody had noticed. Writing a pair per
element costs 24 bytes in one manuscript and buys three things the first version could not have:
the file becomes correct Fountain rather than a spelling only we read properly; the model stays
element-local, so nothing already built has to be reworked; and the rule about a mark stopping at
a blank line stops being a special case, because a mark that is stored per element has no way to
reach one.

Kept rather than deleted because the reasoning is sound and the evidence is the same evidence —
only the balance of it moved, once repairing the file was on the table as an option rather than
tolerating the divergence.
