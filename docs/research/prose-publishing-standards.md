# Prose publishing standards: evidence (second pass)

Second research pass on the open question **what is a prose manuscript on disk?** Written
2026-09-11. Evidence, not a recommendation.

It builds on [`prose-manuscript-storage.md`](prose-manuscript-storage.md) (the "first pass"),
which covered how Scrivener, Ulysses, iA Writer, Longform and Manuskript store a novel, the
three candidate storage models (A: one file with headings; B: many files plus an order
artifact; C: a sidecar-held tree), and CommonMark's gaps. None of that is repeated here; it is
cited as "first pass §N".

The first pass asked *how* tools store a novel. This pass asks four different questions that
Noah raised: *why* they do it, what novelists actually use, what the publishing pipeline
expects, and whether any novel-side standard is worth adhering to the way Fountain and page
count are on the screenplay side (ADR-0001, ADR-0004).

Confidence markers, as in the first pass:

- **[V] Verified.** Quoted or read in the primary source: a spec, official docs, a platform
  help page, the designer's own words, or a survey's own methodology page.
- **[S] Secondary.** A third party, a search-engine summary I could not open in full, or a
  source I could reach only second-hand.
- **[I] Inferred.** My reasoning.

---

## Summary

**1. Why many files, and is that what novelists do?** Where specialist tools state a reason,
it is about the *editor*, not publishing. The reasons are: pieces are easier to move (L&L,
Ulysses, yWriter), they are easier to navigate and keep track of (yWriter), less is at risk
if the app crashes (novelWriter), and small files are easier to sync and version-control
(novelWriter). Scrivener's own blog says one document per chapter is fine and "it comes down
to personal preference". **There is no reliable data on what novelists draft in.** The only
survey with a published methodology covers *nonfiction* authors (242 people, 61% Word). A
widely repeated "Reedsy 2024, n=1,007" figure could not be traced to Reedsy. What *is*
verifiable is that every self-publishing entry point and the traditional copyedit stage
assume a Word document.

**2. The pipeline.** Traditional publishing runs as Word (`.docx`) for submission and
copyedit, with tracked changes. It is then typeset by the publisher, the author reviews PDF
proofs, and the printer receives a PDF. Self-publishing runs as DOCX or EPUB into KDP, Draft2Digital,
Vellum and Atticus. Print interiors go in as a PDF (IngramSpark requires PDF/X-1a or PDF/X-3).
**"Standard Manuscript Format" is not a standard**: no body defines it. Shunn's guide, the
most cited, calls itself "not absolute gospel", and Chicago's own blog says an agent's or
publisher's guidelines "should override". It is a set of *layout* conventions: 12pt,
double-spaced, one-inch margins, a running header, each chapter on a new page. **Novels have
no page-count semantic.** Length is measured in words: award categories are defined by word
count, publishers use the computer's word count, and the "250 words per page" rule is a
typewriter-era estimate Shunn calls obsolete. Ebooks are EPUB 3.3 (a W3C Recommendation), and
KDP says "page numbers and page count don't apply" to reflowable ebooks.

**3. What adherence would constrain.** On the novel side, **the standards constrain export,
not layout in storage**. Every SMF rule (font, spacing, margins, header, chapter-on-new-page)
and every print rule (trim, bleed, PDF/X, embedded fonts) is a property of an output file.
What the *stored manuscript* must be able to represent is an element vocabulary. The minimum
publishers and ebook producers mark up is: italics, bold, scene breaks, chapter and part
headings, epigraphs, block quotes and letters, verse with line breaks and indentation levels,
notes, front and back matter, and small caps. Nothing forces a font, line length or page
engine on storage. The screenplay side constrains storage *and* layout; the novel side
constrains only storage vocabulary plus export.

**4. Plain-text markup for a novel.** No language is both text-editor-friendly and covers the
full list with a formal spec and a byte-exact round-trip parser. That last property is
missing everywhere: every major parser builds an AST and re-serialises in a normalised form,
and Pandoc and remark say so. The rest splits two ways:
- **Coverage.** Standard Ebooks' XHTML, DocBook and flat ODT cover everything but are
  tag-heavy. Pandoc Markdown, AsciiDoc and Markua cover nearly everything in readable text.
  CommonMark and MultiMarkdown lack underline, small caps and verse.
- **Specs.** Formal specs exist for CommonMark, the XML formats and (in progress) AsciiDoc.
- **Pipeline.** Pandoc Markdown has the shortest documented route to both `.docx` and EPUB.
- **Fountain.** Fountain has been used for prose by at least one shipping tool (Storyist).

---

## 1. Why tools store a novel as many files, and what novelists actually use

### 1.1 The designers' stated reasons

| Tool | Stated reason for splitting | Source |
|---|---|---|
| Scrivener (L&L) | Easier to move scenes; but one-file-per-chapter also fine, "personal preference" | L&L blog, 2023 |
| Ulysses | "easier to oversee the whole of your work and rearrange the order" | Ulysses help |
| Longform | None stated | README |
| novelWriter | Crash safety, sync, version control | novelWriter docs |
| yWriter | Keeping track at 20k–80k words; drag-and-drop reorganisation; programmer's "source files and modules" analogy | spacejock.com |
| Standard Ebooks (production, not drafting) | One XHTML file per chapter is a house rule; no reason given | SE Manual §2.2.4 |

- **[V] Scrivener, origin.** L&L's own account says Keith Blount, "Struggling to write a novel and
  a thesis, … began to dream of his perfect writing software, a tool that integrated
  composition, outlining and research." The origin story does not mention splitting files. —
  https://www.literatureandlatte.com/about
- **[V] Scrivener, reason to split.** Kirk McElhearn on L&L's blog (20 September 2023)
  says that breaking chapters into scenes is "especially useful if you are not sure where
  specific scenes will end up in your manuscript. It's easier to move them around that way,
  rather than cut them out of longer chapter files." The same post also says "Some people
  compose their manuscripts with just one file for each chapter", which "still allows you to
  move around individual chapters", and that "in the end, it comes down to personal
  preference." —
  https://www.literatureandlatte.com/blog/different-ways-of-setting-up-scriveners-binder-for-your-projects
