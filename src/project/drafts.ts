/**
 * Drafts: the open drafts a project is written in, the locked drafts behind
 * them, and the index that dates them (ADR-0002, ADR-0014, ADR-0025, all three
 * amended 2026-11-26).
 *
 * ## On disk
 *
 * ```
 * manuscript.fountain       the open draft on the trunk — every project has it
 * manuscript 2a.fountain    an open draft on a branch, one a branch, named for it
 * drafts/1.fountain         a locked draft, under its own name, never written again
 * drafts/1.1.fountain
 * drafts.md                 which open draft the writer is in; each lock's date and note
 * ```
 *
 * **Everything that says which draft is which is a file name**, so losing
 * `drafts.md` costs lock dates, notes and which open draft was in front, and
 * never the drafts or their order (ADR-0014). A project made before drafts has
 * `manuscript.fountain` alone: one open draft on the trunk, which locks as 1.
 *
 * ## Names
 *
 * A name is read from the right. `.R` is a revision; a plain number is the
 * trunk; otherwise the name ends in a branch — a locked draft's name and one
 * letter, `2a`, `2b`, `2aa` (a departure from 2a) — optionally followed by
 * `-K`, the branch's K-th new draft. So the trunk runs 1, 2, 3; a branch from 2
 * runs 2a, 2a-2, 2a-3; and each of those has revisions, 2a.1, 2a-2.1. The
 * hyphen is what keeps the branch's second draft, `2a-2`, apart from a second
 * departure from 2, which is `2b`.
 *
 * ## Writing
 *
 * Every file here lands whole or not at all (ADR-0008 rule 5), a locked draft
 * is never written over, and `drafts.md` is never written when it would not
 * read (ADR-0008 rule 3). Each operation reads the folder afresh rather than
 * trusting what a dialog was opened with.
 */
import { decodeFile } from "../decode.ts";
import { message } from "../message.ts";
import { MANUSCRIPT_FILE, type Project } from "./bundle.ts";
import { join, type Filesystem } from "./filesystem.ts";

/** The folder locked drafts are kept in, each under its own name. */
export const DRAFTS_FOLDER = "drafts";

/** The draft index: which open draft is in front, and each lock's date and note. */
export const DRAFTS_INDEX = "drafts.md";

/** The longest a lock's note may be, in characters: a line, not a letter. Longer is cut, quietly. */
export const NOTE_MAX = 120;

/** The surface's extension, which every draft file shares with the manuscript (`.md` on the prose surface). */
const EXTENSION = MANUSCRIPT_FILE.slice(MANUSCRIPT_FILE.lastIndexOf("."));
const STEM = MANUSCRIPT_FILE.slice(0, MANUSCRIPT_FILE.lastIndexOf("."));

const BRANCH_LETTERS = "abcdefghijklmnopqrstuvwxyz";

// --- Names -------------------------------------------------------------------------

/** A draft's name, read. */
export interface DraftName {
  /** The branch it is on: `""` for the trunk, else the branch's first name (`2a`). */
  readonly line: string;
  /** Which new draft on that line: the trunk's number, or K in `2a-K` (1 for `2a` itself). */
  readonly number: number;
  /** Its revision, or 0 for none. */
  readonly revision: number;
}

/** A name read, or `undefined` when it is not one. */
export function parseDraftName(text: string): DraftName | undefined {
  let rest = text;
  let revision = 0;
  const revised = /\.([1-9]\d*)$/.exec(rest);
  if (revised !== null) {
    revision = Number(revised[1]);
    rest = rest.slice(0, revised.index);
  }
  if (/^[1-9]\d*$/.test(rest)) return { line: "", number: Number(rest), revision };
  let number = 1;
  const later = /-([2-9]|[1-9]\d+)$/.exec(rest);
  if (later !== null) {
    number = Number(later[1]);
    rest = rest.slice(0, later.index);
  }
  if (!/[a-z]$/.test(rest) || parseDraftName(rest.slice(0, -1)) === undefined) return undefined;
  return { line: rest, number, revision };
}

