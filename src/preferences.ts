/**
 * The tunable values, named.
 *
 * A number the writer might one day change is a named value here and not a
 * literal where it is used (slice 2, step 8: *"a named value in preferences,
 * not a literal in code"*). Nothing reads these from disk yet: there is no
 * preferences screen in this slice, so the defaults are the values. When a
 * screen arrives it hands a `Preferences` to the callers that take one.
 */
export interface Preferences {
  /**
   * How long the writer must stop typing before the scene they changed is
   * rechecked, while spellcheck is on (slice 2, step 10), in milliseconds.
   */
  readonly spellcheckPauseMs: number;
}

export const DEFAULT_PREFERENCES: Preferences = {
  spellcheckPauseMs: 1000,
};