- **[V]** L&L's post on merging and splitting (McElhearn, 28 April 2021) notes that "you may
  initially write in scenes or subsections, then want to combine them later into chapters".
  It also suggests merging is often unnecessary because Scrivenings view shows many texts as
  one. —
  https://www.literatureandlatte.com/blog/merge-and-split-files-in-the-scrivener-binder
- **[V] Ulysses.** "This way, it's a lot easier to oversee the whole of your work and
  rearrange the order of its various parts if necessary." — https://help.ulysses.app/567894-sheets-groups
- **[V] Longform.** The README describes both shapes, a "reorderable, nestable list of
  scenes" and "single-scene projects so that your shorter works can use the same workflows and
  tooling as your longer ones". It gives **no rationale** for one note per scene. —
  https://github.com/kevboh/longform/blob/main/README.md. First pass §1 covers its mechanics.
- **[V] novelWriter** is a plain-text novel editor that the first pass did not survey. It
  keeps the structure in one XML file (`nwProject.nwx`) and each document in its own file
  under `content/`. It states three reasons:
  1. "all the text you add to your project is saved directly to your project folder in
     separate files. Only the project structure and the text you are currently editing is
     stored in memory at any given time, which means there is a smaller risk of losing data
     if the application or your computer crashes."
  2. "having multiple small files means it is very easy to synchronise them between computers
     with standard file synchronisation tools."
  3. "if you use version control software to track the changes to your project, the file
     formats used for the files are well suited."

  It also warns: "If this file is lost or corrupted, the structure of the project is lost,
  although not the text itself." — https://novelwriter.io/docs/technical/storage.html
- **[V] yWriter** gives the fullest statement of intent I found:
  - "wait until you hit 20,000 words, with missing scenes and chapters, notes all over your
    desk … it becomes a real struggle."
  - "As a programmer I'm used to dealing with projects broken into source files and modules
    … I decided to apply the same working method to my novels."
  - "A scene is a pleasant chunk to work on - small and well-defined, you can slot them into
    your novel, dragging and dropping them from one chapter to another as you interleave
    strands from different viewpoint characters."

  — https://spacejock.com/yWriter7.html. Note that yWriter splits the novel *in its UI*, and
  its current `.yw7` project appears to be **one XML file** (§1.3).
- **[V] Standard Ebooks**, a production format rather than a drafting tool: "Works that are
  composed of chapters … have each of those sections in an individual file", and a volume of
  very short poems is "in a single file". No reason is given. —
  https://standardebooks.org/manual/1.9.1/2-filesystem (rules 2.2.4, 2.2.4.4). EPUB allows
  either shape, since a publication is "a set of interrelated resources" (§2.5).

**[I] What the stated reasons have in common.** They fall into two groups:

1. **Editor affordances**: moving, navigating, overseeing, focusing on "a pleasant chunk".
   Scrivener, Ulysses and yWriter all also offer a *stitched* single view (Scrivenings, glued
   sheets), and first pass §1 shows iA Writer doing it with a one-file list of references.
   These reasons are about what the editor shows. They do not by themselves require the
   pieces to be separate files on disk.
2. **File-system properties**: crash exposure, sync granularity, diff-friendliness
   (novelWriter). These are genuine storage arguments. The first two weigh less for
   Write-ist: ADR-0008 rule 5 already makes saves atomic, and ADR-0003 rules out sync. The
   version-control argument is about diff size and applies to any plain-text format.

No tool I read gives a *publishing* reason for many files. The first pass found L&L's
readability reasons for RTF and XML (first pass §1, Scrivener), which are about format, not
file count.

### 1.2 What novelists actually draft in

**Short answer: there is no reliable, methodologically documented survey of what novelists
draft in.**

- **[V] Bernoff's author survey.** This is the only survey I found with a published
  methodology: a "242-person survey of business and nonfiction authors" run "between 2019 and
  2022". Recruitment was 38% via 13 agencies and publishers, 28% from his blog audience, 25%
  from Facebook author groups, and the rest via email, Twitter and Jane Friedman's
  newsletter. Respondents were "a published author or actively working on a book". —
  https://bernoff.com/blog/how-do-you-fit-with-the-nonfiction-authors-in-my-author-survey.
  A separate post from 19 June 2023 reports that "61% used Word as their primary tool". —
  https://bernoff.com/blog/most-authors-still-use-microsoft-word-but-other-writing-tools-have-their-fans.
  **The sample is nonfiction only**, and I could not find the full tool breakdown.
- **Unverifiable: "Reedsy 2024, n=1,007".** A vendor blog states "The 2024 Reedsy survey of
  1,007 independent authors found that 38% use Scrivener … Microsoft Word holds 31%. Google
  Docs holds 14%". It cites "Reedsy Author Survey 2024 (n=1,007)" with **no link**. —
  https://app.blurbbio.com/blog/best-writing-software-novelists-2026. Searches for the survey
  on Reedsy's own pages found nothing. Treat it as unsourced and do not rely on it.
- **[S] An informal poll.** A 2025 poll across Facebook and LinkedIn author groups reported
  that "more than three-quarters" of LinkedIn respondents chose Scrivener, while on Facebook
  "the vast majority selected 'other'", naming Word, Google Docs and others. It gives no
  sample size and no question wording. — https://whiterabbitediting.com/the-best-writing-software-in-2025/
- **[V] No usage data from these outlets.** Written Word Media's writing-software article
  contains no survey data. — https://www.writtenwordmedia.com/best-writing-software-seven-writing-tools-for-authors/.
  I found no ALLi or academic survey of novelists' drafting tools.

**Indirect evidence: the pipeline is Word-shaped.** This shows what the *downstream* expects,
not what authors draft in.

- **[V]** KDP puts DOC/DOCX first among recommended ebook formats: "Most DOC/DOCX files
  convert well to eBooks". — https://kdp.amazon.com/en_US/help/topic/G200634390
- **[V]** Draft2Digital: "Upload your book in .doc or .docx file format … Anything Word can
  read, we can read." —
  https://draft2digital.freshdesk.com/support/solutions/articles/4000214391-what-file-types-can-draft2digital-take-and-make-
- **[V]** Vellum: "Vellum can import any file with a .docx extension." — https://help.vellum.pub/importing/
- **[V]** University of Chicago Press "prefers final manuscripts to be submitted in
  electronic form in Microsoft Word." — https://press.uchicago.edu/resource/emsguide.html.
  This is an academic press, not a trade fiction house.
