# Task 008 — Generate the Book Model and Book World

Status: Pending

Depends on: Task 007

## Outcome

The system converts the complete verified source into an inspectable structured model of the Book's world.

## Scope

- Analyze chapters or bounded source windows locally.
- Run Book modeling as a resumable parent job with bounded source-window child jobs and one canonical merge child.
- Use a fixed OpenRouter text model and the application's single server-side API key; expose no model settings in the workspace.
- Extract characters, aliases, locations, maps, objects, events, relationships, descriptions, and source provenance.
- Merge local results into canonical entities.
- Resolve aliases without losing uncertainty.
- Build chronology, state timelines, reveal timeline, and appearance changes.
- Distinguish source facts, derived canon, and visual fill.
- Persist a versioned Book Model containing canonical entity maps, chronology, narrative timelines, and state timelines.
- Add Book Model inspection inside the Book modeling tab.

## Acceptance criteria

- [ ] Every modeled claim retains source paragraph provenance.
- [ ] Aliases resolve to stable canonical entity IDs.
- [ ] Conflicting entity matches remain visible and do not merge silently.
- [ ] State-changing events record before and after state.
- [ ] Regeneration produces a new version without overwriting the previous model.
- [ ] Retrying one failed source window preserves successful window results.
- [ ] The Book Model is not complete until the canonical merge and consistency checks pass.
- [ ] Lint, schema, and representative model-generation tests pass.

## Not included

- Episode boundaries
- Visual appearance generation
- Reader UI
