/**
 * Where the writer was in each workspace of each project — Notes' open tabs
 * and each note's caret and scroll, Plan's scroll — so leaving a project and
 * coming back puts them there.
 *
 * The manuscript's caret has its own file (`places.ts`), shaped round a place
 * in a screenplay. This is the same idea for every other workspace, with
 * nothing in it about what a workspace holds: a place is a few named values —
 * whole numbers, or short texts such as a tab's name — and what they mean is
 * the workspace's business. A workspace may keep one place of its own and one
 * for each **item** in it (each note, by name).
 *
 * **Not the writer's work, and not in the bundle** — the application's memory
 * of a session, in `appLocalDataDir()` beside the ledger and `places.txt`
 * (ADR-0016), keyed by the project's id (ADR-0015) and the workspace's id, so
 * a renamed project keeps its places. Never `localStorage` (ADR-0009).
 *
 * ## Format
 *
 * One line per place, tab-separated, in plain sight:
 *
 *   <projectId>\t<workspaceId>[\t"<item>"]\t<name>=<value>\t…
 *
 * - `<workspaceId>` and every `<name>` are lowercase letters, digits and
 *   hyphens, starting with a letter.
 * - A `<value>` is a whole number (`scroll=340`) or a text in double quotes
 *   (`active="Ideas"`).
 * - `"<item>"`, when there, says which item of the workspace the place is
 *   for; without it, the place is the workspace's own.
 * - Inside quotes, `%` `"` and every control character (a tab, a line break)
 *   are written as `%` and two hex digits — `%25`, `%22`, `%09` — so a line is
 *   always one line and a field is always one field. Nothing else is escaped:
 *   a note called `Ferry, at night` is written just so.
 *
 * For example:
 *
 *   id-paper-boats\tnotes\ttab-1="Ideas"\ttab-2="Ferry, at night"\tactive="Ideas"
 *   id-paper-boats\tnotes\t"Ideas"\tanchor=14\thead=14\tscroll=340
 *   id-paper-boats\tplan\tacross=120
 *
 * Lines written before texts and items existed — numbers only, no item — are
 * this format already, and read as they always did.
 *
 * Written whole, through the port's temp-flush-rename (ADR-0008 rule 5). **A
 * file that will not read is never written over** (ADR-0008 rule 3): the
 * workspace opens at the top and the file is left for whoever looks at it.
 * Losing a place costs the writer a scroll, never a word.
 */
import type { Filesystem } from "./filesystem.ts";
import { join } from "./filesystem.ts";

/** The file's name inside `appLocalDataDir()`. */
export const WORKSPACE_PLACES_FILE = "workspace-places.txt";

/** A place: named whole numbers and texts, as the workspace that keeps it names them. */
export type WorkspacePlace = Readonly<Record<string, number | string>>;

export interface WorkspacePlaces {
  /**
   * The place a workspace was left at in a project — or one item in it, by
   * name — or `undefined` when there is none or it cannot be read.
   */
  recall(projectId: string, workspaceId: string, item?: string): Promise<WorkspacePlace | undefined>;
  /** Remember it. Rejects, writing nothing, when the file there will not read. */
  remember(projectId: string, workspaceId: string, place: WorkspacePlace, item?: string): Promise<void>;
  /** Forget an item's place (a note deleted), or move it to a new name (a note renamed). */
  forget(projectId: string, workspaceId: string, item: string, movedTo?: string): Promise<void>;
}

const KEY = /^[a-z][a-z0-9-]*$/;
const COUNT = /^\d+$/;
const QUOTED = /^"((?:[^"%\u0000-\u001f\u007f]|%[0-9A-F]{2})*)"$/;

const keyOf = (projectId: string, workspaceId: string, item?: string): string =>
  item === undefined ? `${projectId}\t${workspaceId}` : `${projectId}\t${workspaceId}\t"${escapeText(item)}"`;

