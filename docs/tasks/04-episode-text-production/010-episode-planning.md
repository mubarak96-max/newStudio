# Task 010 — Plan Every Episode

Status: Pending

Depends on: Task 009

## Outcome

The system divides the complete Book into coherent, ordered Episode documents with explicit source ownership and a stable Firestore contract.

## Scope

- Generate all Episode boundaries from the Story Map, Book Model, and Source Model.
- Run Episode planning as a versioned background job followed by a separate whole-Book coverage-validation child.
- Use the configured fixed OpenRouter text model; Episode planning has no user-facing model settings.
- Optimize boundaries for narrative coherence, reading duration, and production continuity.
- Give every Episode an opening state, ending state, important events, emotional progression, reveal progression, and source range.
- Store Episodes in the `books/{bookId}/Episodes/{episodeId}` collection, using stable IDs and an `episodeNumber` beginning at 1.
- Give each Episode document its planning data plus a `visuals` map containing `images` and `twoPointFiveD` maps.
- Give each Episode document a `readingBeats` map; every Reading Beat entry owns its own `visuals` map of references used by that Beat.
- Keep Episode maps limited to structured metadata and asset references; binary files remain in object storage.
- Add Episode summaries and status to the Episodes planning tab.
- Calculate whole-book source coverage.

## Acceptance criteria

- [ ] Every source paragraph belongs to exactly one Episode.
- [ ] Missing and unintended duplicate ownership both equal zero.
- [ ] Episode boundaries do not silently split a paragraph.
- [ ] Each Episode has one versioned Story Plan.
- [ ] Refreshing the workspace does not interrupt Episode planning.
- [ ] The planning job cannot complete until its coverage-validation child reports zero missing or unintended duplicate paragraphs.
- [ ] Episode numbers are unique, contiguous, and resolve from Episode 1 onward.
- [ ] Each Episode document exposes the required `visuals.images`, `visuals.twoPointFiveD`, and `readingBeats` maps.
- [ ] The operator can inspect Episode order, ranges, and summaries.
- [ ] Lint, coverage, and planning tests pass.

## Not included

- Story Moments
- Camera or visual plans
