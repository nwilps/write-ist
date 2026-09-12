# Project identity and cross-project state: evidence

Research for ticket [#3](https://github.com/nwilps/write-ist/issues/3), which asks two things:
**does a project carry a durable identity?** and **does anything live above a bundle?** This is
evidence and trade-offs, **not a recommendation** — the decisions belong to #4 and #5. Written
2026-09-12.

Terms follow `CONTEXT.md`. Three collisions to watch, since every tool surveyed uses one of our
words for something else:

- **Lock.** Ours is declaring a draft finished (permanent, archival). novelWriter's "lock file"
  is a concurrency guard on an open project. Where a tool's own word is quoted it is marked as
  theirs.
- **Workspace.** Ours is a full screen the writer switches to. VS Code's "workspace" is a
  project — one folder or a `.code-workspace` file.
- **Bundle.** Obsidian calls it a *vault*, Logseq a *graph*, Scrivener and novelWriter a
  *project*, Syncthing a *folder*, git a *repository*. All are the same shape: a directory the
  app adopts.

Binding constraints, restated so the analysis can be checked against them:

- **ADR-0003.** Fully local — no accounts, no sync, no network, no telemetry. And the stronger
  clause underneath it: the work stays readable in a text editor by someone who has never heard
  of Write-ist.
- **ADR-0009.** Everything inside a **bundle** is text, forever. No binary files, ever.
- **ADR-0012.** The **sidecar** is readable: the writer's words come back as documents, the
  app's bookkeeping is plain structured text. "Data" is not permission to be opaque — no
  binary formats, no compression, no database files.
- **ADR-0008 rule 3.** A failed load never authorises a write. The silent-destruction pattern
  is a failed read initialising empty state, which the next autosave writes over the good file.
- **ADR-0008 rule 1.** An **anchor** exists on both sides, or is derivable from content. An
  identifier held only by one side is not an anchor. (Written about manuscript/sidecar, but it
  reads directly onto bundle/registry, and §6 does that.)

Note on scope: ADR-0009 and ADR-0012 bind *inside* a bundle. Whether they bind a store that
lives *outside* every bundle is not settled anywhere in `docs/adr/`, and it is the single
question that most changes the shape of #5. §6.4 lays out what follows either way without
choosing.

Confidence markers, as in the existing notes:

- **[V] Verified.** Read in the primary source: a spec, official docs, or source code I
  inspected.
- **[S] Secondary.** A third party, a forum user, or a search-engine summary I did not open in
  full.
- **[I] Inferred.** My reasoning, not a sourced fact.

Prior work cited rather than repeated: `prose-manuscript-storage.md` ("first pass") covers how
Scrivener, Ulysses, iA Writer, Longform and Manuskript store a manuscript, and
`prose-publishing-standards.md` ("second pass") covers novelWriter's stated reasons for many
files. Source files read on 2026-09-12 are cited at the default-branch head of that date.

---

## Summary

**Question 1 — identity.** Three mechanisms exist and every tool surveyed picks one or two,
never all three.

1. **A marker or id file inside the folder.** novelWriter writes a UUID4 into
   `nwProject.nwx`; Scrivener carries an `Identifier` on the project element; Syncthing writes
   a `.stfolder` marker; git writes `.git/`. This is the only mechanism that survives a move
   between machines and a restore from backup, because it is *part of the copied bytes*. Its
   cost is exactly that: a duplicated folder is a duplicated id, and the app cannot tell the
   copy from the original without asking.
2. **An external registry keyed by path.** Obsidian's `obsidian.json`, Logseq's
   `~/logseq/graphs/<encoded path>`, VS Code's recently-opened list, novelWriter's
   `recentProjects.json`. Survives nothing — a rename or a move breaks the key.
3. **Filesystem identifiers.** Only VS Code uses one, and only as *salt*: its per-folder
   storage id is `md5(path + inode-or-birthtime)`, deliberately designed so a recreated folder
   gets a *different* identity. Apple documents that its own file ids "are not safe to store
   and reuse between launches". Microsoft documents that "File IDs are not guaranteed to be
   unique over time, because file systems are free to reuse them".

The sharpest finding is git's, because git has **no project identity at all**: there is no
UUID anywhere in `.git`, and the thing git does identify — objects — is identified by a hash of
its own content, so move, rename, copy and restore are all no-ops. Identity derived from
content is the one answer that survives every event in the ticket. Identity *stored* in a file
survives everything except duplication; identity *derived from location* survives nothing.

**Question 2 — the layer above.** Every tool that has cross-project state puts it in the OS's
per-user application directory, never inside a project. The conventions are settled and
Tauri v2 already maps them (§4.1). The one gap: the XDG spec defines `XDG_STATE_HOME`
specifically for "recently used files" and "current state of the application", and Tauri's path
API exposes no equivalent — it offers config, data, local-data and cache, but no state dir.

**When the store disagrees with reality**, four distinct strategies are in use, and none of
them is "reconcile eagerly":

- **Check at the point of display, not at load** (VS Code: stale recents stay in the list; the
  existence check happens only when projecting into the macOS dock or the Windows jump list).
- **Never collect the orphan** (VS Code's storage cleaner explicitly skips folder-keyed
  storage — `return; // keep workspace storage for folders/workspaces that can be accessed
  still` — so per-folder state from a moved folder accumulates forever).
- **De-duplicate from the id inside the folder** (novelWriter: the registry is keyed by path
  but carries the project uuid, and on open it removes the *other* path holding that uuid).
- **Fail closed on a missing marker** (Syncthing: no `.stfolder` means "stop syncing", not
  "everything was deleted"; git worktree: a missing working tree is pruned only after a grace
  period, and `git worktree repair` exists precisely for the moved-folder case).

That last pair is the ADR-0008 rule 3 shape, observed in the wild: a load that cannot confirm
reality refuses to act rather than acting on empty state.

---

## 1. Question one: how a folder-backed app knows which project this is

### Summary table

| Tool | Where identity lives | Survives rename | Survives move | Survives duplication | Survives restore-from-backup |
|---|---|---|---|---|---|
| git (objects) | Hash of the content itself | Yes | Yes | Yes — copies are *legitimately* the same objects | Yes |
| git (which repo is this) | Nothing; discovery by walking up to a `.git` | n/a — there is no repo id | n/a | Two copies are indistinguishable | n/a |
| git (linked worktrees) | Reciprocal path pointers: a `.git` file and a `gitdir` file | No — needs `repair` | No — needs `repair` | Not designed for it | No |
| novelWriter | UUID4 in `nwProject.nwx` inside the folder | Yes | Yes | **No** — copy carries the same uuid | Yes |
| Scrivener | `Identifier` UUID on the project element in `.scrivx` **[S]** | Yes | Yes | **No** | Yes |
| Obsidian | Random 16-hex id minted per *registered path*, held in `obsidian.json` outside the vault | No | No | Two entries, two ids | No |
| Logseq | Directory name under `~/logseq/graphs/` is the graph's own encoded path | No | No | Two directories | No |
| VS Code | `md5(folder path + inode/birthtime)`, computed, never stored | No | No | No — different path *and* different inode | **No, by design** |
| Syncthing | Folder ID in config; `.stfolder` marker inside proves the folder is really there | Config-keyed, so no | No | Marker is copied, ID is not | Marker yes, ID no |
| Zotero | One library, not folder-per-project; item keys in both `zotero.sqlite` and `storage/<key>/` | n/a | n/a | n/a | n/a |

### 1.1 Git: no identity, because identity is derived from content

- **[V]** There is no repository UUID. The `gitrepository-layout` manual lists everything at the
  top level of `.git` — `objects/`, `refs/`, `packed-refs`, `HEAD`, `config`, `hooks/`, `index`,
  `info/`, `logs/`, `worktrees/`, `modules/` and the rest — and none of it identifies the
  repository. — https://git-scm.com/docs/gitrepository-layout
- **[V]** What git *does* identify is content. "Git is a content-addressable filesystem … at the
  core of Git is a simple key-value data store … you can insert any kind of content into a Git
  repository, for which Git will hand you back a unique key you can use later to retrieve that
  content." The key is "the SHA-1 hash — a checksum of the content you're storing plus a
  header". — https://git-scm.com/book/en/v2/Git-Internals-Git-Objects. The glossary defines an
  object name as "The unique identifier of an object". —
  https://git-scm.com/docs/gitglossary
- **[I]** This is why every event in the ticket is a non-event for git. A rename changes
  nothing because no name was recorded; a move changes nothing because no path was recorded; a
  restore from backup reproduces the same bytes and therefore the same names; and two copies of
  a repository are not a conflict to resolve but the normal case — git can tell exactly which
  objects they share, by name.
- **[V]** The one place git *does* record a path, it needs a repair command. A linked worktree
  records its location twice, reciprocally: a `.git` file at the worktree root pointing into
  `.git/worktrees/<id>`, and a `gitdir` file in that directory pointing back. The docs spell out
  the manual fix: "if a linked worktree is moved to `/newpath/test-next` and its `.git` file
  points to `/path/main/.git/worktrees/test-next`, then update
  `/path/main/.git/worktrees/test-next/gitdir` to reference `/newpath/test-next` instead."
  `git worktree repair` automates it: "if the main worktree (or bare repository) is moved,
  linked worktrees will be unable to locate it. Running `repair` in the main worktree will
  reestablish the connection". — https://git-scm.com/docs/git-worktree
- **[V]** And the stale entry is pruned *slowly*: `prune` will "Remove worktree information in
  `$GIT_DIR/worktrees` for worktrees whose working trees are missing", but only after
  `gc.worktreePruneExpire`. — same page.
- **[I]** So even git, which avoids stored location wherever it can, ends up with the classic
  problem the moment it stores one — and its answers are a two-sided pointer, a repair command,
  and an expiry rather than an immediate delete.

### 1.2 novelWriter: a UUID inside the folder, plus a path-keyed registry that the UUID repairs

novelWriter is the closest analogue in the survey: an open-source, offline, folder-backed prose
writing application. The second pass already cites it for why it stores many files; this is
about identity. Source read at `vkbo/novelWriter@7fed728`.

- **[V]** A project is a folder containing `nwProject.nwx`. That file's presence *is* the test:
  `initProjectStorage` accepts "A folder with an nwProject.nwx file in it (not home)" or "A full
  path to an nwProject.nwx file", and otherwise returns `UNKOWN` or `NOT_FOUND`. There is no
  registry lookup in the open path. —
  https://github.com/vkbo/novelWriter/blob/7fed72810c7b938e1d4c3221ab846f53e66d1528/novelwriter/core/storage.py#L177-L202
- **[V]** The project carries a UUID4, written as the `id` attribute of the `<project>` element
  and read back from it. `setUuid` mints one lazily when the attribute is absent:
  `if not value: self._uuid = str(uuid.uuid4())`. The reader comments `# Added in 1.5`, so this
  was retrofitted onto an existing format. —
  https://github.com/vkbo/novelWriter/blob/7fed72810c7b938e1d4c3221ab846f53e66d1528/novelwriter/core/projectdata.py#L331-L338
  and
  https://github.com/vkbo/novelWriter/blob/7fed72810c7b938e1d4c3221ab846f53e66d1528/novelwriter/core/projectxml.py#L249
- **[V]** The cross-project store is `recentProjects.json` in the app data directory, a JSON
  object **keyed by path**, each entry holding `uuid`, `title`, `words`, `chars`, `time`. —
  https://github.com/vkbo/novelWriter/blob/7fed72810c7b938e1d4c3221ab846f53e66d1528/novelwriter/config.py#L1125-L1210
- **[V]** The uuid's job is repairing that registry. On update:
  `if (remove := self._map.get(data.uuid)) and (remove != str(path)): self.remove(remove)` —
  i.e. if this project's uuid is already recorded at a *different* path, drop the old entry. —
  same source, `update()`.
- **[I]** That is a complete, small answer to "the project moved": the registry is allowed to be
  wrong, and the id inside the folder corrects it the next time the project is opened from its
  new location. It costs one field and one lookup. It does nothing for a *duplicated* folder —
  opening the copy would delete the original's entry, since both claim the same uuid. I did not
  test that; it follows from the code.
- **[V]** Concurrency is handled by a file inside the folder: `nwProject.lock` (their word),
  written as plain text, one line, semicolon-delimited —
  `f"{CONFIG.hostName};{CONFIG.osType};{CONFIG.kernelVer};{int(time())}"`. If it exists, the
  project does not open: "Project is locked, so not opening". —
  https://github.com/vkbo/novelWriter/blob/7fed72810c7b938e1d4c3221ab846f53e66d1528/novelwriter/core/storage.py#L389-L402
- **[V]** Two details in that lock file bear directly on ADR-0008 rule 3. First, a lock file
  that cannot be *read* is treated as a lock, not as an absence:
  `self._lockedBy = ["ERROR", "ERROR", "ERROR", "ERROR"]`, which is truthy, so the project
  refuses to open. Second, the lock is written only after the project opens successfully —
  `self._storage.lockSession()  # Lock only after a successful open. See issue #1977`. —
  storage.py L375-L387 and
  https://github.com/vkbo/novelWriter/blob/7fed72810c7b938e1d4c3221ab846f53e66d1528/novelwriter/core/project.py#L421
- **[I]** That second line is ADR-0008 rule 3 in someone else's codebase, with an issue number
  attached: a failed load must not authorise the write that a successful load would have made.

### 1.3 Obsidian: an id minted per path, held entirely outside the vault

- **[V]** Per-vault settings live inside the vault: "Obsidian creates an `.obsidian`
  configuration folder in the root folder of the vault, which contains preferences specific to
  that vault, such as hotkeys, themes, and community plugins." App-level config lives outside,
  at `/Users/yourusername/Library/Application Support/obsidian`, `%APPDATA%\Obsidian\`, or
  `$XDG_CONFIG_HOME/obsidian/`. —
  https://obsidian.md/help/Files+and+folders/How+Obsidian+stores+data
- **[V]** Vaults do have ids, and the docs are explicit about what they are attached to:
  "Vault ID is the random 16-character code assigned to the vault, for example
  `ef6ca3e3b524d22f`. **This ID is unique per folder on your computer.**" An `obsidian://` URI
  accepts "either the vault name or the vault ID". —
  https://obsidian.md/help/Extending+Obsidian/Obsidian+URI
- **[S]** The id is a key in `obsidian.json`, whose value is the vault's absolute path plus a
  timestamp and an `open` flag:
  `{"vaults": {"3156ae10c753d15f": {"path": "/absolute/path/to/vault_one", "ts": …}}}`. I did
  not read this file myself — no Obsidian installation was available on this machine — so the
  exact schema is second-hand. —
  https://forum.obsidian.md/t/obsdian-json-automatic-vault-configuration/32700
- **[V]** Removing a vault is a registry operation only: "Removing a vault only removes it from
  the vault list." Moving one is a manual operation the app offers as "Move vault". —
  https://obsidian.md/help/manage-vaults
- **[I]** Nothing inside the vault records its id, so the id identifies a *path*, not a vault.
  Move the folder and the app has an entry pointing nowhere and a folder it does not recognise;
  re-adding it mints a fresh id. Copy the folder and you get two vaults with two ids and
  identical `.obsidian` contents. The vault survives all of this perfectly — because everything
  that matters is inside it and is plain files — but its *identity* does not survive at all.
- **[I]** That is arguably the point. Obsidian's identity layer is disposable because nothing
  important depends on it. The question for #4 is whether anything in Write-ist would depend on
  it — a draft **Line**, say, or cross-draft sidecar bookkeeping.

### 1.4 Logseq: the external store's key *is* the path

Source read at `logseq/logseq@be800f1`.

- **[V]** Per-graph state that Logseq keeps outside the graph lives at
  `<home>/logseq/graphs/<encoded graph name>`, and the encoding is of the graph's own
  identifier: `(path/path-join home-dir "logseq" "graphs" (repo->encoded-graph-dir-name repo))`.
  The per-graph backup directory hangs off the same path. —
  https://github.com/logseq/logseq/blob/be800f171172c259d4dd942346e4d247a0783738/src/main/frontend/config.cljs#L326-L336
- **[V]** The `repo` being encoded is the graph's location with a prefix —
  `file-version-prefix` is `"logseq_local_"`, `db-version-prefix` is `"logseq_db_"`. —
  https://github.com/logseq/logseq/blob/be800f171172c259d4dd942346e4d247a0783738/deps/common/src/logseq/common/config.cljs#L33-L34
- **[V]** The encoding is URI-encoding with two substitutions, so the directory name stays
  human-decodable: `encodeURIComponent`, then `%20` back to a space, `~` to `%7E`, and finally
  `%` to `~`. So `/home/me/notes` becomes something like `logseq_local_~2Fhome~2Fme~2Fnotes`. —
  https://github.com/logseq/logseq/blob/be800f171172c259d4dd942346e4d247a0783738/deps/common/src/logseq/common/graph_dir.cljs
- **[V]** The same file carries `decode-legacy-graph-dir-name`, which handles an older encoding
  where `++` meant `/` and `+3A+` meant `:`. —
  same file.
- **[I]** Two things follow. First, a path-derived key is *self-describing*: you can look at
  `~/logseq/graphs/` and read off which folder each directory belonged to, which is more than
  can be said for VS Code's md5 or Obsidian's random hex. Second, the legacy decoder is the
  cost: once the key scheme is in the field it ossifies, and changing it means shipping a
  decoder for the old one forever.
- **[I]** A move orphans the directory, and because the name is readable, a person can see that
  it is orphaned and what it was for. I found no code that reconciles or reclaims it.

### 1.5 VS Code: a derived id, salted so that it deliberately does *not* survive

Source read at `microsoft/vscode@a8f4916`.

- **[V]** The file computing workspace identifiers carries three identical banner comments:
  `// NOTE: DO NOT CHANGE. IDENTIFIERS HAVE TO REMAIN STABLE`. For a multi-root workspace the
  id is `md5(path of the .code-workspace file)`, lowercased first on non-Linux "sanitize for
  platform file system". —
  https://github.com/microsoft/vscode/blob/a8f49160195d9e967d2d51e8544dc895207518e7/src/vs/platform/workspaces/node/workspaces.ts#L24-L38
- **[V]** For a plain folder the id is `md5(folder path + a filesystem timestamp)`, and the
  comment states the intent: "Local: we use the ctime as extra salt to the identifier so that
  folders getting recreated result in a different identifier." The salt is platform-specific:
  `ctime = folderStat.ino` on Linux — "Linux: birthtime is ctime, so we cannot use it! We use
  the ino instead!" — `birthtime` on macOS, `birthtimeMs` on Windows. — same file, L45-L84
- **[I]** Read against the ticket's four events, this identifier survives none of them, and
  three of those failures are intentional. A rename or move changes the path. A restore from
  backup changes the inode (Linux) or the birthtime (macOS/Windows) even if the path is
  identical — `cp`, `rsync` and every restore tool create new inodes. A duplicate differs on
  both counts. VS Code is not trying to keep identity; it is trying to make sure two different
  folders never collide, and treating per-folder state as disposable.
- **[V]** How disposable is answered by the storage cleaner, which runs 30 seconds after start
  and walks `workspaceStorageHome`. Its first test is:
  `if (workspaceStorageFolder.length === NON_EMPTY_WORKSPACE_ID_LENGTH) { return; // keep
  workspace storage for folders/workspaces that can be accessed still }`. Only *empty-window*
  storage is ever deleted. —
  https://github.com/microsoft/vscode/blob/a8f49160195d9e967d2d51e8544dc895207518e7/src/vs/code/electron-utility/sharedProcess/contrib/storageDataCleaner.ts
- **[I]** So per-folder state orphaned by a move is never reclaimed, and because the directory
  name is an md5 of a path that no longer exists, nobody — not the app, not the user — can tell
  what it belonged to. That is the price Logseq's readable key avoids paying.

### 1.6 Syncthing: a marker file that answers "is the folder really there?"

- **[V]** "Syncthing uses a specific marker usually called `.stfolder` to determine whether a
  folder is healthy. This is a safety check to ensure that your folder is properly readable and
  present on disk." When it is missing, "syncthing assumes that the folder has encountered some
  type of error and will stop syncing it until the `.stfolder` reappears." —
  https://docs.syncthing.net/users/faq.html
- **[V]** The Folder ID lives in config, not in the folder: it is "The folder ID, which must be
  unique", and `markerName` is the "Name of a directory or file in the folder root to be used as
  a marker". — https://docs.syncthing.net/users/config.html
- **[I]** The marker exists to distinguish two states a path-keyed registry cannot tell apart:
  *the user deleted everything* and *the disk is not mounted*. Without it, an empty directory at
  the recorded path looks like a deletion, and acting on that reading destroys data. This is the
  same failure mode as ADR-0008 rule 3, in a different costume: an ambiguous read must not
  authorise the write.

### 1.7 Scrivener and Zotero, briefly

- **[S]** Scrivener's `.scrivx` carries a project-level `Identifier` attribute — a UUID such as
  `DF5DA7F0-27DB-4815-A050-B4D6F23CABA7` — alongside the binder tree, on the same third-party
  reference the first pass used (verified against a reference Mac v3 project, **not** an L&L
  specification). That reference also shows a clean split between authoritative and derived
  state *inside* the package: `search.indexes` is marked "**Regenerable**", `binder.autosave`
  and `binder.backup` are "Scrivener regenerates", while `.scrivx` is "The **authoritative**
  structure". —
  https://github.com/donnfelker/scrivener-skills/blob/e51439e0662858b61aa920214b67d9a8a4ac76ff/skills/scrivener-format/references/package-layout.md.
  Storage model: first pass §1.
- **[I]** Scrivener is the one tool surveyed that keeps its search index *inside* the project and
  labels it regenerable. Every other tool puts derived indexes outside (§4.2). Both placements
  are in use; what distinguishes them is whether derived data is allowed to travel with the
  work.
- **[V]** Zotero is the counter-shape: not folder-per-project at all, but one data directory
  (`~/Zotero`, `C:\Users\<User Name>\Zotero`, `/Users/<username>/Zotero`) holding
  `zotero.sqlite` — "the database containing the majority of your data: item metadata, notes,
  tags, etc." — plus "a `storage` folder with 8-character subfolders (e.g. 'N7SMB24A')
  containing all of your file attachments". —
  https://www.zotero.org/support/zotero_data
- **[I]** Worth one observation despite the different shape: the 8-character item key appears
  both as a row in the database and as a directory name on disk. That is an identifier existing
  on two sides — the ADR-0008 rule 1 shape — and it is what makes a Zotero data directory
  partially recoverable by hand. Everything else about Zotero fails ADR-0012 outright (§6.1).

---

## 2. What each mechanism does under each event

**[I]** throughout this section; it is the cross-product of the sourced facts above.

| | Rename the folder | Move it (same machine) | Move it (another machine) | Duplicate it | Restore from backup |
|---|---|---|---|---|---|
| **Id file inside the folder** | Survives | Survives | Survives | **Two folders, one id** | Survives |
| **Content-derived id** (hash of the manuscript, say) | Survives | Survives | Survives | **Two folders, one id** — and correctly so | Survives; but changes on the next edit |
| **External registry keyed by path** | Breaks | Breaks | Nothing to find | Two entries | Breaks if the path changed; survives if restored in place |
| **Filesystem id** (inode / NTFS FileId) | Survives | Survives only within one volume | Meaningless | Distinct — correctly | **Breaks**: a restore writes new inodes |
| **macOS bookmark data** | Survives (that is its purpose) | Survives | Meaningless | Distinct | Unverified |
| **Marker file** (`.stfolder`, `nwProject.nwx`) | Survives — it answers "is this a project", not "which project" | Survives | Survives | Survives, ambiguously | Survives |

Three things fall out that the ticket asks about directly:

1. **No single mechanism handles duplication.** An id that survives a move is an id that gets
   copied. The two goals are in direct tension: durable identity means the bytes travel, and
   duplication copies the bytes. Every tool surveyed accepts the collision rather than solving
   it. **[I]** The only detectors available are *external*: two registry entries claiming one
   id (novelWriter's `_map` would notice, and resolves it by discarding the older entry), or a
   filesystem id that differs (VS Code's salt would notice, and treats it as a different
   folder).
2. **Restore-from-backup splits the mechanisms cleanly.** Anything derived from the filesystem
   fails it, because a restore creates new inodes and new birthtimes; anything written into
   the folder passes it, because it is part of what was backed up. **[I]** This is the event
   most likely to hit a writer who has done nothing wrong, and it is the one that filesystem
   identifiers cannot be made to survive.
3. **A marker file and an id are different jobs.** novelWriter needs `nwProject.nwx` to answer
   "is this folder a project" — a question asked of an arbitrary path with no registry involved
   — and needs the uuid inside it to answer "which project". Syncthing needs `.stfolder` only
   for the first question. A design could want one, the other, or both.

---

## 3. Filesystem identifiers, and what the platform vendors say about them

This is the third option the ticket names, and it is the one where the primary sources are most
emphatic.

### 3.1 POSIX / Linux

- **[V]** "Each file in a filesystem has a unique inode number. Inode numbers are guaranteed to
  be unique only within a filesystem (i.e., the same inode numbers may be used by different
  filesystems, which is the reason that hard links may not cross filesystem boundaries)." A file
  is identified by the `st_dev` + `st_ino` pair. — https://man7.org/linux/man-pages/man7/inode.7.html
- **[I]** Uniqueness "only within a filesystem" means the pair is meaningless across machines,
  and `st_dev` itself is not stable — it depends on mount order and device enumeration. Inode
  numbers are also reused after deletion.

### 3.2 Windows

- **[V]** "The identifier that is stored in the **nFileIndexHigh** and **nFileIndexLow** members
  is called the file ID. Support for file IDs is file system-specific. **File IDs are not
  guaranteed to be unique over time, because file systems are free to reuse them. In some cases,
  the file ID for a file can change over time.**" On FAT the ID is derived from a byte offset in
  the containing directory and "Renaming a file in the FAT file system can also change the file
  ID". On NTFS "a file keeps the same file ID until it is deleted". —
  https://learn.microsoft.com/en-us/windows/win32/api/fileapi/ns-fileapi-by_handle_file_information
- **[V]** The modern 128-bit form pairs `VolumeSerialNumber` with a `FILE_ID_128`: "The file
  identifier and the volume serial number uniquely identify a file on a single computer." —
  https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_id_info
- **[I]** "On a single computer" is the operative phrase, and it is the same limit as `st_dev` +
  `st_ino`.

### 3.3 macOS

- **[V]** Apple documents file reference URLs (`file:///.file/id=6571367.2773272/`) as the
  path-free form: "as long as the file moved to another location on the same disk, its unique ID
  does not change and any file reference URLs remain valid." And then rules them out for storage,
  in bold: "**Important:** Although they are safe to use while your app is running, file
  reference URLs are not safe to store and reuse between launches of your app because a file's
  ID may change if the system is rebooted." —
  https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/AccessingFilesandDirectories/AccessingFilesandDirectories.html
- **[V]** The sanctioned alternative is a bookmark: "A *bookmark* is an opaque data structure,
  enclosed in an `NSData` object, that describes the location of a file … a bookmark can usually
  be used to re-create a URL to a file even in cases where the file was moved or renamed." —
  same page.
- **[I]** Bookmarks are the strongest move-tracking mechanism any platform offers, and they are
  macOS-only, opaque, and binary. §6.2 checks them against the ADRs; they do not pass.

---

## 4. Question two: the layer above a bundle

### 4.1 Where each OS says to put it

| | Linux | macOS | Windows |
|---|---|---|---|
| Config | `$XDG_CONFIG_HOME`, default `~/.config` | `~/Library/Application Support/<bundle id>` | `%APPDATA%` (`FOLDERID_RoamingAppData`) |
| Data | `$XDG_DATA_HOME`, default `~/.local/share` | `~/Library/Application Support/<bundle id>` | `%APPDATA%` |
| State (recents, layout) | `$XDG_STATE_HOME`, default `~/.local/state` | *(no separate convention; Application Support)* | *(no separate convention; `%LOCALAPPDATA%`)* |
| Cache / regenerable | `$XDG_CACHE_HOME`, default `~/.cache` | `~/Library/Caches` | `%LOCALAPPDATA%` (`FOLDERID_LocalAppData`) |

- **[V]** The XDG spec's definitions are verbatim as above, and `XDG_STATE_HOME` is defined for
  exactly the thing #5 is about: "state data that should persist between (application) restarts,
  but that is not important or portable enough to the user that it should be stored in
  `$XDG_DATA_HOME`", giving as examples "actions history (logs, history, recently used files, …)"
  and "current state of the application that can be reused on a restart (view, layout, open
  files, undo history, …)". — https://specifications.freedesktop.org/basedir/latest/
- **[V]** Apple: "Use this directory to store all app data files except those associated with the
  user's documents" (Application Support). For Caches, the constraint is explicit — the contents
  must be re-creatable, because "the system may delete the `Caches/` directory to free up disk
  space". Preferences should be written only through `NSUserDefaults`/`CFPreferences`, not by
  creating files directly. —
  https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemOverview/FileSystemOverview.html
- **[V]** Microsoft: `FOLDERID_RoamingAppData` is `%APPDATA%` = `%USERPROFILE%\AppData\Roaming`;
  `FOLDERID_LocalAppData` is `%LOCALAPPDATA%` = `%USERPROFILE%\AppData\Local`. Roaming follows
  the user between domain-joined machines; Local does not. —
  https://learn.microsoft.com/en-us/windows/win32/shell/knownfolderid
- **[I]** The roaming/local split is the one Windows-specific decision #5 has to make and the
  other two platforms do not offer. A recent-projects list full of absolute paths that roams to
  a different machine is wrong on arrival; a search index that roams is wasted bandwidth. Both
  argue for `%LOCALAPPDATA%`, but this is inference, not a documented rule.

### 4.2 What Tauri v2 exposes, given v1's stack

`docs/PLANNING.md` records v1's stack as Tauri v2, so the mapping matters.

- **[V]** `appConfigDir()` → `$XDG_CONFIG_HOME/<id>` | `$HOME/Library/Application Support/<id>` |
  `{FOLDERID_RoamingAppData}/<id>`. `appDataDir()` → `$XDG_DATA_HOME/<id>` |
  `$HOME/Library/Application Support/<id>` | `{FOLDERID_RoamingAppData}/<id>`.
  `appLocalDataDir()` → `$XDG_DATA_HOME/<id>` | `$HOME/Library/Application Support/<id>` |
  `{FOLDERID_LocalAppData}/<id>`. `appCacheDir()` → `$XDG_CACHE_HOME/<id>` |
  `$HOME/Library/Caches/<id>` | `{FOLDERID_LocalAppData}/<id>`. —
  https://v2.tauri.app/reference/javascript/api/namespacepath/
- **[V]** The module exposes 23 directory functions and **none of them is a state directory**.
  There is no `stateDir`, no `appStateDir`, no `XDG_STATE_HOME` mapping. — same page.
- **[I]** So the XDG-correct home for a recent-projects list is reachable only by constructing
  the path by hand. Note also that `appDataDir` resolves to *Roaming* on Windows while
  `appLocalDataDir` resolves to Local — the Windows roaming question in §4.1 is answered by
  which of the two functions gets called.

### 4.3 What tools actually keep above a project

| Tool | Kept outside every project | Kept inside each project |
|---|---|---|
| Obsidian **[V]** | Vault list with ids and paths, app-level preferences | `.obsidian/` — hotkeys, themes, community plugins, `workspace.json` layout |
| Logseq **[V]** | `~/logseq/graphs/<encoded path>/` — per-graph derived state and `backup/` | `logseq/config.edn` in the graph |
| novelWriter **[V]** | `novelwriter.toml`, `recentProjects.json`, `recentPaths.json`, plus `cache/`, `icons/`, `themes/` under the data path | `nwProject.nwx`, `nwProject.lock`, and under `meta/`: `index.json`, `options.json`, `builds.json`, `userdict.json`, `sessions.jsonl` |
| VS Code **[V]** | Recently-opened list (capped at 500 entries), `workspaceStorage/<md5>/` per folder | `.vscode/` settings |
| Scrivener **[S]** | Recent-projects list (not inspected) | `search.indexes`, `writing.history`, `Settings/` — index and history both live *inside* |
| git **[V]** | `$XDG_CONFIG_HOME/git/config` or `~/.gitconfig` — settings only, no list of repositories | `$GIT_DIR/config`, which overrides it |

- **[V]** novelWriter's per-project bookkeeping is worth noting as a shape: a `meta/` folder of
  JSON files plus `sessions.jsonl` — one JSON object per line — for usage history. —
  https://github.com/vkbo/novelWriter/blob/7fed72810c7b938e1d4c3221ab846f53e66d1528/novelwriter/constants.py#L147-L167
- **[V]** git is the one tool with *no* registry at all. Its global config is settings, and it
  gets per-project behaviour without a registry through `includeIf`: "The data that follows the
  keyword `gitdir` and a colon is used as a glob pattern. If the location of the .git directory
  matches the pattern, the include condition is met." Files are read system → XDG/user → repo,
  "with last value found taking precedence over values read earlier". —
  https://git-scm.com/docs/git-config
- **[I]** `includeIf` is an interesting middle form for cross-project settings: the global file
  holds rules keyed by *path glob*, and the project holds overrides. Nothing enumerates the
  projects, so nothing can go stale — a rule that matches nothing is simply inert. It trades the
  ability to list projects for the inability to be wrong about them.

---

## 5. When the store disagrees with reality

The four strategies observed, with what each costs.

### 5.1 Check existence at the point of display (VS Code)

- **[V]** The recently-opened list is capped (`MAX_TOTAL_RECENT_ENTRIES = 500`) and entries are
  removed on explicit user action (`removeRecentlyOpened`), including when the user deletes an
  item from the Windows jump list — "The user might have meanwhile removed items from the jump
  list and we have to respect that". Existence is checked only when *projecting* the list
  outward: building the macOS dock menu, the code clears all recent documents first — "We clear
  all documents first to ensure an up-to-date view on the set. Since entries can get deleted on
  disk, this ensures that the list is always valid" — and then collects "max-N recent workspaces
  that are known to exist", gated on `await Promises.exists(workspacePath)`. —
  https://github.com/microsoft/vscode/blob/a8f49160195d9e967d2d51e8544dc895207518e7/src/vs/platform/workspaces/electron-main/workspacesHistoryMainService.ts
- **[I]** The internal list is allowed to be wrong indefinitely; only the rendered view is
  filtered. Nothing destructive follows from a stale entry, because the entry authorises
  nothing — opening it is a user action that will fail visibly.

### 5.2 Never reclaim the orphan (VS Code again)

Covered in §1.5: folder-keyed storage is explicitly exempt from cleanup, so a moved folder's
state is stranded forever under a name nobody can decode. **[I]** The cost is unbounded growth
of unattributable data; the benefit is that no automatic process ever deletes state belonging
to a folder that might come back.

### 5.3 Let the id inside the folder repair the registry (novelWriter)

Covered in §1.2. **[I]** The reconciliation happens at the moment the project is opened from its
new location, which is the only moment the app has both facts — the new path and the id.

### 5.4 Fail closed on an ambiguous read (Syncthing, novelWriter, git worktree)

Covered in §1.6, §1.2 and §1.1. The common shape: a missing marker, an unreadable lock, or a
missing working tree produces *refusal or delay*, not action on empty state.

### 5.5 One anti-pattern, observed in code

- **[V]** novelWriter's `RecentProjects.loadCache()` sets `self._data = {}` *before* the `try`,
  and on exception logs and returns `False` — leaving `_data` empty. `saveCache()` then writes
  whatever `_data` holds. So a corrupt or unreadable `recentProjects.json` is silently replaced
  by a one-entry file on the next project open. —
  https://github.com/vkbo/novelWriter/blob/7fed72810c7b938e1d4c3221ab846f53e66d1528/novelwriter/config.py#L1133-L1168
- **[I]** This is precisely the sequence ADR-0008 rule 3 forbids: failed read → empty state →
  next write destroys the original. In novelWriter it is harmless, because the file is a cache of
  a list of paths and losing it costs the user a menu. It is worth recording because it shows the
  pattern is easy to write by accident even in a careful codebase, and because it makes the
  question sharp for #5: whether whatever lives above a bundle is *cache* (losable, so this
  pattern is fine) or *record* (not losable, so rule 3 applies to it).
