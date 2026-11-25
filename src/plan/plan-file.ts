/**
 * `plan.md`: a plan as a readable document (ADR-0025, ADR-0012).
 *
 * ADR-0025's sidecar shape: the writer's words in the body, the application's
 * bookkeeping in a short labelled header under each heading. One section per
 * card, its title the heading and its description the body:
 *
 * ```
 * # Plan
 *
 * Structure: save-the-cat
 *
 * ## The ferry at night
 *
 * Card: card-3
 * Colour: blue
 * Lane: 2
 * Starts at: 22.5%
 * Length: 3.75%
 *
 * They cross without lights. She sees the other boat first.
 * ```
 *
 * - **Ids, never names**, in anything stored: a card is `card-3` and a
 *   structure sheet `save-the-cat`, so renaming either changes nothing else.
 * - **Where a card is, as a share of the whole** (`plan.ts`): `Starts at` and
 *   `Length` are percentages, so the file reads the same whatever the target.
 *   `Lane` is counted from 1, as a person counts; the model counts from 0, and
 *   this file is the one place they meet.
 * - **The description is the writer's own text**, kept as typed. A line of it
 *   that starts with `#` or `\` is written with a `\` in front (Markdown's own
 *   escape), so it is never read as a heading; reading takes it off again.
 *   Trailing empty lines are not kept.
 *
 * **A file that is not a plan is never written over** (ADR-0008 rule 3):
 * `parsePlan` answers `null` for text with no `# ` heading, and the workspace
 * then leaves the file alone. Anything else is put right quietly — a card
 * missing its id is given one, a lane or a percentage that is not a number
 * falls back to the start — and a line in the plan's own header that Write-ist
 * does not know is kept, and written back.
 */
import { CARD_COLOURS, freeCardId, type CardColour, type Plan, type PlanCard } from "./plan.ts";

export const PLAN_HEADING = "Plan";

const LABELS = {
  structure: "Structure",
  card: "Card",
  colour: "Colour",
  lane: "Lane",
  start: "Starts at",
  length: "Length",
} as const;
const CARD_LABELS: ReadonlySet<string> = new Set([LABELS.card, LABELS.colour, LABELS.lane, LABELS.start, LABELS.length]);

/** A card's length when the file does not say: two cells of a hundred. */
const DEFAULT_LENGTH = 0.02;

/** A plan as read, with what Write-ist keeps of the file that the plan does not hold. */
export interface PlanDocument {
  readonly plan: Plan;
  /** The top heading's text, kept as the file has it. */
  readonly heading: string;
  /** Lines in the plan's header that are not Write-ist's, kept and written back. */
  readonly extra: readonly string[];
}

const LABELLED = /^([A-Za-z][A-Za-z ]*):[ \t]*(.*)$/;

