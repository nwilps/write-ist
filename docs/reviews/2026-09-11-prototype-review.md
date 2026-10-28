# Prototype review — Plan and Log, read against the written decisions

Phase 2 of `SETUP-CHECKLIST.md`, 2026-09-11. Reviewed: `nwilps/write-ist-ng` at `3812312` —
`docs/MASTER-PLAN.md` (1,722 lines, 2026-09-01→09-07), `docs/ARCHITECTURE.yaml`
(`updated: 2026-09-07`), and the code in `spike/` (the ProseMirror editor spike and
`plan.html`, which holds a Draft mockup, Plan and the Log).

Read against `GLOSSARY.md` and ADRs 0001–0012, which were written 2026-09-10→09-11 — **every
ADR postdates every line of NG's planning.** Where they conflict, the ADR is later by
construction. Later is not righter; §3 and §4 below name the places the prototype is right
and the decision should change.

---

## 1. Where the prototypes and the written decisions disagree

### 1.1 "Draft" is a workspace in NG and a numbered state of the work in the repo

**The collision.** NG ships "three workspaces — **Draft** writes it, Plan shapes it, Log
paces it" (README, MASTER-PLAN §17, `ARCHITECTURE.yaml: draft-editor`, and the tab in
`plan.html:695`). `GLOSSARY.md` defines **Draft** as "a numbered state of the work… exactly
one draft is in progress at any moment", and names the workspace **Editor** — "the Editor,
where the in-progress draft is written, is a workspace like any other."

So "the Draft workspace" and "draft 2a" would be one word for two things, in a project whose
entire version model (ADR-0002) is built on the second meaning. This is the most damaging
naming collision in the two repos and the cheapest to fix: **rename NG's workspace to
Editor** on the way in.

Knock-on: `plan.html` persists `entries[].ws = "Draft" | "Plan" | "Log"` — a workspace *name*
written into stored data (`plan.html:1942,1977,1985`). That wants a stable workspace id that
survives a rename, which is ADR-0005's registry argument applied to data rather than code.

### 1.2 The draft model is absent from NG, not disagreed with — ADR-0002

Nothing in MASTER-PLAN, `ARCHITECTURE.yaml` or either prototype knows about locking,
revisions, lineage (`2a`/`2b`), the **line**, or **set aside**. `ARCHITECTURE.yaml` lists ten
foundations and draft lineage is not one of them — yet by its own `accrues: true` test it
should be near the top: locking is the only thing that mints a number, and a draft you did
not lock cannot be reconstructed afterwards.

**The consequence NG has never had to meet.** ADR-0002 freezes the manuscript *and the
sidecar* together on every lock, and `GLOSSARY.md`'s **Sidecar** names "notes, plan cards, log
entries" explicitly. So locking copies the Plan and the Log.

For Plan that is probably right — the plan for draft 2 is a fact about draft 2.

For the Log it is probably wrong. The Log is a record of the writer's *days* (§18.1: "every
item sits on the day it is about"), it spans drafts by nature, and freezing it per draft
would fragment the one continuous thing in the app. §19.2 already wants metrics to live
there.

**This is a hole in ADR-0002, not just in NG.** ADR-0002 says manuscript and sidecar freeze
together without asking whether every part of the sidecar should. It needs an amendment or a
companion ADR deciding which sidecar content is per-draft and which is per-project. The
prototypes are what made the question visible.

### 1.3 "Mode" is one concept where ADR-0005 deliberately has two

`ARCHITECTURE.yaml` has `workspace-registry: "Mode and workspace registration"`, and §3.5
defines it: "A **Mode** declares: id, label, workspaces, file layout, serializers."

`GLOSSARY.md` lists "mode" under **Surface**'s _Avoid_. But NG's Mode is not Surface — it is
the *union* of ADR-0005's Surface (element vocabulary + layout rules ≈ "serializers") and
Format (a label plus defaults, including which workspaces show). ADR-0005 is exactly the
decision that splits them, and the split is what makes the format list cheap enough to be
generous with.

This is under-determination rather than a considered disagreement: NG only ever has one
mode, screenplay, so nothing forced it apart. It breaks the moment prose arrives.