- **[V]** CMOS 18 chapter 2 covers "Tracking changes (redlining)" (2.89) and "Author's review
  of the redlined manuscript" (2.93). — https://www.chicagomanualofstyle.org/book/ed18/part1/ch02/toc.html
- **[I]** The pipeline evidence supports the claim that **a novel usually leaves the author
  as one Word document**, whatever it was drafted in. It does not support any claim about
  what share of novelists *draft* in one document. The first pass's specialist-tool sample
  and this pipeline evidence answer different questions.

### 1.3 Tools that store a novel as one file

- **Word, Google Docs, LibreOffice.** One document per book is their default model **[I]**.
  Their stated reasons are not novel-specific.
- **[S] yWriter 7.** The yWriter group describes the short-lived `.ywc5` format as one
  "where all the scene detail was included in the one file (which YW7 does anyway)". The
  format is XML (UTF-16 in some versions). —
  https://groups.google.com/g/ywriter/c/VgGsBbDezho and the third-party converter changelog
  https://peter88213.github.io/yw2md/changelog.html. **[S]** The stated reason for the YW7
  format is that it "allowed [the developer] to simplify and tidy a lot of the program's
  code" (search summary of spacejock.com, not opened in full). So yWriter splits into scenes
  in the UI and stores them in one file.
- **[V] Longform `format: "single"`.** Single-note projects exist "so that your shorter works
  can use the same workflows and tooling as your longer ones". This is one file for short
  works only. — README above.
- **[V] Manuskript.** It can save the whole project as a single zip (first pass §1).
- **[V] Storyist.** It can keep a novel in one Fountain text file (§4.10).
- **[V] Vellum.** It imports either one `.docx` or "separate Word files for each chapter …
  drag their containing folder … and Vellum will import each one". —
  https://help.vellum.pub/importing/. So Vellum expects either shape.

**[I]** I found **no designer's statement arguing *for* one file on principle**. The
single-file tools either inherit the word-processor model or, in yWriter's case, give a
code-simplicity reason. Neither side of the question has a strong stated argument.

---

## 2. The manuscript-to-print pipeline

### 2.1 Traditional publishing

| Stage | Author's deliverable | Evidence |
|---|---|---|
| Query and submission | Sample chapters or full manuscript in "standard manuscript format" (a Word file in practice) | CMOS Shop Talk [V]; Tor [S] |
| Acquisition and editing, copyedit | Word file, edited with tracked changes and comments | CMOS 18 §§2.89–2.94 [V]; UChicago Press [V] |
| Typesetting | None; the publisher's designer lays out the book from the edited file | UChicago Press [V] |
| Proofs | Author reviews page proofs, typically PDF | CMOS 18 §§2.109, 2.138 [V] |
| Print / ebook | Publisher delivers a PDF to the printer and an EPUB to retailers | IngramSpark spec (§2.2) [V] for what printers accept |

- **[V]** Chicago's blog (Carol Saller, 12 January 2021) on submitting a novel says to
  "Double-space everything", with one-inch margins and a ragged right. The header is "the
  author's surname, a short title of the work, and a page number in the upper-right corner".
  Chapter headings are centred. On fonts: "Editors and agents who express a font preference
  most often specify 12-point Times New Roman". It adds: "A graphic designer will decide later
  how to handle unusual elements", and says agent and publisher guidance "should override the
  guidelines offered here". — https://cmosshoptalk.com/2021/01/12/how-to-format-a-novel-for-submission/
- **[V]** CMOS 18 chapter 2, "Manuscript Preparation, Manuscript Editing, and Proofreading",
  has sections on "Word-processing styles" (2.87), "Formal markup languages" (2.88),
  "Tracking changes (redlining)" (2.89), "First proofs and 'galley' proofs" (2.109) and
  "Proofreading tools for PDF" (2.138). — https://www.chicagomanualofstyle.org/book/ed18/part1/ch02/toc.html
  (table of contents only; the section text is paywalled).
- **[V]** University of Chicago Press tells authors to "keep it simple", because design comes
  later. "Any additional formatting (excluding italic) will be stripped during initial file
  processing." Notes use Word's footnote feature, extracts are left-indented, and text breaks
  without subheads are marked "<line space>". — https://press.uchicago.edu/resource/emsguide.html
- **[S]** Tor accepts agented submissions only. Its standard manuscript format is "margins of
  at least 1 inch …; indented paragraphs; double-spaced text; and Times New Roman in 12
  pitch". I could not open Tor's own FAQ (Cloudflare challenge); this comes via a third-party
  summary. — https://us.macmillan.com/torpublishinggroup/about/faq/
- **[I]** I found **no publicly posted author-facing file specification from a Big Five
  trade fiction house**. Their authors come through agents, and house specifications are not
  public. The UChicago and CMOS material is the best primary evidence for the copyedit stage.
  Trade fiction may differ in details.

### 2.2 Self-publishing

| Platform | Ebook input | Print input | Source |
|---|---|---|---|
| Amazon KDP | DOC/DOCX, KPF (Kindle Create), EPUB; also HTML, RTF, TXT, PDF. MOBI no longer accepted for fixed-layout since March 2025 | PDF, DOC, DOCX, RTF, HTML, TXT; converted to PDF; PDF required for bleed; "we recommend that you convert your manuscript file to a PDF" | [V] https://kdp.amazon.com/en_US/help/topic/G200634390, [V] https://kdp.amazon.com/en_US/help/topic/G202145060 |
| IngramSpark | "EPUB 3.0 required" | "Files must be PDF/X-1a:2001 or PDF/X-3:2002 compliant"; "Text files must be submitted as a single PDF file"; all fonts embedded | [V] https://www.ingramspark.com/hubfs/downloads/file-creation-guide.pdf (dated 8.24.26) |
| Draft2Digital | DOC/DOCX, "RTF, OTF, TXT, too!" (OTF as written; probably ODT); EPUB "for ebook, but not print" | Same Word-family inputs; converted by D2D | [V] D2D help, §1.2 link |
| Vellum (layout tool) | Imports `.docx` only (one file or a folder of chapter files) | Generates both itself | [V] https://help.vellum.pub/importing/ |
| Atticus (layout tool) | Imports DOCX; EPUB "sometimes"; exports EPUB, PDF, DOCX | same | [S] https://intercom.help/atticus-5877e36564df/en/articles/12683344-can-i-import-an-epub (search summary) |