- **[V]** For contrast, the same class writes atomically — `json.dump` to a `.tmp` sibling, then
  `cacheTemp.replace(cacheFile)` — which is ADR-0008 rule 5. — same source.

---

## 6. Checking the options against the binding constraints

The ticket asks for options that fail the constraints to be marked as failing. These are the
failures.

### 6.1 Fails ADR-0009 and ADR-0012 outright — anything opaque inside a bundle

- **An embedded database.** Zotero's `zotero.sqlite` is the model, and it fails twice: binary,
  so ADR-0009; and opaque, so ADR-0012's "no database files". **[V]** for what Zotero stores,
  **[I]** for the verdict.
- **Compressed or zipped state.** Scrivener's `binder.autosave` and `binder.backup` are "zipped
  copy of `.scrivx`" **[S]**. ADR-0012 names compression explicitly.
- **An index in a binary format.** Whether a search index may live inside a bundle is a real
  question (Scrivener puts its `search.indexes` inside, everyone else outside) but its *format*
  is not: inside a bundle it must be text, and inside a bundle it is copied on every **Lock**
  (ADR-0002, ADR-0009's forcing argument about locks staying cheap). **[I]**

### 6.2 Fails ADR-0012, and ADR-0009 if stored in a bundle — macOS bookmark data

- Apple defines a bookmark as "an opaque data structure, enclosed in an `NSData` object"
  **[V]**. Opaque and binary. It is also macOS-only, so it cannot be the identity mechanism on
  a three-platform application even where it is permitted. **[I]**
- The alternative Apple documents — file reference URLs — is text (`file:///.file/id=…`) and so
  passes the format constraints, but Apple states it is "not safe to store and reuse between
  launches" **[V]**. A text representation of an unstable identifier is still an unstable
  identifier.

### 6.3 Fails nothing, but does not survive the ticket's events — path-derived identity

Obsidian's per-path vault id, Logseq's encoded-path directory and VS Code's md5 all satisfy
every ADR: plain text or plain directory names, fully local, nothing binary. **[I]** They fail
the *question* rather than the constraints — none survives a rename or a move, and VS Code's is
deliberately engineered not to survive a restore from backup. Logseq's is the only one a person
can read and understand after the fact, which is a real property under ADR-0003's "diagnose and
rescue your own data" reasoning (ADR-0012's closing argument).

### 6.4 The unsettled question: does ADR-0009 bind outside a bundle?

**[I]** ADR-0009 says "everything in a project bundle is text" and its forcing argument is about
**Lock** copying the sidecar. ADR-0012 says the sidecar is readable. Neither ADR mentions a store
that lives outside every bundle, and the difference matters concretely:

- If the constraints bind everywhere, then whatever lives above a bundle is plain text too —
  ruling out SQLite for a cross-project search index and putting Write-ist's answer closer to
  novelWriter's JSON files than to VS Code's storage database.
- If they bind only inside a bundle, the constraints that remain are ADR-0003's (local, no
  network) and ADR-0008 rule 3's (a failed load never authorises a write), and the format is
  free — because the ADR-0009 argument, that locks copy the sidecar, does not reach a file that
  is never copied by a lock.

