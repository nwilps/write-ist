# Prose manuscript storage: evidence

Research for the open question: **what is a prose manuscript on disk?** This is evidence and
trade-offs, not a recommendation. Written 2026-09-10.

Terms follow `CONTEXT.md`. One collision to watch: Scrivener and Longform both use the word
"draft" for something unrelated to our **draft**. Scrivener's "Draft" is the manuscript folder
in its binder, and Longform's `draftNumber` is a project copy. Where a tool's own word is
quoted it is marked as theirs.

Binding constraints, restated so the analysis can be checked against them:

- **ADR-0003.** The manuscript stays readable in a text editor, by someone who has never
  heard of Write-ist.
- **ADR-0008.** An **anchor** exists on both sides or is derivable from content. An
  identifier held only by the **sidecar** is not an anchor. Positional records drift, and
  that drift is what destroyed v1's highlights.
- **ADR-0002.** Anchors are scoped to a draft. Locking freezes manuscript and sidecar
  together.
- Catalog: a chapter/scene tree, drag reordering that "must not invalidate notes, stats, or
  drafts pointing at the moved piece", authored line breaks preserved with no reflow, exact
  indentation and spacing preserved, and bold/italic/underline only.

Confidence markers used throughout:
- **[V] Verified.** Read in the primary source: a spec, official docs, or source code I
  inspected.
- **[S] Secondary.** A third-party reverse-engineering, a forum user, or a search-engine
  summary I did not open in full.
- **[I] Inferred.** My reasoning, not a sourced fact.

---

## 1. How the dominant tools model a manuscript on disk

### Summary

| Tool | One file or many | What carries chapter **order** | Readable without the app? |
|---|---|---|---|
| Scrivener 3 | Many: one RTF per binder item, inside a `.scriv` package | Nesting and sequence of `<BinderItem>` elements in the `.scrivx` XML | Partly. Text is RTF, and folders are named by UUID with no titles |
| Ulysses (library) | Many: one `.ulysses` package per sheet | Group order in an `Info.ulgroup` plist (`childOrder`). Where sheet order lives is **unverified** | Poorly. Proprietary XML, undocumented |
| Ulysses (external folder, Markdown mode) | Many plain `.md` files | "Manual" sort is available. Where it is stored is **undocumented**; hidden Ulysses `.plist` files are written into the folder | The text files are readable, but the order is not recoverable from filenames |
| iA Writer | Many plain files, or one file of Content Block references | No manual order in the library at all. The workaround is one file listing `/chapter.md` lines in order | Yes. An ordering file, if one exists, is a plain list of paths |
| Obsidian + Longform | Many `.md` scene files plus an index note | A YAML array in the index note's frontmatter (`longform.scenes`) | Yes. Scenes are Markdown and the order is a readable YAML list |
| Manuskript | Many `.md` files in nested folders (or one zip) | **Filename prefixes** (`0-`, `1-`, …) derived from row position | Yes. `ls` sorts into reading order |

### Scrivener

- **[V]** L&L's own statement of intent, from Keith Blount's 2010 post on the Scrivener 2
  format. Scrivener dropped RTFD and `.plist` in favour of RTF and "my own XML file formats".
  The reason was that the old format "can only be read on the Mac" and that ".plist … is not
  human-readable". He says of RTF that "it's also a format that can be opened in a
  plain-text reader". —
  https://www.literatureandlatte.com/blog/coding-xml-formats-in-cocoa
- **[S]** Package layout of Scrivener 3: a `.scrivx` XML file holding "the binder XML tree
  plus all project-wide settings … The authoritative structure", and
  `Files/Data/<UUID>/content.rtf` "named by the binder item's UUID". There is one UUID folder
  per document with stored content, alongside `synopsis.txt`, `notes.rtf` and a
  `docs.checksum`. This is a third-party description written for a tooling project and
  "verified against the reference Mac v3 project", **not an L&L specification.** —
  https://github.com/donnfelker/scrivener-skills/blob/e51439e0662858b61aa920214b67d9a8a4ac76ff/skills/scrivener-format/references/package-layout.md