- **[V]** KDP on Kindle Create's KPF: "a go-to method for avoiding any formatting issues".
  KDP's ebook formatting guide says to "apply Heading 1 to chapter titles" (this also builds
  the table of contents), use a "First line indent to 0.2"", and insert page breaks between
  chapters. — https://kdp.amazon.com/en_US/help/topic/G200645680
- **[I]** Across every entry point:
  - **DOCX is universally accepted.**
  - **EPUB is the one open standard every retailer accepts**: KDP, IngramSpark (required)
    and D2D (passed through).
  - **Print requires a finished PDF** at IngramSpark and is recommended at KDP.
  - **No platform accepts Markdown or any plain-text markup**, except TXT, which cannot carry
    italics.

### 2.3 Is "Standard Manuscript Format" a standard?

**No.** No standards body defines it. It is a convention, and its best-known write-up is one
writer's guide.

- **[V]** William Shunn wrote the guide in "late 1993 or early 1994" for his writing group,
  having learned from Damon Knight and Algis Budrys. He writes: "what I'm saying is not
  absolute gospel", and "Other writers more successful than I would no doubt quibble with some
  of my details". — https://www.shunn.net/format/introduction.html
- **[V]** Since 2020 the guide comes in two versions, "Modern" (a proportional serif and
  "one space between sentences") and "Classic" (a monospaced font and "two spaces between
  sentences"). The stated reason is that "electronic submissions have come to dominate". —
  https://www.shunn.net/format/2020/04/proper_manuscript_format_now_comes_in_two_distinct_flavors.html.
  "If a publication specifically asks for 'Shunn Classic' format, they mean you should use a
  Courier font". — https://www.shunn.net/format/story
- **[V] What Shunn's novel guide specifies (as far as I could extract):**
  - "one-inch margins all around", black type, 12 points, "something standard and easily
    readable, like Times New Roman", or Courier New. — https://www.shunn.net/format/story
  - "Page numbering begins with 1 on the second page of the manuscript (the first page of
    actual text), and each chapter begins on its own page." The header reads "Surname /
    Title / page" and the title page carries "about 80,000 words". —
    https://www.shunn.net/format/novel/ (last updated 25 October 2025)
- **Not extracted.** Shunn's rules on italics versus underlining and on the scene-break
  marker live in rollover annotations on his pages. They were in neither the HTML text nor
  the PDF text layer. **Unverified here**; see open questions.
- **[V] Consistency across sources.**
  - Chicago (§2.1), Shunn and Tor (§2.1, [S]) agree on the core: 12pt, a plain serif (Times
    New Roman most often), double spacing, one-inch margins, a surname/title/page header, and
    chapters starting a new page.
  - They differ on header placement and Courier versus Times. Shunn Modern and Classic differ
    on sentence spacing.
  - Chicago and Shunn both defer to the recipient's own guidelines.

**[I]** Every item SMF specifies is a property of the page: font, size, spacing, margins,
header and page numbering. SMF says almost nothing about the *text* beyond "chapters start a
page", which assumes the text already knows where chapters are.

### 2.4 Page count and word count

**Novels have no page-count semantic.** The unit of length is the word.

- **[V]** The Hugo Awards define categories by word count: Best Novel is "forty thousand
  (40,000) words or more"; Novella 17,500–40,000; Novelette 7,500–17,500; Short Story under
  7,500. — https://www.thehugoawards.org/hugo-categories/
- **[V]** Shunn (2021) on the old rule: "the accepted rule for estimating word count was 250
  words per manuscript page". It "worked because most everyone was using a typewriter where
  ten characters took up exactly an inch and about 25 double-spaced lines fit on a page. If
  you change any of those factors … the rule of thumb is no good." And: "Publishers today use
  the actual computer-generated word count". —
  https://www.shunn.net/format/2021/04/the_old_rule_of_thumb_for_estimating_word_count_is_obsolete.html
- **[V]** KDP: "eBooks are reflowable and can be viewed with different font sizes, so page
  numbers and page count don't apply." — https://kdp.amazon.com/en_US/help/topic/G200645680
- **[V]** KDP print cost is "Fixed cost + (page count × per page cost)", varying by trim
  size, ink and paper. — https://kdp.amazon.com/en_US/help/topic/G201834340
- **[I]** For a printed novel, page count is an **output** of trim size, typeface, leading and
  margins, chosen at typesetting. It matters for cost and spine width, not as a claim about
  the work. This is the opposite of ADR-0001's screenplay page ("a claim about the work").
  The novel-side equivalent of a semantic page is **word count**. That makes the definition of
  a word count part of the prose surface, but it constrains no layout.

### 2.5 Ebook standards

- **[V]** EPUB 3.3 is a **W3C Recommendation**. The page I fetched was dated 13 January 2026.
  - A publication is "a set of interrelated resources packaged in an EPUB container", and
    typically "a single intellectual or artistic work".
  - Content documents are "XHTML or SVG content document[s]".

  — https://www.w3.org/TR/epub-33/
- **[V]** The EPUB 3 Structural Semantics Vocabulary 1.1 is a **W3C Group Note**
  (28 May 2026). It defines `part` ("A major structural division …"), `chapter`, `epigraph`,
  `dedication`, `footnote`, `frontmatter`, `bodymatter`, `backmatter` and `pullquote`.
  **`endnote` is deprecated**, and it has **no term for a scene break or a poem**. —
  https://www.w3.org/TR/epub-ssv-11/
- **[V]** HTML's `<hr/>` fills the scene-break gap. Standard Ebooks: "`<hr/>`: Denotes a
  thematic break … it strictly denotes a thematic break." — Standard Ebooks Manual 1.9.1,
  rule 4.1.1.2.7, https://standardebooks.org/manual/1.9.1/4-semantics
- **[V]** KDP accepts EPUB that meets the Kindle Publishing Guidelines, and IngramSpark
  requires EPUB 3.0 (§2.2).

---

## 3. What adherence would constrain

### 3.1 The comparison with screenplay

**[I]** On the screenplay side:
- The format (Courier 12pt, fixed margins) *is* the semantics, because a page is a minute
  (ADR-0001).
- Storage must hold Fountain's element vocabulary (ADR-0004).
- Layout must be computed by our own engine, since page breaks are facts about the work.