**[I]** The evidence that bears on it: ADR-0012's stated reason for readability is not
aesthetics but diagnosis — "it is what lets a person diagnose and rescue their own data when the
app is wrong about it" — and §1.5 and §5.2 are exactly a case of the app being wrong about it in
a way no person can diagnose, because the state is named by an md5 of a vanished path.

### 6.5 What ADR-0008 rule 3 implies for a store above bundles

**[I]** Rule 3 is about a failed read initialising empty state that the next write destroys. The
mechanism in §5.5 shows how easily that shape reappears in a registry. Two readings are
available and #5 has to pick one:

- The store is a **cache**: derived from reality, regenerable by rescanning, so an empty read is
  recoverable and rule 3 does not bite. Apple's Caches guidance is the analogue — the contents
  "must be able to be re-created" **[V]**. Anything that cannot be regenerated by rescanning
  (usage history, per-project preferences) then cannot live there.
- The store is a **record**: it holds facts that exist nowhere else, so rule 3 applies in full —
  refuse to write, keep a copy, surface it.

No tool surveyed treats its cross-project store as a record. novelWriter names the methods
`loadCache`/`saveCache` **[V]**; VS Code puts it under `workspaceStorage` and never validates it
**[V]**; git has no such store at all **[V]**.

### 6.6 Constraints nothing in this survey violates