### 1.4 Plan's grid is measured in "pages"; those are **targets** — ADR-0001, glossary

§15.1: "One cell = one page." "Page count is a user setting." The inspector reads `starts p12
· 4 pages · ends p15`. The card record is literally `{id, label, desc, page, lane, len}`
(`plan.html:878`).

`GLOSSARY.md` — **Page**: "computed from the manuscript by our own pagination engine. Always a
fact, never authored." **Target**: "A page number the writer authors on a plan card… Comparing
the two is the point of the Plan workspace, which is why they never share a word."

Plan's `page` is authored, so it is a target. NG knows the distinction and states it in its
own words twice — `ARCHITECTURE.yaml`: "Plan's pages are planning units, not draft pages";
§15.8: "Cards are absolute; structure is proportional" — it just has no second word, which is
why §12.1's table used "target" and "page" in the same row for the same card.

**This is a rename, not a redesign.** `card.page` → `card.target`, `card.len` → target length.
The behaviour is right, and your instinct is confirmed: Plan's independence from the
manuscript is precisely why the glossary keeps the two words apart.

### 1.5 Plan as built is a screenplay workspace — ADR-0010

The current card is format-neutral (§13 cut every scene reference; the record holds no scene
id). Good. But everything around it is sized for a feature screenplay and does not transfer
to prose:

- **The unit is the page**, and ADR-0001 makes the page a *screenplay-semantic* claim —
  roughly a minute of screen time. A novelist does not plan in pages; ADR-0010 says a prose
  manuscript's structure is parts and chapters, and prose has no scenes to card up at all.
- **All five structure sheets** — Save the Cat, Hero's Journey, Sequence Approach, Story
  Circle — are screen-story frames. Snyder's beats are stored as `page/110`
  (`plan.html:897–911`): a feature-screenplay constant baked into the data.
- **12 lanes × 34px cells × 100 pages** is a feature-shaped canvas. A 400-page novel is 400
  cells wide against a number the writer never thinks in.

This is allowed — ADR-0006 lets a format choose which workspaces a new project shows — but it
is *not* what `GLOSSARY.md` implies when it lists Plan among workspaces any format may show.
Two honest resolutions; pick one rather than leaving it ambiguous:

1. **Plan's X axis becomes a manifest choice** — pages for screenplay, chapters or thousands
   of words for prose. The grid, the cards, the lanes and the packing are all axis-agnostic
   already.
2. **Plan is declared screenplay-default**, and prose planning is a later, separate workspace.

Either way the best part survives untouched: §15.4's **structure sheets stored as fractions
of the whole, never as page numbers**, so a sheet holds its shape at any length. That
mechanism is format-neutral as written.

### 1.6 `localStorage` persistence — ADR-0003, ADR-0009, ADR-0012