/** The name, written. */
export function draftNameText({ line, number, revision }: DraftName): string {
  const draft = line === "" ? String(number) : number === 1 ? line : `${line}-${number}`;
  return revision === 0 ? draft : `${draft}.${revision}`;
}

/** The locked draft a branch departs from: `2` for `2a`. */
export function departsFrom(line: string): string {
  return line.slice(0, -1);
}

/** Whether a name is a branch's own, `2a`: what an open draft on a branch is named for. */
function isBranch(line: string): boolean {
  const read = parseDraftName(line);
  return read !== undefined && read.line === line && line !== "";
}

// --- Files -------------------------------------------------------------------------

/** An open draft: written in, and not yet locked. */
export interface OpenDraft {
  /** Its branch, `""` for the trunk. */
  readonly line: string;
  /** Its file, in the project's folder: `manuscript.fountain`, `manuscript 2a.fountain`. */
  readonly file: string;
}

/** The file an open draft on this branch is kept in. */
export function openDraftFile(line: string): string {
  return line === "" ? MANUSCRIPT_FILE : `${STEM} ${line}${EXTENSION}`;
}

/** The branch an open draft's file is for, or `undefined` when the file is not one. */
export function lineOfOpenDraft(file: string): string | undefined {
  if (file === MANUSCRIPT_FILE) return "";
  if (!file.startsWith(`${STEM} `) || !file.endsWith(EXTENSION)) return undefined;
  const line = file.slice(STEM.length + 1, -EXTENSION.length);
  return isBranch(line) ? line : undefined;
}

/** Where a locked draft is kept, in the project's folder: `drafts/1.1.fountain`. */
export function lockedDraftFile(name: string): string {
  return `${DRAFTS_FOLDER}/${name}${EXTENSION}`;
}

/** The trunk's open draft: `manuscript.fountain`. */
export const TRUNK: OpenDraft = { line: "", file: MANUSCRIPT_FILE };

// --- The index ---------------------------------------------------------------------

/** What `drafts.md` says about one locked draft. */
export interface DraftRecord {
  /** The day it was locked, `YYYY-MM-DD`, in the writer's own time. */
  readonly locked?: string;
  /** The writer's note, one line. */
  readonly note?: string;
}

/** `drafts.md`, read. */
export interface DraftIndex {
  /** The open draft's file the writer was last in. */
  readonly writingIn: string | undefined;
  readonly records: ReadonlyMap<string, DraftRecord>;
  /** Sections that name no draft, kept as they were found and written back after the rest. */
  readonly others: readonly string[];
}

const HEADING = "# Drafts";
const EMPTY_INDEX: DraftIndex = { writingIn: undefined, records: new Map(), others: [] };

/** Read `drafts.md`. Throws, in words, for a file that is not one. */
export function parseDraftIndex(text: string): DraftIndex {
  const lines = text.split(/\r\n?|\n/);
  const first = lines.findIndex((line) => line.trim() !== "");
  if (first < 0 || lines[first]!.trim() !== HEADING) throw new Error(`it does not begin with “${HEADING}”.`);

  let writingIn: string | undefined;
  const records = new Map<string, DraftRecord>();
  const others: string[] = [];
  // The section being read: a draft's, or one kept as found.
  let draft: { name: string; locked?: string; note: string[] } | undefined;
  let other: string[] | undefined;

  const finish = (): void => {
    if (draft !== undefined) {
      const note = cleanNote(draft.note.join(" "));
      records.set(draft.name, { ...(draft.locked === undefined ? {} : { locked: draft.locked }), ...(note === "" ? {} : { note }) });
    }
    if (other !== undefined) others.push(other.join("\n").trimEnd());
    draft = undefined;
    other = undefined;
  };

  for (const line of lines.slice(first + 1)) {
    const heading = /^##[ \t]+(.*?)[ \t]*$/.exec(line);
    if (heading !== null) {
      finish();
      if (parseDraftName(heading[1]!) !== undefined) draft = { name: heading[1]!, note: [] };
      else other = [line];
      continue;
    }
    if (other !== undefined) {
      other.push(line);
      continue;
    }
    if (draft === undefined) {
      const labelled = /^Writing in:[ \t]*(.*?)[ \t]*$/.exec(line);
      if (labelled !== null) writingIn = labelled[1]!;
      continue;
    }
    const locked = /^Locked:[ \t]*(\d{4}-\d{2}-\d{2})[ \t]*$/.exec(line);
    if (locked !== null && draft.note.length === 0) draft.locked = locked[1]!;
    else if (line.trim() !== "") draft.note.push(line.trim());
  }
  finish();
  return { writingIn, records, others };
}

