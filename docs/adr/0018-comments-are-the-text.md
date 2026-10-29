# Comments are the text: stored in the manuscript, never shown as syntax

A **comment** — the writer's remark about a place in the manuscript — is stored **inline in the
manuscript itself**, delimited in band and carrying an id, on both surfaces. It is never
rendered as syntax: the writer sees a floating card in the margin beside the text it points at,
creates one by selection and a keybinding or a right-click *(amended 2026-09-19 by
[ADR-0029](0029-spellcheck-is-the-systems-and-skips-names-and-headings.md): a keybinding and a
menu item, since right-click stays the system's for spelling)*, and never types or reads a
delimiter.

**The forcing reason is that this is the feature ADR-0008 was written from the corpse of.**
v1's highlights were sidecar records anchored to manuscript positions by an id the manuscript
never carried: 5,784 records against 5,788 lines, 532 KB describing nothing, abandoned rather
than debugged. ADR-0008's closing consequence already names the cheaper move and says to prefer
it — an annotation living inline makes the anchoring problem *stop existing* rather than being
solved. The editor-shape spike then built it: highlights have no Fountain syntax, so they ride
in band as `[[hl]]…[[/hl]]`, and the corpus round-trips byte-exact across 3,457 blocks. This is
the one decision on this map where the alternative has already been tried and has already
failed.

## Considered options

- **A sidecar record, pointed at by an in-band id.** Keeps the manuscript clean and keeps long
  comments out of the paginated text. Rejected: it is structurally the v1 design. ADR-0008
  rule 1 fixes the id half — the id would exist on both sides — but the rest of the burden
  stays, and every deleted span leaves an orphaned record that rule 4 requires be retained and
  surfaced. Inline storage has no orphans, because a deleted span takes its comment with it.
- **Restricting comments so they cannot overlap.** Considered at length and rejected on a
  product principle worth recording, because it will come up again: *when the question is
  "should we limit how a writer works", the answer is no.* Refusing an overlap means telling a
  writer their work is against the rules, for the convenience of a parser.
- **Requiring comments to nest and forbidding them to cross.** Rejected because the constraint
  turned out not to exist. See below.
- **A separate "work marker" affordance.** ADR-0008 observed that v1's highlights were being
  used as work tracking — "this scene needs work" — and proposed inline markers for it. That
  proposal is **satisfied by comments rather than by a second feature**: a comment is already an
  inline note rendered as a card, so a work marker is a comment whose text says the scene needs
  work. Two affordances over one mechanism is the merge the prototype's own falsifiable test
  warns against.

## Comments may nest and may cross

There is no restriction. `[[c:1]]She left. [[c:2]]He didn't[[/c:1]] follow.[[/c:2]]` parses
unambiguously, because **delimiters are matched by id rather than by position**. This is not
XML; the syntax is ours to define, and an id-matched delimiter pair has no nesting requirement.

The constraint that appeared to forbid this belongs to a different mechanism. The spike's
finding that *a mark set cannot round-trip a mark tree* is about bold and italic: those marks
carry no identity, so `_**x**_` and `**_x_**` are genuinely indistinguishable and one order has
to be chosen on the way out. Anything carrying an id is exempt, because the pairing is recorded
rather than inferred.

One serialiser rule follows: when two comments open at the same character, their delimiters
need a deterministic order — by id will do — so that re-saving an untouched file is
byte-identical. That is invisible to the writer and is not a product constraint.

## Consequences

- **This is a strong input to buffer-first versus model-first, and does not settle it.** Never
  showing syntax rules out the naive buffer-first editor — the one that puts raw text in front
  of the writer — but not buffer-first as such: a buffer-first editor can hide syntax behind
  decorations and widgets. What it does is raise the cost of that path, since every comment
  delimiter must be suppressed and every margin card positioned from a buffer offset rather
  than read off the model. ADR-0011 already named raw-syntax visibility as an input to this
  decision and ADR-0001 named the reflow trap; the spike returned a GO verdict on a model-first
  editor at 3,457 blocks. `SETUP-CHECKLIST.md` keeps the decision in Phase 3, which now has
  three inputs rather than two.
- **Comment data is in the manuscript; comments are not in the rendered manuscript.** They are
  stripped before pagination (ADR-0001 — anything occupying space moves a page break, and a
  page break that moves is a correctness bug), before word and page counts (ADR-0017 — counts
  come from the manuscript, and comments are now *in* it), and before PDF export. Whether an
  `.fdx` export carries them as Final Draft ScriptNotes rather than stripping them is an export
  question, not decided here.
- **A comment always covers a span, never a point.** With a selection, it covers the selection.
  With only a caret, it covers the enclosing block — the action line on the screenplay surface,
  the paragraph on the prose surface. One rule on both surfaces, and no sentence detection,
  which is wrong on exactly the text novelists write: `Mr. Darcy said nothing.` is two sentences
  to a naive splitter. A writer wanting sentence precision selects the sentence. Sentence
  snapping can be added later without changing a single stored file, because it would only
  change what is selected at creation time.
- **Comments carry forward, and clearing them is offered at the lock.** Everything carries into
  the next draft by default; the lock dialog, where the writer already chooses revision or
  draft (ADR-0002), also offers to clear them. That offer is safe only because the frozen copy
  keeps its comments regardless (ADR-0014), so clearing affects the draft being carried forward
  and destroys nothing.
- **Copying a commented span copies its comment.** ADR-0008 rule 1's existing paste behaviour
  applies unchanged: ids regenerate on collision, so the pasted text carries an independent
  comment with the same words. Two copies of a line get two comments, which is what a writer
  duplicating annotated text means.
- **An unmatched delimiter fails loudly and is retained.** A file edited outside Write-ist may
  arrive with a dangling `[[c:…]]`. ADR-0008 rule 4 governs: report it and keep it; never
  discard it silently, which is what made v1's loss undiagnosable.

  *"Loudly" means the import report says so, never that the file refuses to open* — Write-ist
  never refuses to open a writer's file (ADR-0020). The dangling delimiter stays in the element
  as the characters the writer has, which is also how the writer sees that something is off.
- **A comment is written once around everything it covers, across lines if the writer selected
  across lines, and is held once in the model.** Added 2026-09-18. One comment has one id and one
  remark, so it cannot be split per line the way a mark is
  ([ADR-0027](0027-a-mark-runs-from-its-opening-delimiter-to-the-next.md)) without either
  repeating the remark or orphaning it — and orphaning it is the failure this ADR exists to end.

  **Why comments and marks go opposite ways.** A mark was split per element because an asterisk
  left open across a line break shows as a literal `*` in any tool that reads Fountain strictly;
  writing a pair per line *repaired* the file. A comment needs no repair: each delimiter is a
  complete Fountain note on its own — `[[c:a1 remark]]` opens and closes its own brackets, and so
  does `[[/c:a1]]` — and fountain.io says notes *"can be inserted between lines, or in the middle
  of a line"* [V]. Every other tool hides both and shows the text between them normally. The same
  holds for `<!--c:a1 remark-->` and `<!--/c:a1-->` on the prose surface.

  **It follows that a comment is the first range in the model not attached to one element.** Its
  two ends are each an element and an offset, and it is kept on the document rather than on an
  element. Nothing about flatness changes — it is a range, nothing contains anything — and it is
  the same exemption ADR-0019 already grants anything carrying an id.

  **A forcing marker stays outside a comment's delimiters**, as it stays outside a mark's:
  `.[[c:a1 remark]]INT. KITCHEN - DAY[[/c:a1]]`. Comment delimiters are removed before an element
  is classified, so a comment wrapped round a scene heading or a character cue never changes what
  that element is.
- **A comment carries nothing but its text.** No author — ADR-0003 has no accounts and there is
  one person. No timestamp — the draft it froze with already dates it, and a date inline is
  noise in a file a stranger reads. No type, and no done flag.

  **And that text lives in the opening delimiter**, which this ADR left unsaid and its examples
  do not show: `[[c:a1 this line is weak]]She left.[[/c:a1]]`. **The argument above forces it.**
  Inline storage is preferred here because *"a deleted span takes its comment with it"* — and
  that is only true while the remark sits inside the span's own opening delimiter. Put it in a
  trailing construct or a block at the foot of the file and deleting the span orphans the
  remark, which is the sidecar failure this decision exists to avoid, rebuilt in band.
- **A resolved state is deferred, deliberately, and costs nothing to defer.** Marking a comment
  resolved rather than deleting it is a reasonable want. It is the *first* kind of data under
  `docs/STANDARDS.md`'s test — computable later from what is already saved — so being late
  costs a migration rather than data, unlike the ledger (ADR-0017), where being late destroys.
  No slot is reserved and no extensibility machinery is built: ADR-0004's format version is the
  mechanism, and a file written before the flag exists has an obvious correct default, which is
  unresolved. Recorded so a future reader knows the absence was decided rather than missed.
- **The prose surface's construct is an HTML comment, and the two surfaces now mirror.**
  Fountain supplies `[[ ]]` ready-made; Pandoc Markdown has no exact counterpart, so ADR-0023
  takes the HTML comment — the one construct in the Markdown world universally understood to be
  present in the file and absent from the output. Decided 2026-09-16:

  | | screenplay | prose |
  |---|---|---|
  | comment | `[[c:a1 remark]]span[[/c:a1]]` | `<!--c:a1 remark-->span<!--/c:a1-->` |
  | cut text | `/*` … `*/` | `<!--cut-->` … `<!--/cut-->` |

  Cut text carries **no id**, because Fountain's boneyard has none and boneyards do not nest,
  and it is **delimiters with an `omitted` flag on the elements between**, never a container —
  the shape ADR-0021 arrived at for the boneyard after a container was found writing into cut
  material. Any other HTML comment is a passthrough (ADR-0020).

- **One sequence is escaped inside a prose remark, and only one.** An HTML comment ends at the
  first `-->`, so a writer typing an arrow — *"cut this --> move to ch. 4"* — would terminate the
  comment early and corrupt the file. `-->` is therefore escaped as `--&gt;` within a remark.
  A bare `--` is left alone: the HTML spec dislikes it, no real parser terminates on it, and
  prose is full of double hyphens. Escaping one three-character sequence stays inside ADR-0012's
  line, which forbids prose *"escaped past recognition"* rather than escaped at all — and the
  writer never types or reads a delimiter in the first place.
- **`GLOSSARY.md`'s **Comment** entry gains where a comment lives.** The term arrived from the
  sidecar-freeze ticket describing what a comment *is*; it now also says that its text is stored
  in the manuscript and never shown as syntax.
