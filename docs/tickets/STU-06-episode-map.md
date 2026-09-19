# STU-06 — Plan and approve the complete episode map

- **Status:** tracked in [FEATURE_TRACKER.md](../FEATURE_TRACKER.md)
- **Depends on:** STU-05 (approved Book Bible)
- **Blocks:** STU-07
- **Spec of record:** [EDITORIAL_DASHBOARD.md](../EDITORIAL_DASHBOARD.md)

## Outcome

AI proposes all episode boundaries and purposes, and the editor can produce a gap-free approved map.

## Scope

### In scope

- Episode-map generation for the whole book.
- Start and end paragraph ranges per episode.
- Purpose and development summaries.
- Boundary editing with automatic adjacent-range adjustment.
- A coverage validator that blocks approval on gaps and unintended overlaps.

### Out of scope

- Detailed Story Moment plans (STU-07); this ticket produces only estimated ranges.
- Any production work for an episode.

## Spec context

The AI plans all episodes before detailed Story Moment work begins. Each episode contains:

- Working title.
- Narrative purpose.
- Start and end paragraph IDs.
- Major developments, characters, locations, and reveals.
- An estimated Story Moment range based on narrative density.

The complete map must have continuous main-narrative coverage before approval. Moving a boundary automatically adjusts the neighbouring episode. Gaps and unintended overlaps block approval.

This implements the principle of planning the whole book before producing one episode at a time, and the principle of using narrative density rather than a fixed Story Moment count — the estimate here is a range, not a target.

## Domain objects touched

| Object | Role in this ticket |
| --- | --- |
| BookBibleEntry | Input facts for boundary and purpose proposals |
| Paragraph | Episode ranges are expressed in permanent paragraph IDs |
| EpisodePlan | Whole-book episode boundary and purpose |
| Job | Episode-map generation job |

## Acceptance

- [ ] Every episode shows start/end paragraph IDs and narrative purpose.
- [x] Moving a boundary adjusts the neighbouring episode.
- [x] Gaps and unintended overlaps block approval.
- [x] Main-narrative exclusions require a reason.
- [ ] Story Moment generation stays unavailable until the entire map is approved.

## Verification notes

- The coverage validator is the load-bearing piece. Test it against a deliberately gapped map and a deliberately overlapping map, not only against a valid one.
- "Unintended" overlap implies intended overlap is expressible. Decide and record how an intentional overlap is marked, or the validator cannot distinguish the two.
- Exclusion reasons recorded here feed the episode-completion check in STU-13.

## Implementation

- `npm run smoke:episodes` runs `coverageProblems` and `moveBoundary` against valid, gapped, overlapping, intentionally overlapping, and excluded maps. 15 checks, all passing.
- An intentional overlap is `overlapsPrevious` plus a required `overlapReason` on the later episode; see the decision log in [FEATURE_TRACKER.md](../FEATURE_TRACKER.md).
- The panel renders start/end IDs and purpose, but has not been opened in a browser and the OpenRouter planning call has never run, so the first two unticked boxes are unverified rather than unimplemented.
- `canPlanStoryMoments` in `src/lib/episodes/types.ts` is the gate STU-07 must read.
