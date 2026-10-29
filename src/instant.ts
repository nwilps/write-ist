/**
 * A clock the ledger (and anything else that dates a record) can be handed.
 *
 * Tests rewind it between cases (`docs/STANDARDS.md`: a generator claimed as
 * reproducible has to be rewound, not merely seeded). Production uses the
 * system clock below.
 */
export interface Instant {
  now(): Date;
}

/** The wall clock. The default every production call site takes. */
export const systemInstant: Instant = {
  now: () => new Date(),
};