- **ADR-0003 (no network).** Every mechanism in §2 is local. Nothing here requires an account or
  a server. Syncthing is a sync tool, but the `.stfolder` marker is a purely local device.
- **ADR-0008 rule 1 (anchors on both sides).** **[I]** Read across the bundle boundary, rule 1
  says an identifier held only by the registry is not an anchor to a project — which is a
  precise description of Obsidian's vault id, Logseq's directory name and VS Code's md5. It is
  equally a description of what novelWriter fixed by putting the uuid inside `nwProject.nwx`:
  the id then exists on both sides, and the registry becomes repairable from the folder rather
  than authoritative over it.

---

## Verified vs inferred

**Verified in primary sources or inspected code:**
- That `.git` contains no repository identifier, and that git identifies content by a hash of
  that content.
- git's reciprocal worktree pointers, `prune` with `gc.worktreePruneExpire`, and `repair`.
- git's config file precedence and the `includeIf gitdir:` condition.
- novelWriter's marker-file open test, its project UUID4 and lazy minting, its path-keyed
  `recentProjects.json` carrying the uuid, the uuid-driven removal of a stale entry, its
  plain-text `nwProject.lock` format, its fail-closed lock read, its lock-after-successful-open
  ordering, its atomic temp-then-replace save, and its load-failure-empties-state sequence.