On the novel side, §2.3 and §2.4 show that every format convention lives in an output file,
and length is measured in words. **The novel side constrains the stored manuscript's element
vocabulary, and everything else is export.**

### 3.2 What the stored manuscript must be able to represent

A requirement belongs here only if some downstream consumer needs the distinction and it
cannot be recovered from plain prose.

| Element | Who requires or marks it | Notes |
|---|---|---|
| **Italics** | Everyone. UChicago preserves italic and strips everything else [V]. SE splits `<em>` (emphasis) from `<i>` (non-emphatic italics such as titles, foreign words and sounds), rules 4.1.2.1–2, 8.2.2, 8.2.6 [V] | The em/i split is optional; only SE-grade semantic ebooks need it |
| **Bold** | Rare in fiction. SE uses `<b>` for "Text rendered in small caps" (4.1.2.3) [V] | — |
| **Underline** | [I] Mainly as an old manuscript stand-in for italics (not verified in Shunn, §2.3). Fountain keeps a true underline. The catalog already requires it (first pass) | Keeping a distinct underline costs nothing |
| **Small caps** | SE: strong emphasis "may be set in small caps with the `<strong>` element" (8.2.3); telegrams use `all-small-caps` (7.7.2) [V]. ODF has `fo:font-variant` small-caps (§20.192) [V] | Usually a *rendering* of a semantic element (emphasis, a telegram, an opening line) |
| **Scene break** | SE `<hr/>` (4.1.1.2.7) [V]; rST transitions "are commonly seen in novels and short fiction" [V]; Markua `* * *` "is used as a 'scene break' in a novel" [V]; UChicago "<line space>" [V] | Must be an element, not blank lines, or it is lost at a page top in print |
| **Chapter and part headings**, with separate ordinal and title | SE `<hgroup>` with an ordinal plus title (7.2.6) [V]; EPUB SSV `part` and `chapter` [V]; KDP "apply Heading 1 to chapter titles" [V] | SMF's "each chapter begins on its own page" is export; knowing where a chapter begins is storage |
| **Epigraph** | EPUB SSV [V]; SE 7.4 [V]; DocBook `epigraph` [V]; rST `epigraph` directive [V] | Often carries an attribution |
| **Block quotes, letters, inserted documents** | SE: `<blockquote>` for "business cards, headstones, telegrams, letters" (4.1.1.2.2), letters with `z3998:letter` (7.7.1), signatures in `<footer>` (4.1.1.2.6) [V]; UChicago "Left-indent all extracts" [V] | — |
| **Verse: line breaks and indentation levels** | SE: a stanza is a `<p>`, each line a `<span>` followed by `<br/>`, and "Indenting to different levels is done by incrementing the class to i2, i3 … Do not use nbsp for indentation" (7.5.1–7.5.4); verse inside a novel is a `<blockquote>` (7.5.5) [V] | Poetry is already a prose format here (ADR-0005). SE models indentation as **levels**, not space counts |
| **Notes** | UChicago uses Word's footnote feature [V]; SE: "Ebooks do not have footnotes, only endnotes. Footnotes are instead converted to endnotes." (7.10.1) [V]; ODF `text:note` with `text:note-class` [V] | [I] Storing "a note here" is enough; footnote versus endnote is an export decision in ebooks |
| **Front and back matter types**: dedication, epigraph page, acknowledgements, afterword, colophon | EPUB SSV `frontmatter`, `bodymatter`, `backmatter`, `dedication` [V]; SE §3 and §6 [V] | Typed sections, not just headings |
| **Language of a span** | SE: non-English headers "retain `xml:lang` semantics" (7.2.7) [V] | Beyond the brief; affects hyphenation and screen readers |
| **Italicised thoughts** | SE: thoughts in italics "are formatted with `<q>`, styled with italics" (8.2.7) [V] | Beyond the brief; storing italics is a lossy but acceptable fallback |

### 3.3 What adherence requires only of export

All sourced in §2:

- **Manuscript (SMF):** font (Times New Roman or Courier), 12pt, double spacing, one-inch
  margins, ragged right, the "Surname / Title / page" header and its position, page numbering
  from the first text page, each chapter on a new page, a title page with contact details and
  a word count rounded for display, one or two spaces between sentences. [I] The Classic
  flavour's two spaces are a text transform an exporter can apply. A Classic-style
  underline-for-italics, if still required, would be an export transform too.
- **Print:** trim size, margins and gutters, bleed, PDF/X-1a or PDF/X-3, embedded fonts, a
  single PDF file (IngramSpark), first-line indents, no indent after a break (SE 8.4.2 [V]),
  running heads, and drop caps.
- **Ebook:** EPUB 3 packaging, CSS, the TOC and nav built from chapter headings, and
  footnote-to-endnote conversion.

### 3.4 What this does and does not settle

- **[I]** Adherence to these standards does **not** decide one file versus many. IngramSpark
  wants one print PDF, KDP one upload, and Vellum takes either one DOCX or a folder of them.
  All of these are *export* artefacts.
- **[I]** It **does** strengthen one first-pass conclusion: chapter, part and scene
  boundaries must be *in the manuscript*. Every consumer above expects them in the text
  (headings, `<hr/>`, `<section>`), so a sidecar-held tree (first pass model C) cannot supply
  them without becoming model A.
- **[I]** It adds requirements the catalog has not listed: epigraphs, block quotes and
  letters, verse **indentation levels** (the catalog's "exact indentation preserved"
  overlaps), notes, typed front and back matter, and possibly small caps and language spans.
  Each must be representable, but a writer need not use any of them.

---

## 4. Plain-text markup languages for a novel

Each language is judged against the §3.2 vocabulary, against ADR-0003 (readable in a text
editor) and against round-trip (GLOSSARY.md).

### 4.0 Round-trip: a finding that applies to all of them

- **[V]** Pandoc: "Because pandoc's intermediate representation of a document is less
  expressive than many of the formats it converts between, one should not expect perfect
  conversions … conversions from formats more expressive than pandoc's Markdown can be
  expected to be lossy." — https://pandoc.org/MANUAL.html (introduction)
- **[V]** remark/mdast, the main JavaScript Markdown toolchain: "complete roundtripping is
  impossible given that any value could be injected into the tree." —
  https://github.com/syntax-tree/mdast-util-to-markdown