- **[S]** How order is carried: `<Binder>` contains nested `<BinderItem>` elements, and
  `<Children>` holds "Nested `<BinderItem>` elements (makes the item a container / file
  group)". A move is re-parenting in `<Children>` plus a "0-based slot among the target
  parent's children". So **order is the sequence of XML elements, and hierarchy is XML
  nesting**. "Internal links … are **not** broken by a move — they target UUIDs, which do
  not change." —
  https://github.com/donnfelker/scrivener-skills/blob/e51439e0662858b61aa920214b67d9a8a4ac76ff/skills/scrivener-format/references/binder-and-metadata.md
  and
  https://github.com/donnfelker/scrivener-skills/blob/e51439e0662858b61aa920214b67d9a8a4ac76ff/skills/scrivener-edit/references/restructuring.md
- **[S]** Scrivener's "Sync with External Folder" feature writes a readable mirror. A forum
  user quotes the manual for the "Prefix file names with numbers" option: "Causes the names
  of the files in the sync folder to be prefixed with a numeral corresponding to its
  position in the binder". Separately, a bracketed internal ID at the end of each filename
  must never be changed, and it maps to UUIDs via `<ExternalSyncMap>` in the `.scrivx`. The
  poster is not L&L staff, and I did not read the manual passage directly. —
  https://forum.literatureandlatte.com/t/external-folder-filenames/143374
- **Undocumented.** I found no L&L-published specification of the `.scrivx` schema. Every
  structural description above comes from third parties. The one L&L-staff forum answer I
  found only points users at the RTF files inside the package. —
  https://forum.literatureandlatte.com/t/how-a-scrivener-project-is-structured/9717
- **[I]** Readability. The text survives: RTF opens in a text editor as markup, and in any
  word processor as formatted text. **Order and titles do not survive in a readable form.**
  Folder names are UUIDs, so recovering the book in order means cross-referencing an XML
  tree by hand. Scrivener itself seems to acknowledge this, since the numbered-filename
  mirror above exists to make order visible outside the app.

### Ulysses

- **[V]** Ulysses documents that sheet order within a group is a per-group setting: "you can
  only rearrange the sheets within a group if the sort setting is set to _Manually_". Gluing
  (merging) sheets "is only available when the group's sorting is set to manual". —
  https://help.ulysses.app/567894-sheets-groups
- **[V]** External folders can be Markdown or native Ulysses files. "By default, Markdown is
  selected to ensure the highest possible cross-app compatibility." In Markdown mode, "You
  cannot attach notes, images or sheet-specific goals", and Markdown XL tags "are not part
  of the original Markdown syntax". Native files use `.ulyz`. The page says **nothing about
  where manual order is stored.** — https://help.ulysses.app/the-library/external-folders
- **[S]** Ulysses writes "two hidden Ulysses `.plist` files" into any external folder "to
  store the sidebar icon and other configuration info". Whether manual sort order is among
  that configuration is not stated. — https://thesweetsetup.com/ulysses-collaborate-writing/
- **[V, from third-party source code]** Library internals. A third-party export script
  reads `Info.ulgroup` plists and walks a `childOrder` array to order **groups**. Each sheet
  is a `.ulysses` package containing `Content.xml`, which the script converts with XSLT. For
  **sheets**, though, the script only iterates directory entries: it does not read a sheet
  order from anywhere, so **where sheet order is stored is unverified.** —
  https://github.com/goetzf/ulysses_snapshot/blob/34d64479b71659eab7eb2defa08f6c11ea04e55c/ul_snapshot.py#L120-L180
- **Proprietary and undocumented.** Ulysses' own library help page describes no file format
  and gives no guidance on reading the library outside the app. —
  https://help.ulysses.app/en_US/the-library/ulysses-library

### iA Writer

- **[S → official account]** "There's no manual sort order in Library, but you can achieve
  similar results by dragging all documents from a hashtag into a file at the root of a
  Library Location, reorder content block references, and export the file." (@iawriter,
  2018; I have not confirmed that this is still current.) —
  https://x.com/iawriter/status/1040948401809047552
- **[V]** Content Blocks are file transclusion: a line starting with a path, for example
  `/Chapter 1.md`. iA says they are "particularly popular for writers who need to compile
  various chapters of their book into a unified document". —
  https://ia.net/writer/support/library/content-blocks. The syntax is published as an open
  proposal at https://github.com/iainc/Markdown-Content-Blocks