/** `drafts.md`, written: a heading, the open draft the writer is in, and a section for each lock. */
export function serialiseDraftIndex(index: DraftIndex): string {
  const out = [HEADING, ""];
  if (index.writingIn !== undefined) out.push(`Writing in: ${index.writingIn}`, "");
  for (const name of [...index.records.keys()].sort(byName)) {
    const { locked, note } = index.records.get(name)!;
    out.push(`## ${name}`, "");
    if (locked !== undefined) out.push(`Locked: ${locked}`, "");
    if (note !== undefined && note !== "") out.push(note, "");
  }
  for (const other of index.others) out.push(other, "");
  return out.join("\n");
}

/**
 * A note as it is kept: one line, without a heading's `#` in front, and at most
 * `NOTE_MAX` characters. Put right quietly, never refused.
 */
export function cleanNote(typed: string): string {
  const line = typed.replace(/\s+/g, " ").trim().replace(/^#+\s*/, "");
  return [...line].slice(0, NOTE_MAX).join("").trim();
}

// --- Reading ---------------------------------------------------------------------

/** A locked draft: its name, and what the index says of it. */
export interface LockedDraft {
  readonly name: string;
  readonly parsed: DraftName;
  readonly locked: string | undefined;
  readonly note: string | undefined;
}

/** Every draft a project has. */
export interface Drafts {
  /** Locked, in name order. */
  readonly locked: readonly LockedDraft[];
  /** Open, the trunk's first. */
  readonly open: readonly OpenDraft[];
  /** The open draft the writer is in. */
  readonly active: OpenDraft;
  /**
   * `drafts.md`, or `undefined` when it is there and would not read — then it
   * is never written, so nothing can be locked or branched, and why is here.
   */
  readonly index: DraftIndex | undefined;
  readonly trouble?: string;
}

/** Why something could not be done to the drafts, in the writer's words. Nothing was changed. */
export class CannotChangeDrafts extends Error {}

/**
 * Read a project's drafts from its folder. Never rejects for `drafts.md`: one
 * that is missing is an empty index, and one that will not read is said in
 * `trouble` and left alone. Rejects only when the folder cannot be listed.
 */
export async function readDrafts(filesystem: Filesystem, project: Project): Promise<Drafts> {
  const [root, folder] = await Promise.all([
    filesystem.readDirectory(project.path),
    // An absent folder reads as empty: a project that has never locked.
    filesystem.readDirectory(join(project.path, DRAFTS_FOLDER)),
  ]);
  const branches = root
    .filter((entry) => !entry.isDirectory)
    .map((entry) => lineOfOpenDraft(entry.name))
    .filter((line): line is string => line !== undefined && line !== "")
    .sort(byName);
  // The trunk's is always there: it is the manuscript every project has.
  const open: OpenDraft[] = [TRUNK, ...branches.map((line) => ({ line, file: openDraftFile(line) }))];

  let index: DraftIndex | undefined = EMPTY_INDEX;
  let trouble: string | undefined;
  const indexPath = join(project.path, DRAFTS_INDEX);
  if (await filesystem.exists(indexPath)) {
    try {
      index = parseDraftIndex(decodeFile(await filesystem.readFile(indexPath)).text);
    } catch (error) {
      index = undefined;
      trouble = `Write-ist could not read this project's ${DRAFTS_INDEX}, so it will not change it. ${message(error)}`;
    }
  }

  const locked = folder
    .filter((entry) => !entry.isDirectory && entry.name.endsWith(EXTENSION))
    .map((entry) => entry.name.slice(0, -EXTENSION.length))
    .map((name) => ({ name, parsed: parseDraftName(name) }))
    .filter((each): each is { name: string; parsed: DraftName } => each.parsed !== undefined)
    .sort((a, b) => byName(a.name, b.name))
    .map(({ name, parsed }): LockedDraft => {
      const record = index?.records.get(name);
      return { name, parsed, locked: record?.locked, note: record?.note };
    });

  const active = open.find((each) => each.file === index?.writingIn) ?? TRUNK;
  return { locked, open, active, index, ...(trouble === undefined ? {} : { trouble }) };
}

// --- What a lock would be called -----------------------------------------------------

/**
 * What locking an open draft would call it. The first lock on a line has one
 * name — 1 on the trunk, the branch's own (2a) on a branch — and the writer is
 * not asked to choose. After that, a revision continues the latest draft on
 * the line (1.1 after 1, 1.2 after 1.1) and a new draft is the next number on
 * the line (2 after 1.1; 2a-2 after 2a.1).
 */
export type LockNames =
  | { readonly kind: "first"; readonly name: string }
  | { readonly kind: "choose"; readonly revision: string; readonly newDraft: string };

export function lockNames(drafts: Drafts, open: OpenDraft): LockNames {
  const onLine = drafts.locked.filter((draft) => draft.parsed.line === open.line).map((draft) => draft.parsed);
  if (onLine.length === 0) return { kind: "first", name: open.line === "" ? "1" : open.line };
  const latest = Math.max(...onLine.map((name) => name.number));
  const revisions = onLine.filter((name) => name.number === latest).map((name) => name.revision);
  return {
    kind: "choose",
    revision: draftNameText({ line: open.line, number: latest, revision: Math.max(...revisions) + 1 }),
    newDraft: draftNameText({ line: open.line, number: latest + 1, revision: 0 }),
  };
}

/** The latest locked draft on an open draft's line — what it continues — or `undefined` before its first lock. */
export function continues(drafts: Drafts, open: OpenDraft): LockedDraft | undefined {
  const onLine = drafts.locked.filter((draft) => draft.parsed.line === open.line);
  return onLine.reduce<LockedDraft | undefined>((latest, draft) => {
    if (latest === undefined) return draft;
    const [a, b] = [draft.parsed, latest.parsed];
    return a.number > b.number || (a.number === b.number && a.revision > b.revision) ? draft : latest;
  }, undefined);
}

/**
 * The name the next branch from a locked draft takes: its name and the first
 * letter no branch from it has, locked or open — 2a, then 2b. `undefined`
 * after z: twenty-six departures from one draft are enough.
 */
export function nextBranch(drafts: Drafts, from: string): string | undefined {
  const taken = new Set([
    ...drafts.locked.map((draft) => draft.parsed.line),
    ...drafts.open.map((open) => open.line),
  ]);
  for (const letter of BRANCH_LETTERS) {
    if (!taken.has(`${from}${letter}`)) return `${from}${letter}`;
  }
  return undefined;
}

// --- Changing them -------------------------------------------------------------------

/** What the writer asked a lock to do. */
export interface LockRequest {
  /** The open draft being locked. */
  readonly open: OpenDraft;
  /** The name to lock it as: one of `lockNames`. */
  readonly name: string;
  /** The open draft's bytes as they are now — comments and all, since a locked draft keeps its comments (ADR-0018). */
  readonly bytes: Uint8Array;
  /** The writer's note; cleaned (`cleanNote`), and left out when empty. */
  readonly note: string;
  /** The day, `YYYY-MM-DD` (`localDay`). */
  readonly today: string;
}

/**
 * Lock: copy the open draft **backward** into `drafts/<name>`, never to be
 * written again, and date it in the index (ADR-0014). The open draft is not
 * touched: the writer goes on in it.
 *
 * Whole or not at all. The locked file is written first, landing whole or not
 * at all, and then the index; if the index cannot be written the locked file
 * is taken away again, so a failed lock leaves the project as it was. Answers
 * the drafts as they are now.
 */
export async function lockDraft(filesystem: Filesystem, project: Project, request: LockRequest): Promise<Drafts> {
  const drafts = await readDrafts(filesystem, project);
  const index = writable(drafts);
  const names = lockNames(drafts, request.open);
  const allowed = names.kind === "first" ? [names.name] : [names.revision, names.newDraft];
  if (!allowed.includes(request.name)) {
    throw new CannotChangeDrafts(`Draft ${request.name} is not the next name for this draft, so nothing was locked.`);
  }
  const path = join(project.path, lockedDraftFile(request.name));
  // Never over a locked draft: that is what makes locking trustworthy (ADR-0002).
  if (await filesystem.exists(path)) {
    throw new CannotChangeDrafts(`There is already a Draft ${request.name} in this project, so nothing was locked.`);
  }
  await filesystem.createDirectory(join(project.path, DRAFTS_FOLDER));
  await filesystem.writeFile(path, request.bytes);

  const note = cleanNote(request.note);
  const records = new Map(index.records);
  records.set(request.name, { locked: request.today, ...(note === "" ? {} : { note }) });
  const updated: DraftIndex = { ...index, writingIn: request.open.file, records };
  try {
    await writeIndex(filesystem, project, updated);
  } catch (error) {
    // Taken back, so there is no lock half made. If even that fails, what is
    // left is a locked draft without its date, which is still a locked draft.
    await filesystem.removeWorkspaceFile(path, DRAFTS_FOLDER).catch(() => {});
    throw error;
  }
  const locked: LockedDraft = { name: request.name, parsed: parseDraftName(request.name)!, locked: request.today, note: note === "" ? undefined : note };
  return {
    ...drafts,
    locked: [...drafts.locked, locked].sort((a, b) => byName(a.name, b.name)),
    active: request.open,
    index: updated,
  };
}

/**
 * Branch from a locked draft: a new open draft on a branch of its own (2a),
 * starting as a copy of it, and the one the writer is in from now on. Every
 * other open draft stays as it is, unlocked. Answers the new open draft.
 */
export async function branchFrom(filesystem: Filesystem, project: Project, from: string): Promise<OpenDraft> {
  const drafts = await readDrafts(filesystem, project);
  const index = writable(drafts);
  if (!drafts.locked.some((draft) => draft.name === from)) {
    throw new CannotChangeDrafts(`There is no locked Draft ${from} to branch from.`);
  }
  const line = nextBranch(drafts, from);
  if (line === undefined) throw new CannotChangeDrafts(`Draft ${from} has as many branches as it can have.`);
  const open: OpenDraft = { line, file: openDraftFile(line) };
  const path = join(project.path, open.file);
  if (await filesystem.exists(path)) {
    throw new CannotChangeDrafts(`There is already a file called “${open.file}” in this project, so no branch was made.`);
  }
  const bytes = await filesystem.readFile(join(project.path, lockedDraftFile(from)));
  await filesystem.writeFile(path, bytes);
  // If this fails the branch is still there, in the tree, and the project opens
  // in the draft it opened in before.
  await writeIndex(filesystem, project, { ...index, writingIn: open.file });
  return open;
}

/** The writer moves to another open draft: the one the project opens in from now on. */
export async function chooseOpenDraft(filesystem: Filesystem, project: Project, open: OpenDraft): Promise<void> {
  const drafts = await readDrafts(filesystem, project);
  const index = writable(drafts);
  if (!drafts.open.some((each) => each.file === open.file)) {
    throw new CannotChangeDrafts(`“${open.file}” is no longer in this project.`);
  }
  if (index.writingIn === open.file || (index.writingIn === undefined && open.file === TRUNK.file)) return;
  await writeIndex(filesystem, project, { ...index, writingIn: open.file });
}

/** The index, if it may be written. */
function writable(drafts: Drafts): DraftIndex {
  if (drafts.index === undefined) {
    throw new CannotChangeDrafts(`${drafts.trouble ?? `Write-ist could not read ${DRAFTS_INDEX}.`} Nothing was changed.`);
  }
  return drafts.index;
}

async function writeIndex(filesystem: Filesystem, project: Project, index: DraftIndex): Promise<void> {
  await filesystem.writeFile(join(project.path, DRAFTS_INDEX), new TextEncoder().encode(serialiseDraftIndex(index)));
}

/** Today in the writer's own time, `YYYY-MM-DD`: a lock's date. */
export function localDay(moment: Date): string {
  const two = (value: number): string => String(value).padStart(2, "0");
  return `${moment.getFullYear()}-${two(moment.getMonth() + 1)}-${two(moment.getDate())}`;
}

/** Names in the order a person counts them: 2 before 10, 1.2 before 1.10. */
function byName(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true });
}

