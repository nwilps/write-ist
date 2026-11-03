/**
 * What a caught thing can be said as.
 *
 * One place, because every caller wants the same thing and two copies of it
 * would drift the day one of them starts printing something the other does
 * not — which, for a panel the writer reads, is a difference in what they are
 * told about their own file.
 */
export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