- **[V]** XML: "the order of attribute specifications in a start-tag or empty-element tag is
  not significant". Attribute values are whitespace-normalised. — XML 1.0 §3.1 and §3.3.3,
  https://www.w3.org/TR/xml/. A standard XML parse–serialise cycle is therefore not
  byte-identical. This affects DocBook, flat ODT and SE XHTML alike.
- **[I]** No language surveyed ships a byte-exact round-trip parser as its main tool. All of
  them parse to an AST or tree and re-serialise in a normalised form. Under our acceptance
  test, Write-ist would write its own lossless (concrete-syntax) parser **whichever language
  is chosen**, as it must for Fountain. What the language choice changes is:
  - how precisely the grammar is specified (what a lossless parser must agree with);
  - how much of the file is structure rather than prose (XML is mostly structure);
  - whether other tools will *misread* the file (first pass §4).

### 4.1 Overview

Key: ✓ covered in the spec or docs; ~ via an escape hatch (raw HTML, classes or roles); ✗
not provided; ? not verified.

| Language | Italic / bold | Underline | Small caps | Scene break | Chapter / part | Epigraph | Block quote | Verse lines + indent | Notes | Front / back matter types | Readable (ADR-0003) | Formal spec |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CommonMark | ✓ | ~ raw HTML | ~ raw HTML | ✓ thematic break | ✓ headings (no part/chapter type) | ✗ | ✓ | ✗ (first pass §4) | ✗ | ✗ | Yes | Yes (0.31.2) |
| Pandoc Markdown | ✓ | ✓ `{.underline}` | ✓ `{.smallcaps}` | ✓ | ✓ + `epub:type` attribute | ~ fenced div with class | ✓ | ✓ `line_blocks` | ✓ | ~ `epub:type` | Yes | The manual only |
| MultiMarkdown 6 | ✓ | ✗? | ✗? | ✓ | ✓ | ✗ | ✓ | ✗? | ✓ | ✗ | Yes | Syntax guide |
| Markua | ✓ | ✓ (spec §11.21) | ? | ✓ `* * *` | ✓ `{class: part}` | ? | ✓ (+ asides, blurbs) | ~ `soft-breaks: break` (whole document) | ✓ footnotes + endnotes | ? | Yes | Yes (0.31.50) |
| AsciiDoc | ✓ | ✓ `[.underline]#…#` | ✗ (`small` deprecated) | ✓ | ✓ book doctype: parts, chapters | ✓ via quote block | ✓ | ✓ verse block | ✓ | ✓ preface, dedication, colophon, appendix | Yes | In progress (Eclipse) |
| reStructuredText | ✓ | ✗ | ~ roles | ✓ transitions | ✓ sections (no part type) | ✓ directive | ✓ | ✓ line blocks | ✓ | ✗ | Yes | Yes (docutils) |
| LaTeX | ✓ | ✓ | ✓ | ✓ (class macros) | ✓ | ✓ (class) | ✓ | ✓ verse | ✓ | ✓ | Partly: markup-heavy | No (a macro language) |
| DocBook 5.2 | ✓ | ~ `role` | ~ `role` | ? | ✓ | ✓ | ✓ | ✓ `literallayout` | ✓ | ✓ | Poor: verbose XML | Yes (RELAX NG) |
| Flat ODT (.fodt) | ✓ styles | ✓ | ✓ | ~ styled paragraph | ~ styled headings | ~ styles | ~ styles | ~ | ✓ `text:note` | ~ | Poor: style-heavy XML | Yes (ODF 1.3) |
| Standard Ebooks XHTML | ✓ (+ em/i split) | ~ CSS | ✓ | ✓ `<hr/>` | ✓ `<section>` + `<hgroup>` | ✓ | ✓ | ✓ levels `i1`–`iN` | ✓ endnotes | ✓ | Fair: tags throughout | XHTML + EPUB 3.3 + SE manual |
| Fountain (as prose) | ✓ | ✓ `_…_` | ✗ | ~ centred text | ~ sections / forced headings | ✗ | ✗ | ✓ in Action (first pass §4) | ~ `[[ ]]` notes are not footnotes | ✗ | Yes | Informal syntax page |

The per-language notes below give the citations.

### 4.2 CommonMark

- Coverage, readability and gaps are in first pass §4 (all [V], CommonMark 0.31.2): no
  underline, indentation stripped, and soft line breaks. Raw HTML is permitted, which is the
  only route to underline or small caps.
- **Fiction use.** iA Writer, Ulysses (Markdown mode) and Obsidian/Longform (first pass §1).
- **Pipeline.** Pandoc (§4.3).

### 4.3 Pandoc Markdown

- **[V] Coverage.** `[Underline]{.underline}`; "To write small caps, use the smallcaps
  class: `[Small caps]{.smallcaps}`"; footnotes (extension); `line_blocks` for verse,
  preserving leading spaces (first pass §4); and fenced divs and bracketed spans with classes.
  EPUB output honours an `epub:type` attribute on headings: `# My chapter {epub:type=prologue}`
  produces `<section epub:type="prologue">` inside `<body epub:type="frontmatter">`. —
  https://pandoc.org/MANUAL.html
- **[V] DOCX pipeline.** `--reference-doc` supplies the styles, and `custom-style`
  divs and spans map to named Word styles. The manual's example is `::: {custom-style="Poetry"}`. —
  same manual, "Custom Styles".
- **[V] Line blocks and EPUB input.** The `line_blocks` extension is "disabled by default"
  for the `epub` *input* format. This concerns reading EPUB, not writing it. — manual,
  extension table.
- **Spec.** [I] There is no formal grammar beyond the manual. Behaviour is defined by
  Pandoc's implementation and its extension flags.
- **Round-trip.** Pandoc is AST-based and lossy by its own account (§4.0).
- **[I] Fiction use.** Pandoc is the converter most often named in self-publishing
  discussions, but I found no primary survey of Pandoc use among novelists.

### 4.4 MultiMarkdown 6

- **[V]** The syntax guide's features are abbreviations, citations, CriticMarkup, file
  transclusion, footnotes, metadata, table of contents, glossaries and math. —
  https://fletcher.github.io/MultiMarkdown-6/syntax/