- **[I]** The result is that iA Writer's order artifact, when there is one, is itself a
  plain-text manifest. It is a Markdown file whose content is an ordered list of paths.
  Another Markdown renderer would show those lines as literal paragraphs of text, so the
  order stays readable even where the transclusion does not work.

### Obsidian + Longform

Longform's source was cloned and inspected at `kevboh/longform@b7f3985`.

- **[V]** Longform supports two project shapes: `format: "single"` (one note) and
  `format: "scenes"` (many notes). A multi-scene project is "a manually-ordered set of notes
  that live in the same folder". The order is the `scenes:` array in the index note's
  frontmatter. "Reordering the list in the Scenes tab with drag-and-drop will reorder this
  frontmatter array." —
  https://github.com/kevboh/longform/blob/b7f3985cb6cc5347660697236c3427f43a178d0c/docs/MULTIPLE_SCENE_PROJECTS.md
  and
  https://github.com/kevboh/longform/blob/b7f3985cb6cc5347660697236c3427f43a178d0c/docs/INDEX_FILE.md
- **[V]** Hierarchy is YAML nested arrays, and it is explicitly decoupled from the
  filesystem. The docs say "your **indentation does not need to look like a file
  hierarchy**", and all scene files sit flat in one `sceneFolder`. Internally a scene is
  `{ title: string; indent: number }`, identified by its filename. —
  https://github.com/kevboh/longform/blob/b7f3985cb6cc5347660697236c3427f43a178d0c/src/model/types.ts
- **[V]** The anchor is the filename. Per-scene word-count session stats are
  `scenes: Record<string, number>`, keyed by scene name. —
  https://github.com/kevboh/longform/blob/b7f3985cb6cc5347660697236c3427f43a178d0c/src/model/types.ts#L76
  Renames are repaired by listening to Obsidian's vault `rename` event, which rewrites the
  scene's title in the draft. —
  https://github.com/kevboh/longform/blob/b7f3985cb6cc5347660697236c3427f43a178d0c/src/model/store-vault-sync.ts#L332-L380
- **[I]** From that code: a rename made *outside* Obsidian while it is closed never fires
  the event. Longform would then see an unknown file plus a missing scene, and it prompts to
  add unknown files rather than failing. I did not test this.
- **[V]** Files in the scene folder that are missing from the list trigger a prompt to add
  or ignore them. They are never added silently. — MULTIPLE_SCENE_PROJECTS.md, above.

### Manuskript (open source)

Manuskript's source was cloned and inspected at `olivierkes/manuskript@01e0574`.

- **[V]** A project is either a single zip or "a multitude of plain-text files". —
  https://github.com/olivierkes/manuskript/blob/01e05747f3c13f637d802ca915c31f9a27a601f8/manuskript/load_save/version_1.py#L99-L110
- **[V]** Order is carried by filenames. `outlineItemPath` names each item
  `"{ID}-{name}{ext}"`, where `ID` is `str(item.row()).zfill(...)`, meaning the item's
  **position among its siblings**, zero-padded. Folders become directories holding a
  `folder.txt`. —
  https://github.com/olivierkes/manuskript/blob/01e05747f3c13f637d802ca915c31f9a27a601f8/manuskript/load_save/version_1.py#L588-L616
- **[V]** A reorder is therefore a **file rename**. Save compares each item's `_lastPath`
  with its new path and `os.replace`s the file. —
  https://github.com/olivierkes/manuskript/blob/01e05747f3c13f637d802ca915c31f9a27a601f8/manuskript/load_save/version_1.py#L351-L362.
  On load, files are ordered with `sorted(files.items())`. —
  https://github.com/olivierkes/manuskript/blob/01e05747f3c13f637d802ca915c31f9a27a601f8/manuskript/load_save/version_1.py#L714
- **[V]** Each text file starts with a metadata header (`title:`, `ID:`, `type:`,
  `compile:`), then a blank line, then the prose. Sample:
  `outline/0-Jerusalem/0-Chapter_1/0-Introduction.md` in
  https://github.com/olivierkes/manuskript/tree/01e05747f3c13f637d802ca915c31f9a27a601f8/sample-projects/book-of-acts
  The positional prefix sits in the path, while a stable `ID:` sits **inside the file**.
  That makes this the one tool surveyed whose identity marker travels with the text.