- VS Code's two identifier functions, the ctime/inode salt and its stated rationale, the
  per-platform salt selection, the storage cleaner's exemption of folder-keyed storage, the
  500-entry cap on recents, and the existence checks applied only when building OS-level
  recent lists.
- Logseq's `~/logseq/graphs/<encoded path>` layout, the encoding function, the graph prefixes,
  and the legacy decoder.
- Obsidian's `.obsidian`-inside / config-outside split, its per-OS config paths, that a vault ID
  is "the random 16-character code assigned to the vault" and "unique per folder on your
  computer", and that removing a vault only removes it from the list.
- Syncthing's `.stfolder` health check and its stop-syncing behaviour when the marker is gone.
- Zotero's data directory locations, `zotero.sqlite`, and the `storage/<8-char key>` layout.
- Every XDG, Apple and Microsoft quotation, including `XDG_STATE_HOME`'s definition, Apple's
  bookmark and file-reference-URL statements, Apple's Caches constraint, Microsoft's "File IDs
  are not guaranteed to be unique over time", and the Roaming/Local known-folder paths.
- The Linux `inode(7)` statement on per-filesystem uniqueness.
- Tauri v2's per-OS path mapping and the absence of any state-directory function.

**Secondary (third parties, forum users, or search summaries):**
- The `obsidian.json` schema (`vaults` keyed by 16-hex id, each with `path`, `ts`, `open`).
- Scrivener's project-level `Identifier` UUID, and the authoritative/derived split inside a
  `.scriv` package — both from the same third-party reference the first pass used.

