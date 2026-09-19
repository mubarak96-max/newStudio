# Task 009 — Generate the Story Map and Storylines

Status: Pending

Depends on: Task 008

## Outcome

The complete Book is represented as ordered, overlapping narrative arcs and source-grounded events.

## Scope

- Generate storylines from the Book Model and Source Model.
- Run Story Map generation as a background job with bounded storyline/event analysis children and one ordered merge child.
- Use the configured fixed OpenRouter text model; Story Map generation has no user-facing model settings.
- Order events and preserve flashbacks, dreams, parallel arcs, and uncertain chronology.
- Record participants, locations, state changes, reveal changes, and source provenance.
- Add Story Map and storyline inspection inside the Book modeling tab.
- Version generation inputs and outputs.

## Acceptance criteria

- [ ] Every Story Map event references canonical entities and source paragraphs.
- [ ] Multiple overlapping arcs can reference the same event intentionally.
- [ ] Narrative order and chronological order remain distinct where required.
- [ ] Unsupported claims are not promoted to source facts.
- [ ] The complete Story Map can be regenerated without changing the Source Model.
- [ ] Retrying a failed child does not duplicate events or overwrite the prior Story Map version.
- [ ] Lint, schema, and representative tests pass.

## Not included

- Episode segmentation
- Visual direction