Both prototypes persist JSON to `localStorage` (`plan.html:775,845,1990`). A browser profile
store is an opaque database file: it fails ADR-0003 (readable without the app), ADR-0009 (no
binary, no database files) and ADR-0012 (the writer's words come back as readable documents).

§13.4 is explicit that this is a prototype expedient, so it is not a real disagreement. What
matters is the consequence: **the prototypes have never exercised the storage constraint that
will shape them.** And they hand you the first worked example of ADR-0012's split, which is
worth recording:

| ADR-0012 category | In Plan / the Log |
|---|---|
| The writer's words → a readable document, lossless parser | card `label`, card `desc`, entry `body`, push `label` |
| App bookkeeping → plain structured text | `page`/`lane`/`len`, `made`/`due`/`done`, `push`, `ref`, `ws`, `band`, `at`/`to` |

Nothing in NG has designed that seam. It is small, and it is the next thing Plan and the Log
need in order to be real.

### 1.7 "The sidecar problem is solved in-band" — ADR-0004, ADR-0008, ADR-0012

§1.2 and `ARCHITECTURE.yaml`'s `fountain-storage` detector: "**anything kept in a sidecar
desyncs**; anything the format cannot express has to be smuggled in-band as bracket notes."

The repo says the opposite in shape: ADR-0004 *requires* a sidecar ("a project is therefore a
folder bundle"), ADR-0008 gives it six integrity rules, ADR-0012 gives it a readability
standard.

These reconcile, and the resolution is the repo's. NG is right that anything **anchored** to
the manuscript belongs in-band — that is ADR-0008 rule 1 exactly. It is wrong that a sidecar
can be avoided: Plan cards and Log entries *are* sidecar, and they anchor to nothing. ADR-0008
makes that the safe case, not the dangerous one — v1's `notes.md` survived the bug precisely
because it anchored to nothing.

The distinction the repo has and NG lacks: **in-band for anything that points at the
manuscript; sidecar for anything that does not.** NG framed the sidecar as a hazard rather
than as a place, which is why its two biggest surfaces live in a store it never designed.

### 1.8 Pagination is parked in NG and structural in ADR-0001

`ARCHITECTURE.yaml`: `pagination-engine: status: parked`. §13.2 reopened §2.1 in favour of
"phase-1 PDF via afterwriting" now that Plan no longer projects.

ADR-0001 closes it: pagination is computed by code we own, against bundled Courier Prime, with
**one engine shared by screen and PDF export** — "a second engine for export would let the
on-screen page count and the exported page count disagree, which makes the count a lie." So
§2.1(a) is out.

NG agrees on the principle in two places without joining them up — §3.4 "PDF export reads the
model, never the editor DOM", §5.2 "Bundle Courier Prime. Never assume a system font" — and
ADR-0001 supplies the reason NG half-sees in §2.2: under Tauri the webview is *three*
different text-layout engines, so owning the line-break math is mandatory rather than merely
wise. §2.2's WebKitGTK worry and ADR-0001's constraint are the same fact.

### 1.9 §19.2's reference picker reopens ADR-0008

The Log's `ref` is free text today (`SEED_REFS = ["sc. 4", …, "Act two turn"]`,
`plan.html:1927`), and NG's own rules keep it that way: a breadcrumb, "inert text, never a
live link" (its CLAUDE.md, §17.4, and the `reads-from-draft` hazard). `docs/PLANNING.md` open
question 4 independently reaches the same recommendation: *don't*.

But §19.2 lists as still-open: "In the real app it must draw from actual Draft scenes and Plan
cards." That is NG's own hazard firing on NG's own list.

ADR-0008 settles it. A stored reference to a scene is v1's `lineId` with better manners. Keep
the inert text. A picker may *suggest* from live scenes and cards, but it must paste text —
never store an id — unless the reference is promoted to a real in-band anchor.

### 1.10 "The app never asks the user where to save" — ADR-0009

§3.6, carried forward from v1. ADR-0009 says export "can produce binary files — PDF, EPUB,
DOCX — written wherever the writer chooses, outside the bundle", and that an ebook cover is
"chosen from disk at export time". Minor, but a direct contradiction. Scope §3.6's rule to
*project storage* and let export ask.

---

## 2. Vocabulary

### 2.1 Different words for things `GLOSSARY.md` already names

| NG term | `GLOSSARY.md` term | Note |
|---|---|---|
| Draft *(workspace)* | **Editor** | Collides with **Draft**, the numbered state. §1.1 above. |
| Mode | **Format** + **Surface** | One concept where ADR-0005 has two. "mode" is on Surface's _Avoid_ list. |
| page *(a card's X)* | **Target** | Kept apart on purpose. §1.4 above. |
| the file, `.fountain` | **Manuscript** | §3.4's Model/View/File triad is good; its "File" is the Manuscript. |
| element types / schema | **Element**, owned by the **Surface** | Same idea. But NG calls serializers part of the *Mode*, which re-tangles 2.1's row 2. |
| `board.json`, beat, sequence | **plan card** | §1.9's three tiers are superseded; the filename persists in the thinking. |
| projection | *(no repo word)* | Retired by §13, but still the clearest name for "a derived read-only view of the manuscript". |

### 2.2 Concepts NG has that the glossary is missing

Worth adding to `GLOSSARY.md`:

1. **Push** — a named date range with a pace readout; "a deadline is a push with no tasks in
   it" (§18.9). One object that starts tracking the moment it has something to track. No repo
   word, and a good idea.
2. **Earmark** — the reference a thought was captured against, stored as inert text (§18.5).
   Worth naming *because* it is the deliberate non-**Anchor**: an anchor must resolve, an
   earmark must not. Naming it is what stops ADR-0008 being violated by accident.
3. **Band** (§15.6) — a group of structure beats belonging to one frame of thinking. "The user
   assigns the band, never the row — a row number is meaningful only against one particular
   set of collisions." That is the same reasoning that makes **Line** computed rather than
   stored; the rule wants generalising.
4. **Structure sheet** and its **beats** — stored as fractions of the whole. Naming hazard:
   `GLOSSARY.md` currently _Avoid_s "beat" as a synonym for **Scene**, but NG's beat is a mark
   on a structure sheet, a different thing. Either coin **structure mark**, or define "beat"
   narrowly and cross-reference it out of Scene's avoid-list.
5. **Lane** and **cell** — Plan's Y carries no meaning; a lane is pure layout. The glossary
   describes the Plan workspace without any of its nouns.
6. **Foundation** and **accrues** (`ARCHITECTURE.yaml`) — "a foundation whose absence destroys
   something rather than deferring it." Sharper than anything in the ADRs. ADR-0004 already
   contains an unnamed instance: "write a format version into the bundle from day one — it
   costs one field now and is unrecoverable later."
7. **Project identity** — an id surviving rename and move. `GLOSSARY.md` defines **Project**
   and says nothing about its identity; `ARCHITECTURE.yaml` correctly marks it absent.
8. **Cross-project store** — the layer *above* a bundle. **Bundle** is per-project by
   definition and ADR-0009 governs only what is inside one; metrics, backup, recent projects
   and global search all need somewhere above it, and neither the glossary nor any ADR names
   that place.
9. **Event log** — an append-only record of time in a workspace. Absent from the glossary and
   from every ADR, and the one thing NG flags as accruing.
10. **Capture overlay / global surface** (§17.5) — reachable from anywhere, outside any
    workspace. `GLOSSARY.md`'s **Workspace** is "a full screen the writer switches to, one at a
    time", so an overlay is explicitly not one: ADR-0005's shell contract has a hole here.
11. **Quiet break / gap** (§18.3) — past and future emptiness as different objects. Lovely,
    probably too specific for the glossary.

---

## 3. What the decisions make impossible, and what they make easier

### 3.1 Made impossible, or much harder

| Prototype assumption | Decision that closes it |
|---|---|
| Plan works for novels as built | ADR-0010 (prose has no scenes; structure is parts and chapters) + ADR-0001 (the page is a screenplay-semantic unit). §1.5 above. |
| §19.2's picker drawing from live scenes and cards | ADR-0008 rule 1 — an id held on one side is not an anchor. |
| §1.9–§1.10 projection, §12 Live mode | Needs an owned pagination engine (ADR-0001) *and* a card→scene anchor (ADR-0008). Two hard foundations for one nice-to-have. §13 cut it; the ADRs independently confirm the cut. |
| §2.1(a) afterwriting-CLI PDF for phase 1 | ADR-0001 — one engine, screen and export. |
| `localStorage`, or any database, as real storage | ADR-0003 / 0009 / 0012. |
| Anything image-shaped attached to a card | ADR-0009, permanently. A planning grid invites mood boards; it must not get them. |

One precision, because it is counter-intuitive: **§1.9's sequences would actually have been
legal.** A sequence is `{id, title, startSceneId, endSceneId}`, and §1.11 already writes those
scene ids into the Fountain — so the anchor exists on both sides, which is all ADR-0008 rule 1
asks. Sequences are the one retired feature the integrity rules would have allowed. They are
still not worth reviving; but the reason is scope, not integrity.

Card colour (§13.6, and pushes already carry a `colour` field) is **free** under ADR-0012 —
colour is bookkeeping, and structured text holds it fine.

### 3.2 Made easier than the prototype assumes

1. **Scene identity is solved, and the ADRs bless it.** `[[wi-scene:a7f3c1]]` in-band (§1.11,
   `schema.ts`, `parse.ts`) is precisely ADR-0008 rule 1 and `PLANNING.md`'s "likely fix" —
   and it is *built and proven*: 181/181 scenes, stable across save, unique, serialize
   idempotent. **`SETUP-CHECKLIST.md` Phase 4's "the sidecar anchoring scheme (ids in Fountain
   `[[ ]]` notes?)" can be closed.** The only open detail is regenerating ids on paste
   collision, which §1.11 already names.

2. **The v1 highlights bug is already fixed, by the mechanism ADR-0008 recommends.**
   `[[hl]]…[[/hl]]` is an inline mark that round-trips (`inline.ts`, `schema.ts`). ADR-0008's
   own consequence — "work markers living inline in the manuscript as Fountain notes make the
   anchoring problem *stop existing* rather than being solved" — is implemented. A 532 KB file
   describing nothing cannot recur, because the annotation *is* the text.

3. **ADR-0004's acceptance test is already passed, on the corpus ADR-0004 names.** NG reports
   **EXACT — 170,679 bytes identical**, with two declared normalizations (two stray
   double-blanks; mark nesting order, since PM marks are a set not a tree). ADR-0004 says
   round-trip is the acceptance test for any document model and names the 170 KB v1
   manuscript as the corpus. Met.

4. **The buffer-first vs model-first question is answered.** `SETUP-CHECKLIST.md` Phase 4 and
   `PLANNING.md` open question 2 both still list it. ProseMirror is model-first, and §11 is a
   GO verdict from a real writer on the real 137-page script (3,457 blocks): "blazingly
   fast", no jank, **multi-line selection working** — the v1 dealbreaker, gone.

   **One caveat to carry into the port, and it is the live risk.** ADR-0001 forbids asking the
   webview where text wraps — `measureText`, `getClientRects`, or letting CSS reflow a
   `contenteditable`. So ProseMirror may own *editing* but must not own *pagination*: the
   owned engine decides line and page breaks, and PM draws a layout already decided. NG states
   the compatible half (§3.4, export reads the model) and has not yet met the harder half
   (on-screen page breaks from the same engine). That seam is the thing to get right in
   Phase 5.

5. **Phase 3's blocker starts from evidence, not a blank page.** Blank-lines-are-not-blocks
   (§1.12) and the flat schema (§1.13) are exactly the document-model inputs the checklist is
   waiting on, with measurements: 5,788 lines → 3,457 blocks (a 40% cut in the dimension PM is
   weakest on), and the flat schema's entire cost is one ~150-line file (`editing/scenes.ts`).

6. **ADR-0007 makes NG's schema permanently small.** Seven element types and four marks, no
   structured-data node, no layer aligned to character positions. NG never had to consider
   recipes or chords; the ADR makes that permanent rather than accidental.

7. **The capture overlay may be cheaper than §17.5 assumes.** §17.1's test — "a thing you want
   available alongside every workspace is not itself a workspace" — is right, and led NG to
   conclude it needs a *third registration kind* and a day-one shell contract change. But
   ADR-0006 already lets the writer add or remove any workspace regardless of format, and
   `GLOSSARY.md`'s **Workspace bar** is persistent with keybindings. Specified as a shell
   affordance over the existing registry rather than a new kind, it may be a smaller change.
   Worth re-costing before treating it as a day-one blocker.

8. **Half-easier: undo.** §19.2 — "There is none, anywhere. Delete is final." For the
   manuscript, `GLOSSARY.md`'s three-way split (session undo / autosave / drafts) plus ADR-0002
   means nothing is ever lost that was locked. For the **Log** it gives you nothing: the Log
   spans drafts, so it cannot borrow the draft model's safety. That is a real gap and the
   glossary is what tells you it cannot be hand-waved.

### 3.3 Where the prototype is better — change the decision

1. **§3.5's testable rule.** "The shell source must not contain the string `"screenplay"`
   anywhere." ADR-0005 states the principle; this is the falsifiable version of it. Add it to
   ADR-0005's consequences verbatim.
2. **§16, as a class.** Twelve standards from bugs that cost real time. Several are general,
   not prototype-specific: §16.2 "a performance readout that excludes its own cost is not a
   measurement"; §16.6 "1-based display, 0-indexed storage — convert at the boundary, once";
   §16.12 "determinism claimed in a comment is not determinism"; §16.11 "two sightings of one
   symptom is a structural cause". These are rules, not decisions — a standards doc, not ADRs.
3. **§14's stopping rule.** "The prototype is done when the next change you want to make would
   not change what you would build." Sharper and more actionable than
   `SETUP-CHECKLIST.md`'s "timebox the setup", and it addresses the same failure.
4. **§20's `accrues` distinction.** The category of cost where lateness destroys data rather
   than deferring work. ADR-0004 has an unnamed instance of it; naming the category makes the
   next one findable before it bites.
5. **§17.3's pacing philosophy.** "Pace is deadline-driven and slip-tolerant… pin the target,
   let the overrun be *visible* rather than absorbed" — the same move as §15.7's template lock
   refusing to stretch. That is a product principle the repo has nowhere, and it is the answer
   to "what does the tool do on the day you fall behind?" Also: "almost every writing tool is
   an outlining tool; very few help you finish."
6. **§15.6's band rule**, generalised: *the user assigns intent, never outcome* — a band
   survives a change in page count or cell size because it encodes why, not where. Same shape
   as **Line** being computed rather than stored.

---

## 4. The two sets of planning docs

### 4.1 The structural problem

`MASTER-PLAN.md` is append-only and self-superseding. Roughly a fifth of it is explicitly dead
text kept for its reasoning — §1.6, §1.8, §1.9, §1.10, §10, §12, §12.3, §13.6 — which is why
it needs a "READ THIS FIRST" header, a five-item reading order, and a "do NOT implement these"
list before it can be used at all. `ARCHITECTURE.yaml` exists *because* of this (§20.2: "the
current-state index did not exist anywhere"), and it needs a `/idea` skill that is not in the
repo.

That is a defensible format for a journal and a poor one for a source of truth. The
ADR-per-decision format does not have the problem.

**So the job is not "merge two planning docs."** It is: extract the live decisions from
`MASTER-PLAN.md` into ADRs and standards here, and stop `MASTER-PLAN.md` being authoritative.

### 4.2 Contradicts the ADRs

- README: "a cross-platform **screenplay** writing app" — the repo is two surfaces across many
  formats. NG mentions prose once, in §1.1: "future editor modes (prose, essay, poem, notes)
  are mostly just new schemas over the same engine." ADR-0005 says that is half right (a
  surface is layout rules too, not only a vocabulary) and ADR-0011 says it is wrong about
  storage — prose is Pandoc Markdown, not Fountain, so it is a second serializer family, not a
  second schema.
- §2.1 PDF leaning → ADR-0001 (§1.8 above).
- §1.2 "the sidecar problem is solved in-band" → ADR-0004 / 0008 / 0012 (§1.7).
- §3.5 Mode → ADR-0005's Surface/Format split (§1.3).
- §3.6 "never asks where to save" → ADR-0009's export-anywhere (§1.10).
- §19.2's reference picker → ADR-0008 (§1.9).
- `ARCHITECTURE.yaml` `pagination-engine: parked` → ADR-0001 makes it structural (§1.8).

### 4.3 Predates the ADRs — not wrong, just earlier

- §1.8–§1.10, §12 — already marked superseded by NG; the ADRs agree independently.
- §2.2 Tauri vs Electron, "still to decide" — ADR-0001 does not pick the shell but defuses the
  question: pagination is ours either way, so the webview only draws a decided layout. The
  decision is easier than §2.2 thinks, and NG does not know that yet.
- §2.5 Beats semantics, §2.6 Tasks scope — retired by §13 / §17, and by ADR-0010 removing the
  scene bridge to prose.
- §5.1 `.fdx` — compatible with ADR-0004 and ADR-0009. No conflict.
- §4.2, §4.3 extraction ideas — orthogonal.
- `ARCHITECTURE.yaml`'s ten foundations — none wrong, but the list predates ADR-0002 and so
  carries no draft-lineage/lock foundation, which by its own `accrues` test is the most
  important one missing after `event-log`.

### 4.4 What to do about the drift

1. **Lift the live decisions into ADRs here.** Six candidates: ProseMirror and model-first
   (closes `PLANNING.md` open question 2 and part of Phase 4); the flat schema; blank lines
   are not blocks; in-band scene ids (closes Phase 4's anchoring question); the Plan spec
   (§15); the Log spec (§18).
2. **Lift §16 and §14's stopping rule into a standards doc.** They are rules, not decisions —
   ADRs would be the wrong container.
3. **Take `ARCHITECTURE.yaml`'s idea, not its file.** `accrues`, detectors and hazards are
   worth more than the YAML, which depends on a skill that is not in the repo. At minimum add
   `accrues` as a concept, add the missing foundations (draft lineage), and add
   `cross-project-store` and `project-identity` to `GLOSSARY.md`.
4. **Then mark `write-ist-ng` reference-only** — the same status it already gives v1. Its
   README calls itself throwaway; make that operative by ceasing edits to `MASTER-PLAN.md`,
   not by deleting it.
5. **Sequence this against the catalog sunset.** There are *three* parallel stores right now,
   not two: the feature catalog Artifact, `MASTER-PLAN.md`, and this repo — plus the Plan/Log
   prototype is itself published as a fourth
   (`claude.ai/code/artifact/764804b8-a48a-4afb-9a92-a575c8597d6c`, with republish
   instructions in `spike/CLAUDE.md`). Retire them one at a time — catalog first, since it is
   already decided — or you trade two-way drift for three-way.

---

## 5. Holes the prototypes exposed in the written decisions

Recorded separately because these are gaps in the repo, not in NG:

- **ADR-0002** freezes manuscript and sidecar together without asking whether every part of
  the sidecar should be per-draft. The Log is the counter-example. Needs an amendment.
- **ADR-0005**'s registry has no slot for a surface reachable from anywhere outside a
  workspace (the capture overlay). `GLOSSARY.md`'s **Workspace** definition rules it out by
  wording.
- **ADR-0009** governs what is inside a bundle and is silent on the layer above it, which
  metrics, backup, recent projects and global search all require.
- **`GLOSSARY.md`** has no word for project identity surviving a rename, and none for the
  cross-project layer.
- **ADR-0012** sets a standard without a worked example; Plan and the Log supply the first one
  (§1.6's table).

---

## 6. What was verified, and what was taken on trust

`pnpm` is not installed on this machine, so **NG's two gates were not executed** — neither the
round-trip test nor the 77 Log assertions. Claims about them are NG's own, reported as such.
What was checked directly against `spike/public/script.fountain`:

| Claim (§5.3, §9) | Checked |
|---|---|
| 181 scene headings, all forced-prefix, 0 unforced `INT./EXT.` | ✅ 181 `^.` headings, 0 unforced |
| Zero existing `[[ ]]` notes — a clean namespace for in-band metadata | ✅ 0 |
| ~5,788 lines, ~3,460 non-blank blocks | ✅ 5,787 newlines / 3,459 non-blank (counting-convention delta of one) |
| Fixture is LF, byte-pinned | ✅ 0 CR bytes; `.gitattributes` pins `*.fountain -text` for exactly this reason |

**One discrepancy.** `spike/CLAUDE.md` and §9 state the gate must report **"EXACT — 170,679
bytes identical"**. The fixture on disk is **170,682 bytes**, and `.gitattributes` says so in
its own comment. §9 is honest in prose — "byte-identical (modulo the deliberate blank-line
normalization)" — but the headline number is the *output* size after collapsing the two stray
double-blanks, not the input's. Two NG documents state a round-trip is byte-exact against a
fixture whose size they give as three bytes smaller than it is. Harmless, and worth fixing
when the gate is lifted into this repo: state both numbers and the relationship between them,
because ADR-0004 makes this the acceptance test and an acceptance test needs an unambiguous
number.

**One observation from the corpus.** Every scene heading is `.**INT. LOCATION - DAY**` —
forced prefix *and* bold inline markup inside the heading text. So the corpus carries
presentation inside the element that `[[wi-scene:…]]` ids attach to, and the round-trip has to
preserve mark nesting within headings, not only within action and dialogue. Worth knowing
before the document model work in Phase 3.
