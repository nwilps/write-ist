# Scene metadata in other tools: evidence

Evidence behind [ADR-0022](../adr/0022-scene-metadata-is-derived-or-inline.md) and the boneyard
section of [ADR-0021](../adr/0021-the-screenplay-surface-implements-all-of-fountain.md).
Gathered 2026-09-14, against primary sources where they exist.

Confidence markers, as in the other research notes:

- **[V] Verified** — read in a primary source, or measured in a file.
- **[S] Secondary** — a vendor blog, forum post or third-party walkthrough.
- **[I] Inferred** — reasoning.

---

## What each tool actually stores

**Final Draft** keeps three mechanisms that are routinely confused. **[V]**

- **`SceneProperties`** is the only true per-scene record, and in real `.fdx` files it carries
  `Length`, `Page`, `Title`, optional `Color`, and a `SceneArcBeats` child. `Length` and `Page`
  are computed. There is no summary, POV, status or custom field on it.
- **Tags** are the customisable layer. A blank FD13 document ships 29 `TagCategory` entries —
  Cast Members, Props, Wardrobe, Location, Synopsis, Script Day and so on. Scene *synopsis* is
  not a field; it is a tag category, and Final Draft's own KB article on using it frames the
  payoff as the synopsis appearing on a Movie Magic Scheduling stripboard. **[V/S]**
- **`ScriptNote`** is not scene metadata at all: it nests *inside* a `Paragraph`, anchored to a
  text position, carrying `Author`, `Color`, `DateTime` and a rich-text body. It is a comment on
  a span. **[V]**

**Movie Magic Screenwriter** stores breakdown tags **inline in the script text** as bracketed
codes — the manual's own example is `[CS overcoat]` for a costume item. Its breakdown sort keys
(INT/EXT, location, time-of-day, characters) are all derived from headings and dialogue, with
documented automatic normalisation of CONTINUOUS / LATER / SAME TIME. **[V]**

**Highland 2** has no structured scene metadata; its KB lists only Fountain constructs. The
`.highland` container holds the plain `.fountain` plus JSON sidecars for app state, not
per-scene fields. **[V/S]**

**WriterDuet**'s Outline is a *line type inside the document*, non-printing by default — outline
text lives in the script. Its Tagger ships no fixed categories; users invent them. **[V]**
**Arc Studio**'s metadata attaches to *beats* on a Plot Board, not to sluglines. **[V]**

**Scrivener**, the prose analogue, offers Label, Status, Keywords and unlimited user-named
custom metadata in four types. Its synopsis auto-fills from the opening text if left blank.
**[V]**

**Fade In** and **Causality**: feature lists verified, on-disk representations **could not be
verified** — no published schema or reachable sample. **[V/S]**

## Derived versus authored

| Field | Derivable? | Does any tool derive it? |
|---|---|---|
| Location, INT/EXT, time of day | Yes, from the slugline | **Yes** — MMS sorts breakdowns straight from headings, with normalisation. **[V]** |
| Speaking cast | Yes, from character cues | **Yes** — Final Draft: *"automatically keeps track of the speaking characters in each scene… when a character is removed from a scene, it is removed."* **[V]** |
| Page and length | Yes, from layout | Yes — FD's `Length` / `Page`. **[V]** |
| Non-speaking cast | No | Hand-inserted. **[V]** |
| Summary / synopsis | No | Scrivener alone auto-fills, from the opening text. **[V]** |
| Colour, POV, status, storyline | No | Nothing derives these. **[V]** |

**[I]** The pattern is consistent: tools derive what the text already states and ask the writer
only for judgements the text cannot express. Final Draft's derived cast is materialised **as a
paragraph in the script**, not as sidecar data — which is the same answer a plain-text tool
would reach independently.

## How much it is used, measured

Populated fields counted in real `.fdx` files found on GitHub. **[V]**

| File | Scenes | `Title` set | `Color` set | ScriptNotes |
|---|---|---|---|---|
| Afterglow v5 Outline (working writer) | 99 | 1 | **98** | 0 |
| ConnieFD11 | 6 | **6** | 0 | 22 |
| unclebob/ScriptSchedule | 171 | 0 | 0 | 4 |
| A Silly Girl | 63 | 0 | 0 | 4 |
| The War Is Over (feature) | ~90 | 0 | 0 | 0 |

**[I]** Small and GitHub-biased, so indicative only. But the shape is striking and it is the
finding ADR-0022 turns on: usage is **bimodal, not gradual**. A writer either uses one field
across the whole script or uses none. Nobody fills three fields on some scenes, and the two
writers who did adopt one picked *different* fields.

**[S]** Vendor framing supports the same reading. Final Draft's own documentation introduces
tagging as a job an AD, line producer or UPM does to prepare a script for production, and then
argues separately, in a blog post, that writers *could* use it too. **[I]** A vendor
evangelising its own production feature to writers is weak evidence of writer adoption.

**[V]** The one writing-side practice with independent support is colour-by-storyline, which
predates software as coloured index cards. And John August, outlining a real script in Fountain:
*"I used the top-level section mark (#) to denote act breaks, and the synopsis tag (=) to
quickly jot out what was happening in upcoming scenes."*

## The boneyard in real use

**[V]** Measured across 83 screenplay-like `.fountain` files (>1.5 KB, containing INT./EXT.):

| Construct | Files using it |
|---|---|
| Synopses (`=`) | 12% |
| Sections (`#`) | 11% |
| Notes (`[[ ]]`) | 8% |
| **Boneyard (`/* */`)** | **7%** |
| Scene numbers (`#1#`) | 1% |

**[V]** More telling than the rate is the content. Of the six boneyard-using files, three are
spec fixtures or documentation examples. Of the genuinely authored uses, **neither is cut
material**: one holds reviewer comments signed with initials, one holds per-scene metadata
(`/* Power arc: EXPOSED -> ACCEPTED */`).

**[V]** Every implementation renders boneyard text *visibly* rather than hiding it. Slugline
exposes it as **Format ▸ Omit**, highlighted in blue and excluded from print; Scrivener imports
it struck through, removable at compile.

**[I]** So writers reaching for the boneyard are using it as an escape hatch for structured
annotation the format does not otherwise provide — which is the gap ADR-0018 fills properly.
Supporting it for fidelity is cheap; building a metadata story on it would formalise a hack and
collide with how every other tool presents it.

## Gaps

- **No direct working-writer testimony.** Reddit and the screenwriting forums were unreachable
  from the research environment. The usage argument rests on vendor documentation, third-party
  walkthroughs and file measurements — not on writers speaking for themselves. This is the
  weakest part of the evidence and is recorded as such.
- Fade In's and Arc Studio's on-disk formats, and Causality's per-scene field list.
