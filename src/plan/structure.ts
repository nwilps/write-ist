/**
 * Structure sheets: named sets of structure beats, drawn under the Plan grid
 * as a guide (`GLOSSARY.md`, *Structure sheet*, *Structure beat*, *Band*).
 *
 * **Held as fractions of the whole, never as page numbers**, so a sheet keeps
 * its shape at any length — a 90-page script, a 110-page one, a 400-page
 * novel. Ported from the prototype (`plan.html`, §15.4) with their sources;
 * they are reference, not the writer's work, so they live here in code and
 * the plan stores only which ones are shown, by id.
 *
 * **Each sheet shown is a band**, and bands stack one under another, so one
 * sheet's beats are never broken up by another's (§15.6). The writer chooses
 * which sheets; where a beat's label goes is worked out, never stored — the
 * row a label lands in means nothing against any other set of labels.
 *
 * The prototype's own templates — duplicating a sheet, editing its beats,
 * locking it to a length — are left out for now: they are list work with no
 * home in Plan yet, and nothing here prevents them arriving later.
 */

export interface StructureBeat {
  readonly name: string;
  /** Where it lands, as a fraction of the whole. */
  readonly at: number;
  /** Where a span ends; absent for a moment. */
  readonly to?: number;
}

export interface StructureSheet {
  /** Stable, and what `plan.md` stores. */
  readonly id: string;
  readonly name: string;
  readonly beats: readonly StructureBeat[];
}

export const STRUCTURE_SHEETS: readonly StructureSheet[] = [
  /*
   * Blake Snyder's beat sheet from *Save the Cat*. Snyder gives page numbers
   * for a 110-page script, so these are his marks divided by 110 — converted,
   * not estimated.
   */
  {
    id: "save-the-cat",
    name: "Save the Cat",
    beats: [
      { name: "Opening Image", at: 1 / 110 },
      { name: "Set-Up", at: 1 / 110, to: 10 / 110 },
      { name: "Theme Stated", at: 5 / 110 },
      { name: "Catalyst", at: 12 / 110 },
      { name: "Debate", at: 12 / 110, to: 25 / 110 },
      { name: "Break into Two", at: 25 / 110 },
      { name: "B Story", at: 30 / 110 },
      { name: "Fun and Games", at: 30 / 110, to: 55 / 110 },
      { name: "Midpoint", at: 55 / 110 },
      { name: "Bad Guys Close In", at: 55 / 110, to: 75 / 110 },
      { name: "All Is Lost", at: 75 / 110 },
      { name: "Dark Night of the Soul", at: 75 / 110, to: 85 / 110 },
      { name: "Break into Three", at: 85 / 110 },
      { name: "Finale", at: 85 / 110, to: 1 },
      { name: "Final Image", at: 1 },
    ],
  },
  /*
   * Campbell's monomyth in Vogler's twelve stages. Campbell describes a shape,
   * not a schedule, so these are the conventional three-act proportions.
   */
  {
    id: "heros-journey",
    name: "Hero’s Journey",
    beats: [
      { name: "Ordinary World", at: 0.01, to: 0.1 },
      { name: "Call to Adventure", at: 0.1 },
      { name: "Refusal of the Call", at: 0.12, to: 0.18 },
      { name: "Meeting the Mentor", at: 0.18, to: 0.25 },
      { name: "Crossing the Threshold", at: 0.25 },
      { name: "Tests, Allies, Enemies", at: 0.25, to: 0.5 },
      { name: "Approach the Inmost Cave", at: 0.5, to: 0.6 },
      { name: "The Ordeal", at: 0.6 },
      { name: "Reward", at: 0.6, to: 0.7 },
      { name: "The Road Back", at: 0.75 },
      { name: "Resurrection", at: 0.85, to: 0.95 },
      { name: "Return with the Elixir", at: 0.95, to: 1 },
    ],
  },
  /*
   * Frank Daniel's sequence approach, as set down by Paul Joseph Gulino: eight
   * sequences, whose eighths fall exactly on the act breaks.
   */
  {
    id: "sequence-approach",
    name: "Sequence Approach",
    beats: [
      { name: "A · Status Quo & Inciting Incident", at: 0, to: 0.125 },
      { name: "B · Predicament & Lock In", at: 0.125, to: 0.25 },
      { name: "End of Act One", at: 0.25 },
      { name: "C · First Obstacle", at: 0.25, to: 0.375 },
      { name: "D · First Culmination", at: 0.375, to: 0.5 },
      { name: "Midpoint", at: 0.5 },
      { name: "E · Subplot & Rising Action", at: 0.5, to: 0.625 },
      { name: "F · Main Culmination", at: 0.625, to: 0.75 },
      { name: "End of Act Two", at: 0.75 },
      { name: "G · New Tension & Twist", at: 0.75, to: 0.875 },
      { name: "H · Resolution", at: 0.875, to: 1 },
    ],
  },
  /* Dan Harmon's Story Circle: eight equal steps round a circle. */
  {
    id: "story-circle",
    name: "Story Circle",
    beats: [
      { name: "1 · You", at: 0, to: 0.125 },
      { name: "2 · Need", at: 0.125, to: 0.25 },
      { name: "3 · Go", at: 0.25, to: 0.375 },
      { name: "4 · Search", at: 0.375, to: 0.5 },
      { name: "5 · Find", at: 0.5, to: 0.625 },
      { name: "6 · Take", at: 0.625, to: 0.75 },
      { name: "7 · Return", at: 0.75, to: 0.875 },
      { name: "8 · Change", at: 0.875, to: 1 },
    ],
  },
];

