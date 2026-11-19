/**
 * The writer's settings: one small file for the whole application.
 *
 * `settings.json`, in app data beside the ledger and the custom dictionary —
 * outside every bundle, because none of it is the writer's work (ADR-0016;
 * `GLOSSARY.md`, *Registry*: "the app's preferences sit outside every bundle
 * too, each in its own file"). Losing it costs re-choosing a few things and
 * never a word.
 *
 * **Every value is put right on the way in, quietly**, the way Goals treats a
 * number box: a field that is missing, of the wrong kind or out of range reads
 * as its default, so a file edited by hand or written by a later version still
 * opens. Nothing here ever says a setting was wrong.
 *
 * **A file that is there and cannot be read is never written over** (ADR-0008
 * rule 3). Settings still change for the session; they are simply not kept, and
 * the file is left exactly as it was for the writer to look at.
 *
 * First pass (Settings, Noah's notes): most of these are kept and shown, and
 * not yet read by anything else. What each one drives today is in the pull
 * request that added them; `dayEndsAt` and the two corner styles are live.
 */
import { join, type Filesystem } from "../project/filesystem.ts";
import { DEFAULT_DAY_ENDS_AT, type TimeOfDay } from "../goals/day.ts";
import { COMING_FORMATS } from "../project/create.ts";
import { FORMATS } from "../project/marker.ts";

/** The file's name, in app data. */
export const SETTINGS_FILE = "settings.json";

/** Who the writer is, for filling in title pages one day. Nothing reads it yet. */
export interface AuthorInfo {
  readonly name: string;
  /** Other names the writer writes under, in the order they gave them. */
  readonly penNames: readonly string[];
  readonly email: string;
  readonly phone: string;
  readonly address: string;
}

export type Corners = "rounded" | "sharp";
/** The one theme there is. Light is drawn as coming. */
export type Theme = "dark";

export interface Appearance {
  readonly theme: Theme;
  readonly whitePaper: boolean;
  /** The corners of the interface: dialogs, menus, pills, panels. */
  readonly interfaceCorners: Corners;
  /** The corners of each sheet of paper. */
  readonly paperCorners: Corners;
}

/** What a new project of one type starts with. Kept; not yet read by New Project. */
export interface ProjectDefaults {
  /** Offered in New Project's list of types. */
  readonly shown: boolean;
  readonly dailyGoalOn: boolean;
  readonly dailyGoal: number;
  /** Pages the writer is aiming at; 0 for none. */
  readonly targetPages: number;
  readonly boldSceneHeadings: boolean;
  readonly boldTransitions: boolean;
  readonly blankLinesBeforeSceneHeadings: 1 | 2;
}

export interface Settings {
  readonly author: AuthorInfo;
  /** Where the writer's day ends (`src/goals/day.ts`). */
  readonly dayEndsAt: TimeOfDay;
  readonly appearance: Appearance;
  /** By project type, for the types New Project offers. */
  readonly projectDefaults: Readonly<Record<string, ProjectDefaults>>;
}

/** The project types a default can be kept for: those New Project can make. */
export const DEFAULTS_FOR: readonly string[] = FORMATS;
/** Drawn in the list as coming, as New Project draws them. */
export const DEFAULTS_COMING: readonly string[] = COMING_FORMATS;

/** The largest daily goal or target page count kept. */
export const MOST_WORDS = 100_000;
export const MOST_PAGES = 1_000;

export const DEFAULT_PROJECT_DEFAULTS: ProjectDefaults = {
  shown: true,
  dailyGoalOn: false,
  dailyGoal: 500,
  targetPages: 0,
  boldSceneHeadings: false,
  boldTransitions: false,
  blankLinesBeforeSceneHeadings: 1,
};

export const DEFAULT_SETTINGS: Settings = {
  author: { name: "", penNames: [], email: "", phone: "", address: "" },
  dayEndsAt: DEFAULT_DAY_ENDS_AT,
  appearance: { theme: "dark", whitePaper: false, interfaceCorners: "rounded", paperCorners: "rounded" },
  projectDefaults: Object.fromEntries(DEFAULTS_FOR.map((type) => [type, DEFAULT_PROJECT_DEFAULTS])),
};

// --- Putting values right ----------------------------------------------------

type Loose = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Loose =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown, fallback = ""): string => (typeof value === "string" ? value.trim() : fallback);
const flag = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);
const corners = (value: unknown): Corners => (value === "sharp" ? "sharp" : "rounded");

/**
 * A whole number between `least` and `most`, from whatever was typed or kept.
 * A fraction is rounded, too large is the largest, too small is the smallest;
 * blank or not a number is `fallback`.
 */
export function wholeNumber(value: unknown, least: number, most: number, fallback: number): number {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(number)) return fallback;
  return Math.min(most, Math.max(least, Math.round(number))) + 0;
}

/**
 * Pen names from one line, comma-separated, or from a kept list: each trimmed,
 * blanks dropped, and a name given twice (in any case) kept once.
 */
export function penNamesFrom(value: unknown): readonly string[] {
  const parts = typeof value === "string" ? value.split(",") : Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of parts) {
    const name = text(part);
    if (name === "" || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    names.push(name);
  }
  return names;
}