- **[I]** Underline, small caps, verse or line preservation, epigraphs and typed front matter
  do not appear in that list, so they are probably absent. I did not confirm this against the
  source.
- **Transclusion.** File transclusion is relevant to the one-file-or-many question. It is the
  MMD counterpart of iA Writer's Content Blocks (first pass §1).

### 4.5 Markua (Leanpub)

- **[V] Spec.** Version 0.31.50 (2026-08-11). It builds on the CommonMark spec text; sections
  marked "(M)" are Markua additions and "(GFM)" GitHub ones. The spec states it "attempts to
  specify Markdown syntax unambiguously" with examples. — https://markua.com/
- **[V] Coverage.**
  - Scene breaks: a thematic break "is used as a 'scene break' in a novel".
  - Part headings: `{class: part}` above a `#` heading.
  - Underline (§11.21, "(M)") and "Footnotes and endnotes" (§11.20).
  - Line breaks: a `soft-breaks` document setting, where `break` makes single newlines hard
    breaks.
  - "Raw HTML must be completely removed by the Markua Processor", so there is no HTML escape
    hatch.

  — https://markua.com/. The Markua Manual has a chapter "How to Write a Novel in Markua
  0.10". — https://leanpub.com/markua/read
- **[I] Parser.** I found no open reference parser. Leanpub's processor is its own. The
  `soft-breaks` setting is per document, so a novel with some verse needs either `break`
  everywhere or block-level handling. I did not verify which Markua offers.
- **Pipeline.** Leanpub generates PDF and EPUB. I did not verify a DOCX route.

### 4.6 AsciiDoc

- **[V] Book doctype.** "A part is a level 0 section. A part must contain at least one level
  1 section." Special sections include `[preface]`, `[appendix]`, `[glossary]` and
  `[colophon]`, plus dedication. — https://docs.asciidoctor.org/asciidoc/latest/sections/parts/
- **[V] Underline.** Built-in roles: "The text `[.underline]#underline me#` is underlined."
  There is no built-in small-caps role, and `small` is deprecated. —
  https://docs.asciidoctor.org/asciidoc/latest/text/text-span-built-in-roles/
- **[V] Verse.** "When you need to preserve indents and line breaks, use a `verse` block." —
  https://docs.asciidoctor.org/asciidoc/latest/blocks/verses/
- **[V] Spec status.** The Eclipse AsciiDoc Language project is "Incubating". It maintains
  "the official specification, Technology Compatibility Kit (TCK)", and the spec will cover
  "the syntax and grammar, Abstract Semantic Graph (ASG)". I found no released version. —
  https://projects.eclipse.org/projects/asciidoc.asciidoc-lang and
  https://gitlab.eclipse.org/eclipse/asciidoc-lang/asciidoc-lang
- **[I] Pipeline.** Asciidoctor produces HTML, DocBook and PDF, and an EPUB3 converter
  exists. DOCX goes through DocBook and Pandoc. I did not verify these routes here.
- **Fiction use.** I found no evidence of fiction use.

### 4.7 reStructuredText

- **[V] Transitions.** The spec's own text: "Transitions are commonly seen in novels and
  short fiction, as a gap spanning one or more lines, with or without a type ornament such as
  a row of asterisks." It prefaces the section with a quotation from CMOS 14th ed. §1.80
  ("extra space or a type ornament between paragraphs may be used to mark text divisions").
  — https://docutils.sourceforge.io/docs/ref/rst/restructuredtext.html
- **[V] Other coverage.** The spec includes line blocks, block quotes and several footnote
  forms (same page). The `epigraph` directive "produces an 'epigraph'-class block quote". —
  https://docutils.sourceforge.io/docs/ref/rst/directives.html
- **[I] Underline.** The inline markup is emphasis, strong, literal and interpreted text; the
  spec uses "underline" only for section-title adornment. Underline would need a custom role.
- **Pipeline.** Pandoc reads rST.
- **Fiction use.** I found none, but the spec's own examples mention novels.

### 4.8 LaTeX

- **[V]** The CTAN `novel` class is "specifically written to meet the needs of original
  fiction writers, who are typesetting their own novels for non-color print-on-demand", with
  "Built-in PDF/X". — https://ctan.org/pkg/novel
- **[I]** LaTeX covers every element through class macros. But:
  - it is a macro language with no fixed grammar;
  - a text-editor reader sees markup dense enough to strain ADR-0003;
  - round-trip parsing of arbitrary LaTeX is not tractable.

  Its natural role is as an **export target** for print PDF (PDF/X matches IngramSpark's
  requirement, §2.2), not as storage.

### 4.9 DocBook 5.2

- **[V] Epigraph.** "A short inscription, often a quotation or poem, set at the beginning of
  a document or component". Allowed in chapters, sections, appendices and more. —
  https://tdg.docbook.org/tdg/5.2/epigraph
- **[V] Verse.** `literallayout` is "A block of text in which line breaks and white space are
  to be reproduced faithfully"; the documentation's example is Shakespeare. —
  https://tdg.docbook.org/tdg/5.2/literallayout
- **[I]** DocBook is technical-documentation-oriented. Underline and small caps are
  conventions on `emphasis role=…`, not first-class elements.
- **Round-trip.** XML parse caveats apply (§4.0).
- **Fiction use.** I found none.

### 4.10 Flat ODT (`.fodt`)

- **[V] Single-file form.** "OpenDocument defines two methods of document representation: •A
  single XML document. •A collection of files within a package". Also: "The
  `<office:document>` element is the root element of a document in OpenDocument format which
  is represented as a single XML document. It contains the entire document." — ODF 1.3 Part 3
  (OASIS Standard, 27 April 2021), §3.1.1–3.1.2,
  https://docs.oasis-open.org/office/OpenDocument/v1.3/os/part3-schema/OpenDocument-v1.3-os-part3-schema.html
- **[V] Coverage.** `fo:font-variant` takes "normal or small-caps" (§20.192). Notes are
  `<text:note>`, with `text:note-class` distinguishing footnote from endnote (§6.3, §19.843).
- **[S]** The spec does not define the `.fodt` extension; it is conventional. —
  https://en.wikipedia.org/wiki/OpenDocument_technical_specification
- **[I]** Formatting lives in named or automatic *styles*, so semantics (epigraph, scene
  break) exist only as style names. A text-editor reader sees a large style preamble before
  any prose. LibreOffice rewrites the whole file on save, so its output is not a stable
  plain-text artefact.