/** A text as it is written inside quotes. */
export function escapeText(text: string): string {
  return text.replace(/[%"\u0000-\u001f\u007f]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  );
}

/** A text inside quotes as it was before `escapeText`, or `undefined` when it is not one. */
function unquote(field: string): string | undefined {
  const found = QUOTED.exec(field);
  if (found === null) return undefined;
  return found[1]!.replace(/%([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

export function openWorkspacePlaces(filesystem: Filesystem, directory: string): WorkspacePlaces {
  const path = join(directory, WORKSPACE_PLACES_FILE);
  // One write at a time, so two quick ones cannot each read before the other writes.
  let queue: Promise<unknown> = Promise.resolve();

  async function read(): Promise<Map<string, WorkspacePlace>> {
    if (!(await filesystem.exists(path))) return new Map();
    const text = new TextDecoder("utf-8", { fatal: true }).decode(await filesystem.readFile(path));
    const places = parseWorkspacePlaces(text);
    if (places === undefined) throw new Error(`${WORKSPACE_PLACES_FILE} is not a list of places Write-ist can read.`);
    return places;
  }

  const change = (edit: (places: Map<string, WorkspacePlace>) => void): Promise<void> => {
    const write = queue.then(async () => {
      const places = await read();
      edit(places);
      await filesystem.createDirectory(directory);
      await filesystem.writeFile(path, new TextEncoder().encode(serialiseWorkspacePlaces(places)));
    });
    queue = write.catch(() => {});
    return write;
  };

  return {
    async recall(projectId, workspaceId, item) {
      try {
        return (await read()).get(keyOf(projectId, workspaceId, item));
      } catch {
        return undefined;
      }
    },
    remember(projectId, workspaceId, place, item) {
      return change((places) => places.set(keyOf(projectId, workspaceId, item), place));
    },
    forget(projectId, workspaceId, item, movedTo) {
      return change((places) => {
        const key = keyOf(projectId, workspaceId, item);
        const place = places.get(key);
        places.delete(key);
        if (place !== undefined && movedTo !== undefined) places.set(keyOf(projectId, workspaceId, movedTo), place);
      });
    },
  };
}

/** The places a file holds, keyed by project, workspace and item, or `undefined` when any line is not one. */
export function parseWorkspacePlaces(text: string): Map<string, WorkspacePlace> | undefined {
  const places = new Map<string, WorkspacePlace>();
  for (const line of text.split("\n")) {
    if (line === "") continue;
    const [projectId, workspaceId, ...rest] = line.split("\t");
    if (projectId === undefined || projectId === "" || workspaceId === undefined || !KEY.test(workspaceId)) return undefined;
    let fields = rest;
    let item: string | undefined;
    if (rest[0]?.startsWith('"')) {
      item = unquote(rest[0]);
      if (item === undefined) return undefined;
      fields = rest.slice(1);
    }
    const place: Record<string, number | string> = {};
    for (const field of fields) {
      const equals = field.indexOf("=");
      if (equals < 0) return undefined;
      const name = field.slice(0, equals);
      const value = field.slice(equals + 1);
      if (!KEY.test(name)) return undefined;
      if (COUNT.test(value)) place[name] = Number(value);
      else {
        const quoted = unquote(value);
        if (quoted === undefined) return undefined;
        place[name] = quoted;
      }
    }
    places.set(keyOf(projectId, workspaceId, item), place);
  }
  return places;
}

export function serialiseWorkspacePlaces(places: ReadonlyMap<string, WorkspacePlace>): string {
  return [...places]
    .map(([key, place]) => {
      const fields = Object.entries(place)
        .filter(([name, value]) =>
          KEY.test(name) && (typeof value === "string" || (Number.isSafeInteger(value) && value >= 0)),
        )
        .map(([name, value]) => `\t${name}=${typeof value === "string" ? `"${escapeText(value)}"` : value}`);
      return `${key}${fields.join("")}\n`;
    })
    .join("");
}