const TIME = /^(\d{1,2})(?::?(\d{2}))?\s*([ap])?\.?\s*m?\.?$/;

/**
 * A time of day from what the writer typed, or `undefined` when it is not one.
 *
 * `0:01`, `00:01`, `12:01 AM`, `12:01am`, `4pm`, `4 p.m.`, `1630` and `16` are
 * all read. With AM or PM the hour is 1 to 12; without, it is 0 to 23.
 */
export function timeFrom(typed: string): TimeOfDay | undefined {
  const found = TIME.exec(typed.trim().toLowerCase());
  if (found === null) return undefined;
  let hour = Number(found[1]);
  const minute = found[2] === undefined ? 0 : Number(found[2]);
  if (minute > 59) return undefined;
  if (found[3] !== undefined) {
    if (hour < 1 || hour > 12) return undefined;
    hour = (hour % 12) + (found[3] === "p" ? 12 : 0);
  } else if (hour > 23) {
    return undefined;
  }
  return { hour, minute };
}

/** A time of day as the writer reads it: `12:00 AM`, `4:30 PM`. */
export function timeSaid({ hour, minute }: TimeOfDay): string {
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

function timeOf(value: unknown): TimeOfDay {
  if (!isRecord(value)) return DEFAULT_DAY_ENDS_AT;
  const hour = value["hour"];
  const minute = value["minute"];
  if (typeof hour !== "number" || typeof minute !== "number") return DEFAULT_DAY_ENDS_AT;
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return DEFAULT_DAY_ENDS_AT;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return DEFAULT_DAY_ENDS_AT;
  return { hour, minute };
}

function projectDefaultsOf(value: unknown): ProjectDefaults {
  const kept = isRecord(value) ? value : {};
  const base = DEFAULT_PROJECT_DEFAULTS;
  return {
    shown: flag(kept["shown"], base.shown),
    dailyGoalOn: flag(kept["dailyGoalOn"], base.dailyGoalOn),
    dailyGoal: wholeNumber(kept["dailyGoal"], 1, MOST_WORDS, base.dailyGoal),
    targetPages: wholeNumber(kept["targetPages"], 0, MOST_PAGES, base.targetPages),
    boldSceneHeadings: flag(kept["boldSceneHeadings"], base.boldSceneHeadings),
    boldTransitions: flag(kept["boldTransitions"], base.boldTransitions),
    blankLinesBeforeSceneHeadings: kept["blankLinesBeforeSceneHeadings"] === 2 ? 2 : 1,
  };
}

/** Settings from anything at all, every part of it put right. */
export function settingsFrom(value: unknown): Settings {
  const kept = isRecord(value) ? value : {};
  const author = isRecord(kept["author"]) ? kept["author"] : {};
  const appearance = isRecord(kept["appearance"]) ? kept["appearance"] : {};
  const defaults = isRecord(kept["projectDefaults"]) ? kept["projectDefaults"] : {};
  return {
    author: {
      name: text(author["name"]),
      penNames: penNamesFrom(author["penNames"]),
      email: text(author["email"]),
      phone: text(author["phone"]),
      address: text(author["address"]),
    },
    dayEndsAt: timeOf(kept["dayEndsAt"]),
    appearance: {
      theme: "dark",
      whitePaper: flag(appearance["whitePaper"], false),
      interfaceCorners: corners(appearance["interfaceCorners"]),
      paperCorners: corners(appearance["paperCorners"]),
    },
    projectDefaults: Object.fromEntries(DEFAULTS_FOR.map((type) => [type, projectDefaultsOf(defaults[type])])),
  };
}

/** The file's text: readable, and the same settings always give the same bytes. */
export function settingsText(settings: Settings): string {
  return `${JSON.stringify(settingsFrom(settings), null, 2)}\n`;
}

// --- The file ------------------------------------------------------------------

export interface SettingsStore {
  /** The settings as the file holds them; the defaults when there is no file. */
  readonly load: () => Promise<Settings>;
  /**
   * Keep these settings. Writes run one after another, the last one landing
   * last. Resolves to `false`, writing nothing, when the file was there and
   * could not be read.
   */
  readonly save: (settings: Settings) => Promise<boolean>;
}

const decoder = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();

export function openSettingsStore(filesystem: Filesystem, directory: string): SettingsStore {
  const path = join(directory, SETTINGS_FILE);
  /** The file was there and would not read or parse: left alone from now on. */
  let leftAlone = false;
  let writing: Promise<unknown> = Promise.resolve();

  return {
    async load() {
      try {
        // Absent is a first run; there and unreadable is left alone.
        if (!(await filesystem.exists(path))) return DEFAULT_SETTINGS;
        return settingsFrom(JSON.parse(decoder.decode(await filesystem.readFile(path))));
      } catch {
        leftAlone = true;
        return DEFAULT_SETTINGS;
      }
    },
    save(settings) {
      const write = writing.then(async () => {
        if (leftAlone) return false;
        await filesystem.createDirectory(directory);
        await filesystem.writeFile(path, encoder.encode(settingsText(settings)));
        return true;
      });
      writing = write.catch(() => {});
      return write;
    },
  };
}