/** Read a `plan.md`, or `null` if it is not one. */
export function parsePlan(text: string): PlanDocument | null {
  const lines = text.split("\n");
  const top = lines.findIndex((line) => /^# /.test(line));
  if (top === -1) return null;
  const heading = lines[top]!.slice(2).trim();

  let at = top + 1;
  let structure: string[] = [];
  const extra: string[] = [];
  for (; at < lines.length && !isCardHeading(lines[at]!); at++) {
    const line = lines[at]!;
    const labelled = LABELLED.exec(line);
    if (labelled?.[1] === LABELS.structure) structure = idsOf(labelled[2]!);
    else if (line.trim() !== "") extra.push(line);
  }

  const cards: PlanCard[] = [];
  while (at < lines.length) {
    const title = lines[at]!.replace(/^##[ \t]?/, "").trim();
    at += 1;
    // The blank line between the heading and the header.
    if (at < lines.length && lines[at] === "") at += 1;
    const fields = new Map<string, string>();
    for (; at < lines.length; at++) {
      const labelled = LABELLED.exec(lines[at]!);
      if (labelled === null || !CARD_LABELS.has(labelled[1]!)) break;
      if (!fields.has(labelled[1]!)) fields.set(labelled[1]!, labelled[2]!.trim());
    }
    // The blank line between the header and the description.
    if (at < lines.length && lines[at] === "") at += 1;
    const body: string[] = [];
    for (; at < lines.length && !isCardHeading(lines[at]!); at++) body.push(lines[at]!.replace(/^\\/, ""));
    while (body.length > 0 && body[body.length - 1] === "") body.pop();
    cards.push(cardOf(fields, title, body.join("\n")));
  }

  // Every card has an id, and no two the same: one given or repeated is given a new one.
  const seen = new Set<string>();
  const unique: PlanCard[] = [];
  for (const card of cards) {
    const id = card.id === "" || seen.has(card.id) ? freeCardId({ structure: [], cards: [...cards, ...unique] }) : card.id;
    seen.add(id);
    unique.push({ ...card, id });
  }
  return { plan: { structure, cards: unique }, heading: heading === "" ? PLAN_HEADING : heading, extra };
}

/** The text of a `plan.md`. */
export function serialisePlan(plan: Plan, kept: Pick<PlanDocument, "heading" | "extra"> = { heading: PLAN_HEADING, extra: [] }): string {
  const out: string[] = [`# ${kept.heading}`, ""];
  if (plan.structure.length > 0) out.push(`${LABELS.structure}: ${plan.structure.join(", ")}`);
  out.push(...kept.extra);
  if (out[out.length - 1] !== "") out.push("");
  for (const card of plan.cards) {
    out.push(card.title === "" ? "##" : `## ${card.title}`, "");
    out.push(`${LABELS.card}: ${card.id}`);
    if (card.colour !== "plain") out.push(`${LABELS.colour}: ${card.colour}`);
    out.push(`${LABELS.lane}: ${card.lane + 1}`);
    out.push(`${LABELS.start}: ${percent(card.start)}`);
    out.push(`${LABELS.length}: ${percent(card.length)}`);
    const description = card.description.replace(/\n+$/, "");
    if (description !== "") {
      out.push("", ...description.split("\n").map((line) => (/^[#\\]/.test(line) ? `\\${line}` : line)));
    }
    out.push("");
  }
  return out.join("\n");
}

const isCardHeading = (line: string): boolean => /^##(?:[ \t]|$)/.test(line);

/** Ids from a comma-separated list: lower case, letters, digits and hyphens. */
const idsOf = (listed: string): string[] =>
  listed
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter((id) => /^[a-z0-9][a-z0-9-]*$/.test(id) && id !== "none");

/** A fraction as a percentage, to four decimal places and no trailing zeros. */
function percent(fraction: number): string {
  return `${Number((fraction * 100).toFixed(4))}%`;
}

/** A percentage back as a fraction, or `undefined` if it is not one. */
function fractionFrom(text: string | undefined): number | undefined {
  const match = /^(\d+(?:\.\d+)?)\s*%$/.exec(text ?? "");
  return match === null ? undefined : Number(match[1]) / 100;
}

function cardOf(fields: ReadonlyMap<string, string>, title: string, description: string): PlanCard {
  const colour = (fields.get(LABELS.colour) ?? "plain").toLowerCase();
  const lane = Number.parseInt(fields.get(LABELS.lane) ?? "", 10);
  const length = fractionFrom(fields.get(LABELS.length));
  return {
    id: /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(fields.get(LABELS.card) ?? "") ? fields.get(LABELS.card)! : "",
    title,
    description,
    colour: (CARD_COLOURS as readonly string[]).includes(colour) ? (colour as CardColour) : "plain",
    lane: Number.isFinite(lane) && lane >= 1 ? lane - 1 : 0,
    start: fractionFrom(fields.get(LABELS.start)) ?? 0,
    length: length !== undefined && length > 0 ? length : DEFAULT_LENGTH,
  };
}