export const sheetById = (id: string): StructureSheet | undefined => STRUCTURE_SHEETS.find((sheet) => sheet.id === id);

/** A beat as drawn: where on the grid, and in which row of the labels under it. */
export interface PlacedBeat {
  readonly sheet: string;
  readonly name: string;
  /** The boundary it stands on, in cells from the start. */
  readonly cell: number;
  /** A span's end, in cells; absent for a moment. */
  readonly end?: number;
  /** The page it reads as, counted from 1 as a person counts (and its span's last). */
  readonly label: string;
  readonly row: number;
}

export interface BeatTrack {
  readonly rows: number;
  readonly beats: readonly PlacedBeat[];
}

/**
 * Lay out the sheets' beats under a grid this many cells long, band by band.
 * Within a band, moments take the upper rows in order along the grid, spans
 * the lower rows shortest first, at most two rows each; a band that needs
 * none takes none. `labelCells` is how many cells a label is wide.
 */
export function layoutBeats(sheetIds: readonly string[], length: number, labelCells: (text: string) => number): BeatTrack {
  const placed: PlacedBeat[] = [];
  let row = 0;
  for (const id of sheetIds) {
    const sheet = sheetById(id);
    if (sheet === undefined || sheet.beats.length === 0) continue;
    const resolved = sheet.beats.map((beat) => {
      const cell = Math.min(length, Math.max(0, Math.round(beat.at * length)));
      const end = beat.to === undefined ? undefined : Math.max(cell + 1, Math.min(length, Math.round(beat.to * length)));
      const label = end === undefined ? `${Math.max(1, cell)}` : `${cell + 1}–${end}`;
      return { sheet: sheet.id, name: beat.name, cell, end, label };
    });
    const pack = <T extends (typeof resolved)[number]>(items: readonly T[], width: (item: T) => number, room: number) => {
      const taken: [number, number][][] = [[], []];
      const clears = (at: number, from: number, to: number): boolean =>
        !taken[at]!.some(([start, stop]) => from < stop + room && start - room < to);
      return items.map((item) => {
        const from = item.cell;
        const to = from + width(item);
        const sub = clears(0, from, to) ? 0 : 1;
        taken[sub]!.push([from, to]);
        return { item, sub };
      });
    };
    const moments = pack(
      resolved.filter((beat) => beat.end === undefined).sort((one, other) => one.cell - other.cell),
      (beat) => labelCells(`${beat.name} ${beat.label}`),
      0.25,
    );
    const spans = pack(
      resolved
        .filter((beat) => beat.end !== undefined)
        .sort((one, other) => one.end! - one.cell - (other.end! - other.cell) || one.cell - other.cell),
      (beat) => beat.end! - beat.cell,
      0,
    );
    const momentRows = moments.length === 0 ? 0 : Math.max(...moments.map((each) => each.sub)) + 1;
    const spanRows = spans.length === 0 ? 0 : Math.max(...spans.map((each) => each.sub)) + 1;
    for (const { item, sub } of moments) placed.push({ ...withoutEnd(item), row: row + sub });
    for (const { item, sub } of spans) placed.push({ ...item, end: item.end!, row: row + momentRows + sub });
    row += momentRows + spanRows;
  }
  return { rows: row, beats: placed };
}

const withoutEnd = ({ sheet, name, cell, label }: { sheet: string; name: string; cell: number; label: string }) => ({
  sheet,
  name,
  cell,
  label,
});