// --- The tree ----------------------------------------------------------------------

/** One row of the Draft Tree, top to bottom. */
export type TreeRow =
  | {
      readonly kind: "locked";
      readonly draft: LockedDraft;
      /** How far in it is drawn: a branch one step in from where it departs, a revision a step in from its draft. */
      readonly depth: number;
      readonly revision: boolean;
    }
  | {
      readonly kind: "open";
      readonly open: OpenDraft;
      readonly depth: number;
      /** What it continues, or `undefined` before its first lock. */
      readonly after: LockedDraft | undefined;
      /** What its first lock will be called, before it has one. */
      readonly first: string;
    };

/**
 * The Draft Tree's rows. The trunk runs down the left: each draft, its
 * revisions a step in beneath it, and the trunk's open draft at the foot. A
 * branch is drawn under the draft it departs from, a step further in, with its
 * own drafts, revisions and open draft. A branch whose draft is not there is
 * drawn at the foot, so nothing is ever left out.
 */
export function draftTree(drafts: Drafts): readonly TreeRow[] {
  const rows: TreeRow[] = [];
  const lines = new Set<string>([...drafts.locked.map((draft) => draft.parsed.line), ...drafts.open.map((open) => open.line)]);
  const drawn = new Set<string>();
  const branchesFrom = (name: string): string[] => [...lines].filter((line) => line !== "" && departsFrom(line) === name).sort(byName);

  const drawLine = (line: string, depth: number): void => {
    if (drawn.has(line)) return;
    drawn.add(line);
    const onLine = drafts.locked.filter((draft) => draft.parsed.line === line);
    const numbers = [...new Set(onLine.map((draft) => draft.parsed.number))].sort((a, b) => a - b);
    for (const number of numbers) {
      const ofNumber = onLine.filter((draft) => draft.parsed.number === number).sort((a, b) => a.parsed.revision - b.parsed.revision);
      for (const draft of ofNumber) {
        const revision = draft.parsed.revision !== 0;
        rows.push({ kind: "locked", draft, depth: revision ? depth + 1 : depth, revision });
        for (const branch of branchesFrom(draft.name)) drawLine(branch, revision ? depth + 2 : depth + 1);
      }
    }
    const open = drafts.open.find((each) => each.line === line);
    if (open !== undefined) {
      rows.push({ kind: "open", open, depth, after: continues(drafts, open), first: line === "" ? "1" : line });
    }
  };

  drawLine("", 0);
  for (const line of [...lines].sort(byName)) drawLine(line, 0);
  return rows;
}
