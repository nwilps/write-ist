# The editor-shape spike: evidence

Evidence for the open question **buffer-first or model-first?** (`docs/PLANNING.md`, and the
spike named in `SETUP-CHECKLIST.md` Phase 4). Written 2026-09-11. This is evidence and its
limits, not a recommendation — the decision belongs to the Phase 3 work on the document model,
with this in hand.

Source: the throwaway prototype repo `nwilps/write-ist-ng` at `3812312`, directory `spike/` —
a vanilla TypeScript editor built on **ProseMirror**, deliberately without React or Tauri so
that fewer layers sat between the question and the answer.

Confidence markers, as in the other research notes:

- **[V] Verified.** I checked it myself — read the source file, or measured the corpus on disk.
- **[S] Secondary.** Reported by the prototype's own documentation or test output. **I could
  not execute either of its gates: `pnpm` is not installed on this machine.**
- **[I] Inferred.** My reasoning.

---

## What the acceptance test was, and whether it was met

ADR-0004 sets the test: *"Parsing a manuscript and serialising it back must return what was
read. This is the acceptance test for any editor design, and it is why the 170 KB v1
manuscript is the corpus."* `SETUP-CHECKLIST.md` Phase 4 repeats it as the spike's gate.

**Reported result: `EXACT — 170679 bytes identical`.** [S]

The corpus is a finished 137-page feature screenplay. [I] It is almost certainly the same v1
manuscript ADR-0004 names — the sizes agree to within a rounding of "170 KB", and v1's
post-mortem describes the same document.

### The number needs pinning before this gate travels

The fixture on disk is **170,682 bytes** [V], not 170,679. The prototype's own
`.gitattributes` states 170,682 in a comment [V], while its README, its `CLAUDE.md` and its
plan all state 170,679 as the string the gate must print [S].

[I] The gap is the *output* size after the two declared normalizations below, not a
contradiction — but two documents assert a byte-exact round-trip against a fixture whose size
they give three bytes short, and the relationship is never stated. ADR-0004 makes this *the*
acceptance test, and an acceptance test needs an unambiguous number. Pin both, and the
relationship between them, if this gate moves into the repo.

### Two normalizations, declared rather than hidden

1. **Two stray double-blank lines in the source are collapsed** (reported at line 4086 and at
   EOF). [S] They cannot survive a model where blank lines are not blocks, because spacing is
   derived from adjacent block types and an extra blank has nowhere to live.
2. **Mark nesting order is not recoverable.** ProseMirror marks are a *set*, not a tree, so
   `_**x**_` and `**_x_**` parse identically and one order must be chosen on the way out. The
   prototype emits underline-outermost to match the corpus. [S] Any file using the other
   nesting normalizes on first save.

[I] Both are real constraints on the model, not artifacts of one library. The second is the
one to carry into Phase 3: *a mark set cannot round-trip a mark tree*, and whether that is
acceptable is a document-model decision, not an editor one.

## What I verified directly in the corpus

| Measure | Value | |
|---|---|---|
| Size on disk | 170,682 bytes | [V] |
| Line endings | LF only; `*.fountain -text` pins it against CRLF checkout | [V] |
| Newlines / non-blank lines | 5,787 / 3,459 | [V] |
| Scene headings, forced `.` prefix | **181** | [V] |
| Unforced `INT./EXT.` headings | **0** | [V] |
| Pre-existing `[[ ]]` notes | **0** | [V] |

The last row matters more than it looks: the in-band metadata scheme ADR-0008 now confirms has
a clean namespace in the real corpus, with nothing to collide with. [V]

**An observation nobody had recorded.** All 181 headings are written
`.**INT. LOCATION - DAY**` — forced prefix *and* bold inline markup inside the heading text.
[V] So the corpus carries presentation inside the very element that anchors attach to, and any
model must preserve mark nesting *within headings*, not only within action and dialogue. [I]

## What I verified in the source

- **Seven element types, flat, no container nodes**: `scene_heading`, `action`, `character`,
  `dialogue`, `parenthetical`, `transition`, `centered`. A scene is computed as a range — this
  heading through the block before the next — never a node that contains its content. [V]
- **Four marks**: strong, em, underline, highlight. [V]
- **`scene_heading` carries a `sceneId` attribute**, serialised in-band as a Fountain note.
  [V] This is the mechanism ADR-0008 rule 1 now records as confirmed.
- **Highlight has no Fountain syntax and rides in-band** as `[[hl]]…[[/hl]]`. [V] [I] This is
  ADR-0008's own recommended consequence implemented: the annotation *is* the text, so the
  anchoring problem for it stops existing rather than being solved. It is the direct answer to
  the v1 defect that forced ADR-0008.
- **The whole cost of computing scenes rather than nesting them is one file**,
  `editing/scenes.ts`, 148 lines. [V]

## What the prototype reports and I could not check

| | Reported | |
|---|---|---|
| Blocks after dropping blank lines | 3,457, from 5,788 lines — a ~40% cut | [S] |
| Scenes parsed | 181 / 181 | [S] |
| Scene ids unique, stable across save, serialize idempotent | yes | [S] |
| Parse / serialize time | ~19 ms / ~10 ms | [S] |
| Typing at 3,457 blocks, no virtualization | "blazingly fast"; multi-line selection working; no jank scrolling and editing throughout | [S] |

That last row is the one the spike existed for, and it is the one that cannot be automated —
it is a writer's judgement at a keyboard, and it was Noah's. [S]

## What this does *not* settle

- **It does not settle the document model.** It shows *a* model-first editor round-tripping
  one screenplay corpus. The element vocabulary, the Pandoc Markdown subset (ADR-0011), and
  how the two surfaces share a parser design are all untouched by it.
- **It says nothing about prose.** No prose surface exists in the prototype; the repo it comes
  from describes itself throughout as a screenplay application.
- **It does not license the webview to paginate.** This is the trap. ADR-0001 forbids asking
  the webview where text wraps — `measureText`, `getClientRects`, or simply letting CSS reflow
  a `contenteditable` — because Tauri renders in three different system text engines and a page
  break that moves between machines is a correctness bug. [I] "The editing engine passed"
  therefore does not extend to layout: an engine may own editing and must not own pagination.
  The prototype states the compatible half of this (export reads the model, never the editor
  DOM) and has not met the harder half, which is that on-screen page breaks must come from the
  same owned engine. Whatever Phase 3 decides, that seam is the thing to get right.
- **One known defect, contained.** Pasting multi-line content types the first pasted line as
  the block it landed in rather than keeping its own type — standard ProseMirror slice
  behaviour, correct for prose and wrong for screenplay, where element type is semantic. [S]
  Reported as one handler's worth of work, not architectural.

## Why this is evidence and not a decision

The spike answered the question Phase 4 asked it, on the corpus ADR-0004 named, and a finished
screenplay's worth of real messy text is a better fixture than anything that could be invented.
That force does not expire.

But it tested *feel* and *round-trip*, which is not the same as testing the model — and the
model is what Phase 3 is for. Recording the result here keeps the evidence and leaves the
decision where it belongs.
