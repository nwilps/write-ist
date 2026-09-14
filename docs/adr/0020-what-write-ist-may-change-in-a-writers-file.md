# What Write-ist may change in a writer's file

> **The writer's words are theirs; the format is ours.**

That line settles a class of arguments and is the reason this ADR exists. Write-ist presents
rich text and stores plain text, so it is *constantly* transforming what the writer typed —
that is the application's whole job. What it may never do is alter the content of the work.
This ADR draws the line and makes it testable.

## The contract

1. **On first opening a file Write-ist has never seen**, it may apply the normalisations
   enumerated below, and nothing else, ever.
2. **Thereafter the file is ours.** Opening it and saving it without typing produces a
   byte-identical file on disk, forever.
3. **The import report** names every normalisation applied, once, at import. After that the
   application is silent and the writer writes.

### The enumerated normalisations

| | Why |
|---|---|
| CRLF and CR line endings to LF | One line-ending convention in the model; the corpus is LF and pinned against CRLF checkout |
| Runs of three or more newlines collapsed to two | Blank lines are not elements (ADR-0019); spacing is derived from adjacent element types, so an extra blank has nowhere to live |
| Trailing whitespace trimmed | Invisible, and it defeats byte comparison |
| Mark nesting emitted in the declared order | Marks are a set (ADR-0019); one order must be chosen on the way out |
| Unicode normalised to **NFC** | Below |

Adding a sixth is a decision someone makes on purpose, in this file.

## Unicode: NFC, and never NFKC

`é` can be stored as one character or as `e` plus a combining accent. The two are *canonically
equivalent* — identical in meaning and appearance — so converting between them is squarely on
the format side of the line above.

The forcing reason is not tidiness, it is search. Declining to normalise does not leave the
file alone; it leaves it **mixed**. The acceptance corpus is NFC today (one `é`, precomposed,
at line 3520), but macOS input methods commonly produce the decomposed form, so a writer
typing on a Mac introduces the other spelling of the same word. Find then fails on one of them
with nothing on screen to explain why. Normalising prevents a user-visible bug; refusing to
normalise causes one.

- **NFC only. Never NFKC or NFKD.** The compatibility forms rewrite `ﬁ` to `fi`, `½` to `1/2`
  and full-width to half-width. Those change the writer's characters and are excluded by name,
  because the function is one keystroke away from the right one.
- **Applied at import *and* at input.** Normalising only on the way in lets the platform
  reintroduce the other form on every keystroke. Everything entering the model is normalised,
  from any source, so every file Write-ist writes is uniformly NFC.

## The acceptance test this replaces

ADR-0004 makes round-trip *the* acceptance test. The gate at `nwilps/write-ist-ng@3812312`
is weaker than that ADR's words in two ways the Phase 2 review found: **it never writes a
file**, so it compares two in-memory strings and cannot see an encoding-level difference, and
it reports `b.length` — JavaScript characters, not bytes — which is the whole of the
170,679 / 170,682 confusion.

**The gate moves into this repo and writes a real file.** It asserts *fidelity* on first
import — source in, enumerated normalisations applied, bytes compared — and *idempotence*
thereafter, on a file the application itself wrote. A fixture in NFD is added, which must come
back NFC, so the Unicode rule has a test that can fail; `docs/STANDARDS.md` already holds that
a rule with no failing test is a preference.

## Considered options

- **Change nothing, ever.** The cleanest promise and it fails on the first real file: the
  acceptance corpus contains two stray double-blank lines that a model without blank-line
  elements cannot hold. Write-ist would have to refuse to open the manuscript it was built for.
- **Compare meaning rather than bytes** — parse both sides and compare models. Rejected: it is
  blind to exactly the class of defect ADR-0008 exists for, where the file on disk stops saying
  what the application thinks it says.
- **Buffer-first, which preserves unrecognised text for free.** The one genuine advantage of
  the design ADR-0019 rejected: text that is never parsed cannot be lost. Answered by the
  parser rules below rather than by reopening the model.

## Consequences

- **The parser's guess may be wrong about the element. It may never be wrong about the bytes.**
  This is the rule that makes model-first safe. Fountain has no unparseable text — its spec
  makes Action the catch-all, so any paragraph matching nothing else *is* action — which means
  a misread line is a visible, one-second fix for the writer, while a silently re-spaced line
  is invisible. Guessing is permitted; mutating is not.
- **A passthrough element exists on the prose surface and not on the screenplay surface.**
  ADR-0011 has Write-ist specifying its own *subset* of Pandoc Markdown, so Markdown outside
  that subset genuinely exists — tables, definition lists, raw HTML. Such a block is kept as an
  exact, untouched copy of its own text and written back byte-for-byte. ADR-0008 rule 4 is the
  governing precedent: report and keep, never discard silently. Fountain needs no such
  mechanism, and giving it one would be a second path for a case that cannot occur.
- **Forced element markers are emitted only where the text would otherwise parse as something
  else**, and every marker already in a file is preserved untouched. The acceptance corpus is
  maximally forced — `!` on every action line, `.` on every heading — so it stays that way
  while new lines are written clean, and the file becomes mixed. That is accepted: the
  alternatives are rewriting the writer's file wholesale or making every file Write-ist touches
  louder than a stranger needs it to be, and ADR-0003 says a stranger has to be able to read it.
- **Smart quotes are format, and therefore ours — but they are *visible* format, and therefore
  a setting.** Off by default on the screenplay surface, on by default on the prose surface,
  and switchable on both. This is the one place the principle at the top of this file meets
  something the writer will actually see happen as they type, which is why it gets a control
  when Unicode normalisation does not.
- **Pagination never writes to the manuscript.** Recorded in full in ADR-0024; it belongs to
  this contract, because `(MORE)` and `CONT'D` are the largest body of text the application
  could be tempted to insert into a writer's file.