- **[I]** Readability is the best of the set, since `ls -R` reproduces reading order. The
  cost is that every reorder renames siblings, which touches many files, rewrites any
  path-keyed reference, and shows up in any file-level history as renames.

---

## 2. Is chapter reordering frequent or rare?

**Short answer: I found no reliable evidence of how often novelists reorder chapters.** What
exists falls short in three different ways. Tool documentation shows that vendors consider
reordering a selling point. Craft sources recommend structural revision in general. The only
empirical studies measure essays, not novels, and measure sentence- and paragraph-level
reordering, not chapters.

### What the tools emphasise

- **[V]** Scrivener's product page makes restructuring a headline claim: "turning Chapter
  Four into Chapter One is as simple as drag and drop"; "carve out a draft and restructure
  later"; on the corkboard, "when you move them, you're rearranging your manuscript at the
  same time". — https://www.literatureandlatte.com/scrivener/overview. This is marketing,
  which says what L&L thinks sells, not what writers do.
- **[V]** Longform gives reordering its own undo stack, "to a depth of 20 changes",
  separate from the editor's. — MULTIPLE_SCENE_PROJECTS.md, above.
- **[V]** Ulysses makes manual order opt-in per group, with title and date sorting as the
  alternatives. — https://help.ulysses.app/567894-sheets-groups
- **[S]** iA Writer, which markets itself to long-form writers, **has no manual sort order in
  its library** at all. — @iawriter, above. This is the one counter-example: a successful
  writing tool that treats reordering as an edit to a text file of references rather than as
  a drag operation.
- **[S]** A third-party Scrivener tooling project asserts that "restructuring the binder is
  the normal creative loop, not a rare event". —
  https://github.com/donnfelker/scrivener-skills/blob/e51439e0662858b61aa920214b67d9a8a4ac76ff/skills/scrivener-edit/SKILL.md.
  This is an assertion with no data behind it, and is included only because it is the
  strongest version of the claim I found.

### Writing-craft sources

- **[S, search summaries, pages not opened in full]** Revision guides routinely describe a
  "structural rewrite" that "might involve cutting entire chapters, rearranging scenes, or
  writing new ones", along with index-card storyboards and reverse outlines for spotting
  what to move. See https://atmospherepress.com/novel-rewriting-tips/,
  https://www.jessicabrody.com/2022/05/the-most-organized-way-to-revise-a-novel-free-revision-kickstart-guide/
  and https://phoebemorganauthor.com/2018/01/17/restructuring-your-novel/. These are
  prescriptive ("you might need to"), not descriptive, and they give no frequencies.
- **[I]** In these sources, moving pieces is almost always listed alongside **cutting,
  splitting, merging and adding**. For storage, split and merge matter at least as much as a
  pure move. A move keeps a piece's identity intact; a split or merge creates or destroys
  identity.

### Empirical composition research

- **[V]** Sommers (1980) coded revisions by four operations, "deletion, substitution,
  addition, and reordering", at four levels: "word, phrase, sentence, theme". Student
  writers "lack procedures or heuristics to help them reorder lines of reasoning". For
  experienced writers, "Details are added, dropped, substituted, or reordered according to
  their sense of what the essay needs". The sample was 8 students and 7 experienced adults
  writing **essays**. — *College Composition and Communication* 31(4), 378–388;
  https://eric.ed.gov/?id=EJ240356 (text read from
  https://openlab.citytech.cuny.edu/fywpd/files/2019/01/sommors-revision-strategies.pdf).
  I could not extract a per-operation frequency for reordering from the text.
