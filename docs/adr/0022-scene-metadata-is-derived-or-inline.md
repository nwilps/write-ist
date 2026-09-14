# Scene metadata is derived or inline, and v2 writes no scene ids

Everything the application can read off the manuscript is **derived**: location, INT/EXT, time
of day, speaking cast, page number, scene length. Nothing about them is stored. The small
remainder the writer actually authors lives **in the manuscript**: a synopsis on Fountain's
standard `=`, and one open `tag: value` line per scene covering whatever single axis that
writer has adopted.

**Consequently v2 writes no `[[wi-scene:…]]` ids into any manuscript.** The mechanism ADR-0008
rule 1 confirms remains proven and available; nothing in v2 uses it.

## The forcing reason

The catalog carries one live `v2` item that wants data attached to a scene — *"Scene list with
metadata — location, characters, POV, status"* — whose own note says *"where it lives is the
second big storage question."* Answering it removed the last consumer of a durable scene id.

**Every other sidecar consumer had already been removed by a decision.** ADR-0013 established
that Plan and the Log refer to nothing in the manuscript. ADR-0018 put comments inline,
carrying their own ids, matched by id rather than position. Per-scene counts are ranges over a
flat model (ADR-0019). Once the scene list derives what it can and stores the rest inline,
**nothing in v2 refers to a scene from outside the manuscript at all.**

Writing an id into all 181 headings of the acceptance corpus adds 3,620 characters of machine
noise to a file that currently contains none, on every scene, in every lock, in every
round-trip — for no reader.

## The evidence

Researched across Final Draft, Fade In, Movie Magic Screenwriter, Highland 2, WriterDuet, Arc
Studio Pro and Scrivener. Three findings decided this.

**Serious tools derive what the text already states.** Final Draft *"automatically keeps track
of the speaking characters in each scene… as characters are entered into the scene, their
names automatically appear"* — and materialises that derived cast **as a paragraph in the
script**, not as sidecar data. Movie Magic sorts breakdowns by INT/EXT, location and
time-of-day straight from sluglines, with automatic normalisation of CONTINUOUS and LATER.
Final Draft's actual per-scene record on disk carries only `Length`, `Page`, `Title` and
`Color`, and the first two are computed.

**The industry's answer to "where does it live" is repeatedly *in the document*.** Movie Magic
writes breakdown tags into the script body as `[CS overcoat]`. WriterDuet's Outline is a line
type inside the script, non-printing by default. Fountain's own `=` and `#` are text. John
August, outlining a real script: *"I used the top-level section mark (#) to denote act breaks,
and the synopsis tag (=) to quickly jot out what was happening in upcoming scenes."* A
plain-text tool is on the mainstream path here, not working around a limitation.

**Usage is bimodal, which is the argument against a schema.** Measured across sampled real
`.fdx` files: one working writer's script had 98 of 99 scenes coloured and 1 titled; another
had 6 of 6 titled and 0 coloured; three others had nothing at all. A writer adopts *one* axis
wholesale or uses none. Nobody fills three fields on some scenes, and the two writers who did
use one picked different fields. A fixed Location/Characters/POV/Status schema would ship four
fields so that each writer could use one — which is what Final Draft and WriterDuet both
concluded after shipping the alternative, and why both now ship a category mechanism with no
writer-facing schema at all.

*Gap, recorded honestly:* no direct working-writer testimony. Forums were unreachable, so the
usage argument rests on vendor documentation, third-party walkthroughs and file measurements.

## Considered options

- **A sidecar record per scene, keyed by an in-band id.** Technically legal under ADR-0008 rule
  1, and rejected: it is the shape of the feature that died in v1, it makes every scene pay for
  an id, and it is strictly less portable than deriving. Nothing else would ever read it.
- **A fixed schema of authored fields.** Rejected on the bimodal evidence above.
- **Building on the boneyard**, where real writers already stash per-scene notes. Rejected in
  ADR-0021: `/* */` means "omit from output" to every Fountain tool, and formalising an abuse
  of it would collide with how Slugline, Highland and Scrivener all present it.
- **Keeping scene ids anyway, in case something later needs them.** Rejected. It is speculative
  scope paid for in every file, and ADR-0015 already establishes the principle that decides it:
  an id that can be minted later from unambiguous content is not the kind of data that is lost
  by being late. A scene id is derivable from the manuscript whenever a feature finally wants
  one.

## Consequences

- **This narrows ADR-0008 rule 1 in scope, not in force.** The rule — *an anchor exists on both
  sides, or is derivable from content* — is unchanged and still governs every anchor v2 writes.
  What changes is how many there are: **comments, and nothing else.** The `[[wi-scene:…]]`
  mechanism stays documented as confirmed, for the first feature that genuinely needs to name a
  scene from outside the text.
- **Issue #9 is closed as no longer applicable.** It exists to pin the acceptance corpus *with
  ids present*, because "the corpus as the design requires it to be written has never been
  pinned to a number". The design no longer requires ids to be written, so the ids-present
  corpus is not a thing v2 produces. Its second observation — that the prose surface has no
  corpus, no fixture and no gate of any kind — is real, survives this, and is re-raised
  separately.
- **Derivation must be incremental.** Cast and location for every scene, recomputed across the
  whole document on every keystroke, is precisely the defect `docs/STANDARDS.md` records under
  *"Measure the measurer"*. Derived data is computed on demand or incrementally, and any readout
  of it includes its own cost.
- **Deriving is more portable than storing, which is the interoperability argument.** Location
  comes from the slugline and cast from the character cues, so Highland, Slugline and Final
  Draft all reach the same facts from the same text. The synopsis rides Fountain's standard `=`,
  which every tool already reads. Only the `tag:` line is ours — inert to other tools, and the
  natural thing to map onto Final Draft's tag categories at `.fdx` export.
- **Comments and scene metadata stay separate mechanisms.** Final Draft's `ScriptNote` anchors
  to a span inside a paragraph and carries author and timestamps; `SceneProperties` is a
  property of a scene. They are different objects in the tool that has shipped both for
  decades. ADR-0018 already separated them here; this is corroboration, not a new decision.
- **The same conclusion holds for prose, and for the same reason.** ADR-0011 notes that
  Pandoc's attribute syntax gives headings ids — `## Chapter 2 {#ch-8f3a}` — as the in-text
  anchor ADR-0008 requires. Nothing in v2 anchors to a chapter either: comments are inline
  (ADR-0018), Plan and the Log point at nothing (ADR-0013), and per-chapter counts are ranges
  over a flat model (ADR-0019). **v2 writes no chapter ids.** The syntax stays in the subset, so
  a file arriving with them round-trips untouched.
- **The manuscript stays clean.** Nothing is added to a file unless the writer used the feature
  that adds it. A writer who never writes a comment, a synopsis or a tag has a file that is
  byte-for-byte what they started with.
