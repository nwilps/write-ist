/**
 * Run something against a spacing table with some rows overridden (ADR-0038).
 *
 * The table is data in `geometry.ts`; a test that wants a pair to leave three
 * blank lines, or wants Final Draft's own PDF spacing back, puts a row at the
 * front for the duration of the call and takes it out again.
 */
import { SPACING, type SpacingRule } from "../../src/screenplay/geometry.ts";

export function withSpacing<T>(rows: readonly SpacingRule[], run: () => T): T {
  const table = SPACING as SpacingRule[];
  table.unshift(...rows);
  try {
    return run();
  } finally {
    table.splice(0, rows.length);
  }
}

/** The spacing of Final Draft's PDF of Big Fish, measured: one blank line before a scene heading. */
export const PDF_SCENE_HEADING_GAP: SpacingRule = {
  above: "any",
  below: "scene-heading",
  blank: 1,
  squishable: false,
};