- **[V]** Faigley & Witte (1981) extend the taxonomy to six operations, including
  "Permutations [which] involve rearrangements". Expert adults made "some type of change on
  the average of 144 times per 1000 words", and "34% of the expert adults' changes were
  Meaning Changes". When experts revised student essays, "65% of the changes were
  Macrostructure Changes. In particular, the adults used three processes—addition,
  consolidation, and distribution". Permutation is **not** named among the dominant
  operations. — *CCC* 32(4), 400–414;
  https://scholar.archive.org/work/wjk7elvlrrc77j4gjyafa6yevi/access/wayback/http://www.cwrl.utexas.edu/~faigley/work/analyzing.pdf.
  The Table 2 per-operation figures did not survive the PDF's text layer, so I could not
  read the permutation rate. The subjects were six experts (three had published fiction)
  writing short descriptive essays.
- **[I]** Neither study says anything about chapter-level moves in book-length fiction. At
  most they suggest that, at the scale they measured, experts' large changes were more
  often *addition, consolidation and distribution* than *permutation*. By analogy that
  would favour split, merge and insert over pure reorder, but it is only an analogy.

### What this leaves

- Reordering is universally *supported* (except by iA Writer's library) and heavily
  *marketed*. How often it happens is **unmeasured** in anything I could find.
- **[I]** The storage decision may not actually hinge on frequency. If a move is cheap and
  anchor-safe in a given model, frequency is irrelevant; if a move damages anchors, even a
  rare move does lasting harm, which is exactly the v1 lesson. Section 3 is organised around
  what a move *does* to anchors, not how often it happens.

---

## 3. Does the chapter tree have to live in the manuscript?

Three candidate models. For each: what a **move** does to anchors, and whether the result
passes ADR-0003's "readable in a text editor" test.

### A. Headings inside one manuscript file

This is how Markdown and Fountain do it. The tree is written as heading lines, and **reading
order is byte order.**

- **[V]** Fountain precedent, inside the format ADR-0004 already adopted: "Create a Section
  by preceding a line with one or more pound-sign `#` characters … You can nest Sections by
  adding more `#` characters." Sections "are ignored completely in formatted output", and
  "Some screenplay applications use these like nested folders in a navigation view". Single
  `=` lines are synopses. — https://fountain.io/syntax/#sections-synopses
- **Move.** The chapter's text physically moves within the file.
  - **[I]** Anchors stored as offsets or line numbers break on every move. They also break
    on ordinary typing, which is the v1 failure. Model A therefore *requires* anchors that
    are not positional.
  - **[I]** Anchors written into the text, the ADR-0008 mechanism (an id riding in a
    construct other tools ignore, like Fountain's `[[ ]]`), move with the text and survive.
    Content-derived anchors such as heading text survive too, but become ambiguous when
    titles repeat. Scrivener's tooling reference notes that "titles repeat" in real binders.
  - **[I]** A move is an ordinary manuscript edit, so it enters the same undo/redo stack as
    typing, and the save is a single-file atomic write (ADR-0008 rule 5) with no
    cross-file consistency to maintain (rule 6).
- **Readable without the app.** **[I]** Yes, unconditionally. Order is visible and the tree
  is visible as heading lines. The one cost: ids smuggled into the text are visible noise to
  a text-editor reader, as `[[ ]]` notes are in Fountain.
- **Both surfaces.** **[I]** A screenplay is already this model: one Fountain file, with an
  optional section tree via `#`. The catalog phrase "a novel is many documents in an ordered
  tree" presupposes model B. Under A, a novel is one manuscript containing a tree, and the
  "container must hold both" requirement is met by one file per manuscript on both surfaces.

### B. Many files plus an order artifact

Scrivener, Longform and Ulysses use a manifest. Manuskript encodes order in filenames. iA
Writer uses an optional file of references.

- **B1: order in a manifest** (Longform YAML, Scrivener `.scrivx`, Ulysses `childOrder`).
  - **Move.** **[V for Longform and Scrivener]** Only the manifest changes; no text file is
    touched. Anchors *into* a scene file survive any reorder, whatever their form.
    **[V, Longform]** The anchor *to* a scene is its filename, so a rename, not a move, is
    the fragile operation. It is repaired only while the app is watching.
  - **The classification question.** ADR-0008 says "an identifier held only by the sidecar
    is not an anchor". In B1, a scene's identity (a filename or UUID) sits in the manifest
    **and** in the filesystem, so it exists on two sides, **provided the manifest counts as
    part of the manuscript.** If the manifest is sidecar, the order of the book lives in the
    sidecar. Then losing or corrupting the sidecar loses the book's order, and ADR-0003's
    reader can no longer read the book in order. **[I]** This is the crux of B1. The
    manifest has to be classified as manuscript, be written with the same atomicity as the
    text files, and be locked with them (ADR-0002).
  - **Readable without the app.** **[I]** It depends on whether the manifest is readable
    and whether the reader knows it exists. Longform's is a YAML list of titles in a
    Markdown note, which is good. Scrivener's is an XML tree pointing at UUID-named folders,
    which is technically text but practically unreadable. A folder of files **without** a
    manifest the reader knows about is ambiguous in order. iA Writer shows this, since its
    library can only sort by name, date or kind:
    https://ia.net/writer/support/library/organize.
  - **Atomic save across many files.** **[I]** ADR-0008 rule 6 (no disagreement after a
    crash) becomes a multi-file transaction: the manifest plus N scene files plus the
    sidecar. It can be done, but a single file does not need it.
  - **Cross-boundary edits.** **[I]** Moving a *paragraph* from one scene to another is a
    cut from one file and a paste into another. Anchors inside that paragraph survive only
    if they are inline. So B1 still needs inline anchors for anything finer than a whole
    scene.
- **B2: order in filenames** (Manuskript, and Scrivener's sync mirror).
  - **Move.** **[V]** The file and its later siblings are renamed. Anchors keyed by path
    break. Manuskript avoids this by keeping a stable `ID:` inside each file, which is an
    anchor on both sides.
  - **Readable without the app.** **[I]** Best of any model: `ls` gives reading order and no
    manifest is needed. The cost is rename churn on every reorder, and a naming scheme the
    writer can break by renaming files by hand.

### C. A sidecar-held tree over flat text

One flat manuscript file, with chapter and scene boundaries held in the sidecar.

- **[I]** On a move, one of two things happens:
  - **The tree reorders but the text does not move.** Reading order now lives in the
    sidecar, and the manuscript's byte order no longer matches the book's order. A
    text-editor reader gets the chapters in the wrong order. **This fails ADR-0003.**
  - **The text moves and the sidecar is updated.** If the sidecar's boundaries are offsets,
    every move and every keystroke shifts them, which is the v1 design. If the boundaries
    are markers written into the text, **the tree is now derivable from the manuscript, and
    model C has become model A** with the sidecar holding only non-structural data.
- **[I]** C also runs into ADR-0008 rule 1 directly. Boundaries held only in the sidecar
  are identifiers held only by the sidecar.
- **What C can legitimately hold.** **[I]** Anything *about* the tree that a reader does not
  need in order to read the book: synopses, labels, status, targets, per-chapter notes.
  These are sidecar data anchored to boundaries that live in the text. Fountain already
  splits things along similar lines: section markers and synopses are inline, and the Plan
  workspace is deliberately independent of the manuscript (`docs/PLANNING.md`).

### The fork, restated

**[I]** Once you ask what a reader without the app needs, the choice is not "tree in the
manuscript vs tree in the sidecar". **Reading order must be recoverable from the manuscript
alone.** That leaves two viable carriers:

1. **byte order in one file** (A), or
2. **a manifest or filename order that is itself treated as manuscript** (B1 or B2).

Everything else about the tree can be sidecar. In every viable model, anchors finer than a
whole scene have to be written into the text, which ADR-0008 already anticipates. The
trade-offs between A and B, as evidenced above:

| | A: one file, headings | B1: files + manifest | B2: files, numbered names |
|---|---|---|---|
| Reader recovers order | Always | If the manifest is readable and found | Always |
| Chapter move touches | One file (text moves) | Manifest only | Several filenames |
| Anchors to a whole scene survive a move | If inline or content-derived | Yes (file identity unchanged) | Only if identity is inside the file |
| Anchors inside text survive a cross-scene paste | If inline | If inline | If inline |
| Atomic save (ADR-0008 r5–6) | Single file | Multi-file transaction | Multi-file, including renames |
| Precedent in our stack | Fountain `#` sections | Longform, Scrivener | Manuskript |

---

## 4. Markdown's gaps against the prose requirements

All citations are to CommonMark 0.31.2, https://spec.commonmark.org/0.31.2/ **[V]**.

### No underline

- The spec inherits Gruber's rule: "Text wrapped with one `*` or `_` will be wrapped with an
  HTML `<em>` tag; double `*`'s or `_`'s will be wrapped with an HTML `<strong>` tag." —
  https://spec.commonmark.org/0.31.2/#emphasis-and-strong-emphasis. The spec defines no
  underline construct; the word "underline" appears only in the context of setext headings.
- **What tools do:**
  - **[V]** Raw HTML is permitted: "Text between `<` and `>` that looks like an HTML tag is
    parsed as a raw HTML tag". So `<u>…</u>` is legal CommonMark. —
    https://spec.commonmark.org/0.31.2/#raw-html
  - **[V]** Pandoc uses a class: `[Underline]{.underline}` (with `bracketed_spans`), or
    `<span class="underline">`. — https://pandoc.org/MANUAL.html#underline
  - **[V]** Fountain departs from Markdown deliberately: it "reserves the use of underscores
    for underlining, which is not interchangeable with italics in a screenplay" (`_underline_`,
    `*italics*`, `**bold**`). — https://fountain.io/syntax/#emphasis
  - **[V]** Obsidian's formatting help lists bold, italics, strikethrough and `==highlight==`,
    with **no underline syntax**. —
    https://github.com/obsidianmd/obsidian-help/blob/master/en/Editing%20and%20formatting/Basic%20formatting%20syntax.md

### Four spaces of indentation means a code block, and leading whitespace is stripped

- "An indented chunk is a sequence of non-blank lines, each preceded by four or more spaces
  of indentation." — https://spec.commonmark.org/0.31.2/#indented-code-blocks
- "An indented code block cannot interrupt a paragraph." A four-space line directly after a
  paragraph line is therefore paragraph continuation, not code. — same section.
- In a paragraph, the raw content is formed "by concatenating the lines and removing initial
  and final spaces or tabs". So indentation of **any** depth inside a paragraph is discarded
  on render. — https://spec.commonmark.org/0.31.2/#paragraphs
- Tabs: "in contexts where spaces help to define block structure, tabs behave as if they
  were replaced by spaces with a tab stop of 4 characters". A single leading tab at the
  start of a block therefore also opens a code block. — https://spec.commonmark.org/0.31.2/#tabs
- "Blank lines between block-level elements are ignored", so runs of blank lines collapse,
  which also loses authored vertical spacing. — https://spec.commonmark.org/0.31.2/#blank-lines
- **What tools do:**
  - **[V]** Pandoc's `line_blocks` extension is lines prefixed with `| `: "The division into
    lines will be preserved in the output, as will any leading spaces … This is useful for
    verse and addresses." — https://pandoc.org/MANUAL.html#extension-line_blocks
  - **[V]** Obsidian suggests "`&nbsp;` (non-breaking space) or `<br>`" to "prevent spaces
    from collapsing". — Obsidian help, above.
  - **[V]** Fountain: "Leading tabs or spaces in elements other than Action will be ignored
    … The exception is in Action, where leading tabs and spaces are respected. This allows
    the writer to indent lines manually." — https://fountain.io/syntax/#indenting

### A single newline is not a line break

- "A regular line ending … that is not preceded by two or more spaces or a backslash is
  parsed as a softbreak. (A soft line break may be rendered in HTML either as a line ending
  or as a space. The result will be the same in browsers.)" The spec also notes that "A
  renderer may also provide an option to render soft line breaks as hard line breaks." —
  https://spec.commonmark.org/0.31.2/#soft-line-breaks
- A hard break is "preceded by two or more spaces", or it is "a backslash before the line
  ending". — https://spec.commonmark.org/0.31.2/#hard-line-breaks
- **What tools do:**
  - **[V]** Pandoc's `hard_line_breaks` extension "Causes all newlines within a paragraph to
    be interpreted as hard line breaks instead of spaces"
    (https://pandoc.org/MANUAL.html#extension-hard_line_breaks). Its `escaped_line_breaks`
    extension accepts a backslash-newline as a hard break.
  - **[V]** Obsidian has a "Strict line breaks" setting that "makes Obsidian follow the
    standard Markdown specification for line breaks", and `Shift+Enter` inserts a break.
    Its help page also describes default behaviour as "treated as a *continuation* of the
    same paragraph". I could not reconcile that with the existence of a "strict" toggle
    from the page alone, so treat Obsidian's default as unsettled. — Obsidian help, above.
  - **[V]** Fountain: "Fountain takes every carriage return as intent … the writer's single
    and double-space decisions would be preserved." — https://fountain.io/syntax/#line-breaks

### What these gaps do and do not mean

**[I]** These are **rendering** semantics. ADR-0003's test is reading the file in a *text
editor*, where every newline and leading space is shown exactly as typed. The gaps bite in
three places:

1. **When another app renders the manuscript as Markdown.** Obsidian, a Git host preview or
   Pandoc would reflow lines, strip indentation, and show `<u>` or `{.underline}` as
   whatever that app supports.
2. **On import.** Given ADR-0006's reasoning, a `.md` file from elsewhere carries
   CommonMark's semantics. Reading it with "every newline is intent" rules would change
   what its author meant.
3. **Round-trip.** A document model that parses with a CommonMark parser will not
   round-trip authored indentation or line breaks (see `CONTEXT.md`, **round-trip**).

A prose manuscript that *looks like* Markdown but follows Fountain-style rules (newlines as
intent, leading whitespace respected, `_` as underline) would read fine in a text editor. It
would be misread by Markdown renderers. That is a naming and expectations question as much
as a technical one: whether it carries a `.md` extension, and what it claims to be.

---

## Verified vs inferred

**Verified in primary sources or inspected code:**
- Longform's manifest-in-frontmatter model, its nesting decoupled from folders, and its
  filename-keyed stats and rename repair.
- Manuskript's filename-prefix order and reorder-as-rename.
- Ulysses' manual sorting as a per-group setting, and what its Markdown mode loses.
- iA Writer's Content Blocks.
- L&L's stated reasons for RTF and XML.
- Scrivener's product-page claims about restructuring.
- Every CommonMark, Pandoc, Fountain and Obsidian quotation.
- The Sommers and Faigley & Witte findings as quoted.

**Secondary (third-party, forum users, or search summaries):**
- The Scrivener `.scrivx` and `Files/Data/<UUID>` layout, and that binder order is XML
  element order (donnfelker/scrivener-skills).
- Scrivener's external-sync filename prefixes (forum user quoting the manual).
- Ulysses' hidden `.plist` files (The Sweet Setup).
- The Ulysses `Info.ulgroup`/`childOrder` and `Content.xml` internals (third-party script).
- iA Writer's lack of a manual library order (2018 tweet).
- The craft-source claims about structural revision.

**Inferred, my reasoning:**
- Every "Move" and "Readable without the app" judgement in section 3.
- The claim that model C reduces to model A once boundaries are inline.
- The claim that the manifest-classification question is the crux of model B1.
- The analogy from essay-revision research to novels.
- The claim that frequency matters less than move-safety.

## Open questions I could not settle

1. **Where Ulysses stores sheet order**, both in the library and in a Markdown external
   folder, and whether its hidden `.plist` holds it. It is undocumented, and the third-party
   script I read does not use it.
2. **Whether L&L has ever published a `.scrivx` schema.** I found none. All structural
   detail is reverse-engineered.
3. **The permutation rate in Faigley & Witte Table 2.** The numbers are not in the PDF's
   text layer, so they need the table read visually or from the JSTOR scan.
4. **Any descriptive data on how often novelists move chapters** (not scenes) between
   drafts. I found none. The nearest proxy would be diffing successive drafts of real
   novels, which nobody seems to have published.
5. **Obsidian's default line-break behaviour.** Its help page describes the default and a
   "strict" toggle in terms that seem to overlap.
6. **Whether a manifest counts as manuscript or sidecar** under our own vocabulary. This is
   not an evidence question. It is a definitional one for `CONTEXT.md`, and model B1 cannot
   be evaluated against ADR-0003 and ADR-0008 until it is answered.
7. **Split and merge.** The craft sources list them alongside moving. What identity a
   chapter keeps when split or merged is unaddressed by every tool I read, and it is the
   operation most likely to strand an anchor under any of the three models.
