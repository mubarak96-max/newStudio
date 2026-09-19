# Task 011 — Generate Story Moments with Complete Coverage

Status: Pending

Depends on: Task 010

## Outcome

Every Episode is divided into meaningful Story Moments without losing or over-fragmenting the prose.

## Scope

- Generate Story Moments from each Episode Story Plan.
- Run one parent job for the Book and fan out Story Moment generation into independent Episode-scoped child jobs.
- Use the configured fixed OpenRouter text model; Story Moment generation has no user-facing model settings.
- Record start state, end state, characters, location, objects, and source paragraphs.
- Keep Moment boundaries aligned with meaningful narrative changes.
- Validate Episode-to-Moment source ownership.
- Store Story Moments under their owning Episode planning data with stable IDs and deterministic order.
- Group Moments by Episode inside the Episodes planning tab.
- Render every Story Moment as a collapsible section.

## Acceptance criteria

- [ ] Every Episode paragraph belongs to exactly one Story Moment.
- [ ] Every Moment paragraph belongs to its parent Episode.
- [ ] Missing and unintended duplicate ownership both equal zero.
- [ ] Long conversations are not split on every speaker or gesture.
- [ ] Moment order resolves deterministically.
- [ ] Retrying one failed Episode child preserves Story Moments generated for other Episodes.
- [ ] The parent completes only after every Episode child and the Episode-to-Moment coverage check pass.
- [ ] Expanding a Moment in Episodes planning exposes its source ownership, narrative state, exact text, commentary, and Reading Beat list.
- [ ] Lint, coverage, and granularity tests pass.

## Not included

- Reading Beats
- Images or compositions