- **Pipeline.** Draft2Digital's own list includes "OTF", which is probably ODT (§2.2).

### 4.11 Standard Ebooks XHTML

- **[V] Covers every §3.2 element, with rules:**
  - sectioning: `<section>` for "parts, volumes, books, chapters, or subchapters" (7.1.2);
  - headings: `<hgroup>` for ordinal plus title (7.2.6);
  - epigraphs (7.4) and verse with indentation levels (7.5);
  - letters (7.7) and endnotes (7.10);
  - `<hr/>` for thematic breaks (4.1.1.2.7);
  - the `<em>`/`<i>` split (4.1.2) and `<b>` as small caps (4.1.2.3);
  - `xml:lang` spans (7.2.7).

  — https://standardebooks.org/manual/1.9.1/single-page (Manual of Style 1.9.1)
- **[V] File layout.** One file per chapter (2.2.4), with the order in the EPUB spine (§9.21
  in the manual's table of contents).
- **[I] Readability.** Every paragraph is a `<p>` and every verse line a `<span>`. The file is
  readable as text but tag-dense. It is the strongest *semantic* reference in this survey:
  a checklist of what fiction needs, written by people who mark up novels for a living.
- **Round-trip.** XML caveats apply (§4.0).
- **[I] Fiction use.** SE produces public-domain literature, mostly fiction. Its output is
  already EPUB, and DOCX would go through Pandoc.

### 4.12 Fountain for prose

- **[V]** Fountain describes itself as "a simple markup syntax for writing, editing and
  sharing screenplays". Its site does not mention prose. — https://fountain.io/
- **[V] Storyist** uses Fountain for novels:
  - "A `Type: Novel` metadata item. When Storyist sees this keyword, it applies the standard
    novel stylesheet instead of the screenplay stylesheet."
  - "Chapter titles are just sections", "section titles are just 'forced' scene headings",
    "section text is just action", and "section separators are just centered separator
    characters".
  - "Your comments, index card summaries, section titles, and bold/italic/underlining will
    all survive the round trip through a plain text file."

  — https://www.storyist.com/support/howto/use-fountain-for-novel-manuscripts/
- **[I] What it would give Write-ist:**
  - one parser family for both surfaces;
  - underline and authored line breaks and indentation in Action (first pass §4);
  - `[[ ]]` notes for inline anchors (ADR-0008).
- **[I] What it lacks:** epigraphs, block quotes, verse as a *marked* block, footnotes,
  small caps and typed front matter. Storyist's mapping also reuses screenplay elements
  under other names, and ADR-0005 assigns the element vocabulary to the surface, not the
  file format. I found no other tool using Fountain for prose.

---

## Verified vs inferred

**Verified (primary sources, quoted):**
- The stated reasons of L&L (McElhearn, 2021 and 2023), Ulysses, novelWriter and yWriter,
  and Longform's lack of a stated reason.
- Bernoff's survey methodology and its nonfiction-only sample.
- KDP's ebook and print formats, its print cost formula and its "page count don't apply"
  statement; IngramSpark's PDF/X, single-PDF and EPUB 3.0 requirements; Draft2Digital's and
  Vellum's inputs.
- The contents of CMOS 18 chapter 2, UChicago Press's Word requirement and formatting rules,
  and Chicago's blog on novel submission.
- Shunn's origin, "not absolute gospel", the Modern and Classic versions, the font, margin,
  size and chapter-page rules, and the 250-words-per-page history.
- Hugo word-count categories; the status and definitions of EPUB 3.3 and EPUB SSV 1.1.
- Every Standard Ebooks rule cited.
- Pandoc's coverage and its lossy statement; remark's round-trip statement; XML 1.0 on
  attribute order.
- Markua's spec version and features, AsciiDoc's features and spec status, rST transitions,
  epigraph and line blocks, DocBook's `epigraph` and `literallayout`, ODF 1.3 §3.1.2 and
  small caps, CTAN `novel`, Fountain's self-description, and Storyist's Fountain-for-novels
  mapping.

**Secondary:**
- yWriter 7 storing everything in one `.yw7` XML file, and the reason for the new format.
- Tor's manuscript format and agent-only policy (Tor's own page was blocked).
- Atticus's import and export formats (search summary of its help centre).
- The informal White Rabbit poll.
- The `.fodt` extension being conventional.

**Unverifiable:**
- The "Reedsy 2024, n=1,007" figures.

**Inferred (my reasoning):**
- That the stated reasons for many files are editor affordances plus file-system properties,
  and that none is a publishing reason.
- That the pipeline shows a novel usually *leaves* the author as one Word document.
- That novel-side standards constrain export and storage vocabulary, not layout.
- That word count is the novel's equivalent of the semantic page.
- The classification of each element into storage versus export in §3.
- That Write-ist would need its own lossless parser whichever language it chooses.
- Every judgement of readability, fiction use and pipeline marked [I] in §4.

## Open questions

1. **What novelists draft in.** No survey with a published methodology exists for fiction.
   Reedsy, ALLi or NaNoWriMo may hold data that is not public. Asking them is the only route
   I can see.
2. **Shunn's rules on italics and scene breaks.** Whether Modern format says "use italics"
   and whether `#` is the scene-break marker sit in rollover annotations I could not extract.
   Reading https://www.shunn.net/format/novel/ in a browser would settle it in a minute.
3. **Trade-publisher file specifications.** No Big Five author-facing file spec is public.
   An agent or an author with a recent contract could say whether copyedits still come back
   as Word files with tracked changes. Chicago's material implies they do.
4. **yWriter's storage.** Whether `.yw7` is truly one file for the whole novel, and the
   developer's stated reason. The spacejock help file would say; I reached it only
   second-hand.
5. **Markua details.** Whether it has an open parser, whether `soft-breaks` can be set per
   block (a novel with some verse needs that), and whether Leanpub exports DOCX.
6. **The em/i distinction.** SE's two kinds of italics are the one place where a
   publishing-grade ebook asks the manuscript for *more* than a word processor stores.
   Whether Write-ist cares is a product question, not an evidence question.
7. **Word count rules.** Word count is the novel's length semantic, and neither Shunn nor
   Chicago defines exactly what counts: headings, epigraphs, notes. Write-ist would be
   defining it.
