/**
 * The title page as a form (slice 2, step 4): the model's `titlePage` fields
 * turned into one text per key the dialog has a box for, and back.
 *
 * **Nothing here writes indentation or marks itself.** A value typed in the
 * dialog becomes `Key: first line` plus tab-indented continuations and is read
 * by `parse`, so the title page is built by exactly the code that built it when
 * the file was opened — marks as written (`_**BRICK & STEEL**_`), continuation
 * indent (ADR-0020), nothing new to get wrong.
 *
 * **What the writer did not touch is not rebuilt.** A field whose box still
 * holds what it was opened with keeps the very object it had, so Save with
 * nothing changed is the same title page (byte-identical file), and a field
 * with oddities the form cannot show — an unusual space after the colon —
 * survives edits to its neighbours. Keys with no box, and a key repeated, go to
 * "Other" and survive the same way (ADR-0020: the writer's words are theirs).
 */
import type { TitlePageField } from "./document.ts";
import { TITLE_PAGE_CONTINUATION_INDENT } from "./document.ts";
import { renderMarks } from "./marks.ts";
import { parse } from "./parse.ts";
import { serialise } from "./serialise.ts";

/** The keys the dialog has a box for, in the order the dialog and the file list them. */
export const TITLE_PAGE_KEYS = [
  "Title",
  "Credit",
  "Author",
  "Source",
  "Draft date",
  "Contact",
  "Copyright",
  "Notes",
] as const;

export type TitlePageKey = (typeof TITLE_PAGE_KEYS)[number];

/** What the dialog shows: one text per key, and the rest as `Key: value` lines. */
export interface TitlePageForm {
  readonly values: Readonly<Record<TitlePageKey, string>>;
  readonly other: string;
}

const canonical = (key: string): TitlePageKey | undefined =>
  TITLE_PAGE_KEYS.find((known) => known.toLowerCase() === key.trim().toLowerCase());

/** The field a key's box stands for: the first one written under that key. */
function representatives(titlePage: readonly TitlePageField[]): Map<TitlePageKey, TitlePageField> {
  const found = new Map<TitlePageKey, TitlePageField>();
  for (const field of titlePage) {
    const key = canonical(field.key);
    if (key !== undefined && !found.has(key)) found.set(key, field);
  }
  return found;
}

/** A field's value as the writer wrote it: marks shown, one line per line. */
function valueOf(field: TitlePageField): string {
  const lines = [renderMarks(field.inline).trim(), ...field.continuations.map((line) => renderMarks(line))];
  return lines.filter((line) => line.trim() !== "").join("\n");
}

function otherFields(titlePage: readonly TitlePageField[]): TitlePageField[] {
  const own = new Set(representatives(titlePage).values());
  return titlePage.filter((field) => !own.has(field));
}

/** The fields as the dialog opens: what the file says, in boxes. */
export function formOf(titlePage: readonly TitlePageField[]): TitlePageForm {
  const own = representatives(titlePage);
  const values = Object.fromEntries(
    TITLE_PAGE_KEYS.map((key) => [key, own.has(key) ? valueOf(own.get(key)!) : ""]),
  ) as Record<TitlePageKey, string>;
  const other = serialise({
    titlePage: otherFields(titlePage),
    elements: [],
    comments: [],
    endsWithNewline: false,
  });
  return { values, other };
}

/** A box's text as a field, built by the parser; undefined when the box is empty. */
function fieldOf(key: string, value: string): TitlePageField | undefined {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "");
  if (lines.length === 0) return undefined;
  const [first, ...rest] = lines as [string, ...string[]];
  const text = [`${key}: ${first}`, ...rest.map((line) => TITLE_PAGE_CONTINUATION_INDENT + line)].join("\n");
  return parse(text).titlePage[0];
}

/** "Other" as fields, or the reason it is not `Key: value` lines. */
export function parseOther(text: string): { fields: readonly TitlePageField[] } | { problem: string } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return { fields: [] };
  // A line that is neither `Key: value` nor indented would be quietly read as
  // a continuation of the field above it; say so instead.
  const wellFormed = lines.every((line, at) =>
    /^\s/.test(line) ? at > 0 : /^[^\s:][^:]*:/.test(line),
  );
  const parsed = parse(lines.join("\n"));
  if (!wellFormed || parsed.elements.length > 0 || parsed.titlePage.length === 0) {
    return { problem: "Other fields are written as “Key: value”, one to a line; a continuation line starts with a tab." };
  }
  return { fields: parsed.titlePage };
}

/**
 * The title page after the dialog's Save.
 *
 * Boxes that match what they opened with leave their field alone; a changed
 * box replaces its field in place, an emptied one removes it, a filled one that
 * had no field gets one in the dialog's order.
 */
export function applyForm(
  titlePage: readonly TitlePageField[],
  form: TitlePageForm,
): { titlePage: readonly TitlePageField[] } | { problem: string } {
  const opened = formOf(titlePage);
  const own = representatives(titlePage);

  let other: readonly TitlePageField[] | undefined;
  if (form.other !== opened.other) {
    const parsed = parseOther(form.other);
    if ("problem" in parsed) return parsed;
    other = parsed.fields;
  }
  // Unchanged "Other" keeps its original fields, in the places they were.
  const originalOthers = new Set(otherFields(titlePage));

  const result: TitlePageField[] = [];
  const placed = new Set<TitlePageKey>();
  let othersWritten = false;
  const writeOthers = (): void => {
    if (othersWritten || other === undefined) return;
    othersWritten = true;
    result.push(...other);
  };

  for (const field of titlePage) {
    if (originalOthers.has(field)) {
      // Changed "Other" is written once, where the first of the old ones stood.
      if (other === undefined) result.push(field);
      else writeOthers();
      continue;
    }
    const key = canonical(field.key)!;
    placed.add(key);
    if (form.values[key] === opened.values[key]) {
      result.push(field);
      continue;
    }
    const changed = fieldOf(field.key, form.values[key]);
    if (changed !== undefined) result.push(changed);
  }

  for (const [at, key] of TITLE_PAGE_KEYS.entries()) {
    if (placed.has(key) || form.values[key] === "" || own.has(key)) continue;
    const added = fieldOf(key, form.values[key]);
    if (added === undefined) continue;
    // In the dialog's order among the keys already there, else at the end.
    const after = result.findIndex((field) => {
      const known = canonical(field.key);
      return known !== undefined && TITLE_PAGE_KEYS.indexOf(known) > at;
    });
    result.splice(after === -1 ? result.length : after, 0, added);
  }
  if (other !== undefined && !othersWritten) result.push(...other);
  return { titlePage: result };
}

/** Whether two title pages say the same thing, so Save can decline to write. */
export function sameTitlePage(a: readonly TitlePageField[], b: readonly TitlePageField[]): boolean {
  const text = (fields: readonly TitlePageField[]): string =>
    serialise({ titlePage: fields, elements: [], comments: [], endsWithNewline: false });
  return text(a) === text(b);
}
