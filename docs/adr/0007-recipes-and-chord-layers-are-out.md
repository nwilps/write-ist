# Recipes and chord layers are out of scope

Recipes — form-shaped data with fields and quantities — and chord layers for song lyrics are
both rejected, permanently rather than deferred.

They were the **only two features in the catalog forcing a document model that holds
non-prose structured content or a second layer aligned to character positions.** Dropping
them removed that pressure entirely and materially simplified the document model, which is
the single largest scope reduction in the project.

Recorded because the reasoning is invisible from the outside: someone looking at the app
later will see no structured-data support, assume it was an oversight, and propose adding
one small form-shaped feature. That one feature brings back a document model the rest of the
design was simplified by discarding.

## Consequences

- **A structured-data surface is rejected**, not deferred. Nothing left in the app needs one.
- **Song lyrics remain viable** as a poetry configuration — but only because chords are gone.
  Chords would need a layer aligned to character positions, which is a different model.
- The same logic rejects research clippings and any other feature whose real requirement is
  binary assets or aligned non-text layers.
