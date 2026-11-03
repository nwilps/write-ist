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
   * How many uses make a character or a location **confirmed** without the
   * writer saying so (slice 2, step 8). A name used fewer times is in the list
   * but unconfirmed: not offered, not a known word.
   */
  readonly confirmAfterUses: number;
  /**
   * How long the writer must stop typing before the scene they changed is
   * rechecked, while spellcheck is on (slice 2, step 10), in milliseconds.
   */
  readonly spellcheckPauseMs: number;
  /**
   * Damerau–Levenshtein distance within which a word is a near-match of a
   * confirmed name or location (*Did you mean MICHAEL?*, Q-T).
   */
  readonly spellcheckNearDistance: number;
  /** The shortest word a near-match is offered for (Q-T). */
  readonly spellcheckNearMinLength: number;
}

export const DEFAULT_PREFERENCES: Preferences = {
  confirmAfterUses: 3,
  spellcheckPauseMs: 1000,
  spellcheckNearDistance: 1,
  spellcheckNearMinLength: 4,
};