**Inferred, my reasoning:**
- Every cell of the matrix in §2, and the three conclusions drawn from it — that no mechanism
  handles duplication, that restore-from-backup is what filesystem identifiers cannot survive,
  and that "is this a project" and "which project" are separate jobs.
- That VS Code's identifier fails all four events and that three of those failures are intended.
- That a path-derived key is self-describing (Logseq) or not (VS Code), and that this is what
  determines whether an orphan can be diagnosed.
- That novelWriter's uuid repair would mis-handle a duplicated folder.
- The Windows roaming-versus-local argument in §4.1.
- Every verdict in §6, and the framing of §6.4 and §6.5 as unsettled rather than answered.

## Open questions I could not settle

1. **Whether ADR-0009 and ADR-0012 bind a store outside every bundle.** §6.4. This is not an
   evidence question — it is a scope question for the ADRs, and #5 cannot be evaluated against
   the constraints until it is answered.
2. **What Obsidian does when a registered vault path no longer exists** — whether the entry is
   pruned, hidden, or shown and allowed to fail. I could not find this documented and had no
   installation to inspect; the forum results I found were about data loss during manual moves,
   not about the registry's behaviour.
3. **Whether Scrivener's `Identifier` is used for anything**, and whether Scrivener's
   recent-projects list reconciles against it the way novelWriter's does. The `.scrivx` schema
   remains unpublished (first pass, open question 2).
4. **Whether a macOS bookmark survives a restore from backup.** Apple documents move and rename;
   it says nothing about a file recreated by a restore, and the `.file/id=` fallback would
   already have changed.
5. **What Logseq does with an orphaned `~/logseq/graphs/` directory** when a graph is re-added
   from a new path — reuse, orphan, or migrate. I read the naming code but not the graph
   add/remove path.
6. **Whether any surveyed tool detects a duplicated project folder at all.** I found the
   mechanisms that *could* detect it (§2) but no code that acts on the detection, and no tool
   that asks the user "is this a copy or a move?".
7. **The 500-entry cap's effect on VS Code's storage**, i.e. whether an entry falling off the
   recents list leaves its `workspaceStorage` directory behind. §1.5 says folder-keyed storage
   is never cleaned, which suggests yes, but I did not trace the two together.
