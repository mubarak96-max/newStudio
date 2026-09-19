# Task 014 — Generate the Visual Continuity Bible

Status: Pending

Depends on: Task 013

## Outcome

Recurring characters, locations, objects, and the Book's visual language have canonical, source-grounded references.

## Scope

- Generate the visual profile for genre, era, palette, lighting, texture, and lens language.
- Run continuity generation as a background parent job with independent character, location, object, and Book-style children followed by a consistency merge.
- Use the configured fixed OpenRouter text model for continuity analysis; expose no model settings.
- Create versioned character references and track appearance changes.
- Create location references with zones, entrances, anchors, and layout logic.
- Create hero-object references with ownership and condition timelines.
- Separate source facts, derived canon, and persistent visual fill.
- Add continuity inspection inside the Visual Continuity section of the Visuals planning tab.

## Acceptance criteria

- [ ] Every reference traces factual attributes to source paragraphs.
- [ ] Unspecified visual fill is labeled and reused consistently.
- [ ] Appearance and condition changes are time-aware.
- [ ] Downstream plans reference canonical IDs, not names alone.
- [ ] Updating one reference identifies dependent visual plans.
- [ ] Retrying one failed entity child preserves successful reference outputs.
- [ ] The continuity version is not complete until the cross-reference consistency merge passes.
- [ ] Lint, schema, and continuity tests pass.

## Not included

- Final compositions
- 2.5D processing
