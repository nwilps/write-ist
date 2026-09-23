/**
 * An editor that expects nothing else to write its manuscript.
 *
 * For tests where nothing does — finding a change made elsewhere is then a
 * failure, and a loud one. `test/project/changed-elsewhere.test.ts` is where
 * something else does.
 */
import type { ChangedElsewhere } from "../../src/project/save.ts";

export const unwatched: ChangedElsewhere = {
  reload: () => {
    throw new Error("nothing else wrote this manuscript, but a save found a change");
  },
  keptBoth: () => {
    throw new Error("nothing else wrote this manuscript, but a save kept a copy");
  },
};
