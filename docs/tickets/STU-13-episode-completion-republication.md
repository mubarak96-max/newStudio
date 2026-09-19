# STU-13 — Complete an episode and republish a Story Moment safely

- **Status:** tracked in [FEATURE_TRACKER.md](../FEATURE_TRACKER.md)
- **Depends on:** STU-12 (posted Story Moments and the objective check suite)
- **Blocks:** nothing directly
- **Spec of record:** [EDITORIAL_DASHBOARD.md](../EDITORIAL_DASHBOARD.md)

## Outcome

An episode can pass whole-episode checks, and an existing Story Moment can be replaced without interrupting its current live version.

## Scope

### In scope

- Coverage, continuity, and reveal checks at episode level.
- The episode completion action.
- Replacement versions prepared alongside a live version.
- Atomic promotion.
- Deletion of the old version after promotion.

### Out of scope

- Automatic deletion or regeneration of outdated work.
- Per-Story-Moment objective checks (STU-12 owns those; this ticket re-runs them at episode level).

## Spec context

Posting and republication rules:

- Episode-level checks are required before the episode can be marked complete.
- Republication keeps the current version live while a replacement is prepared.
- Promotion atomically switches to the replacement, then deletes the old version.

Episode-completion blockers:

- Unaccounted main-narrative paragraphs.
- Broken ordering or episode-range coverage.
- Unresolved continuity conflicts.
- Incorrect revelation timing across Story Moments.
- Any posted Story Moment failing its current validation checks.

The last blocker means posted Story Moments are revalidated, not trusted. A source revision created after posting can invalidate work that passed at post time.

## Domain objects touched

| Object | Role in this ticket |
| --- | --- |
| EpisodePlan | Supplies the range and exclusion reasons the coverage check uses |
| StoryMomentPlan | Ordering and reveal timing across the episode |
| PostedStoryMoment | Gains a replacement version and atomic promotion |
| Episode | Ordered collection of posted Story Moments and completion state |

## Acceptance

- [x] Episode completion is blocked by unaccounted narrative paragraphs.
- [x] Posted Story Moments can remain live while the episode is incomplete.
- [x] A replacement does not affect the current Story Moment until promotion.
- [x] Promotion switches readers atomically to the replacement.
- [x] The old version is deleted only after successful promotion.

## Verification notes

- Test promotion atomicity from the Reader side: a reader polling during promotion must never see a missing or half-written Story Moment.
- Deletion ordering matters. If promotion fails, the old version must still be live and undeleted, so drive a failure case deliberately.
- Reveal-timing checks across Story Moments depend on the reveal positions recorded in STU-05 and the constraints planned in STU-07.

## Implementation

- Completion re-runs Story Moment coverage, posting blockers, reveal/continuity checks, image availability, canonical-version identity, and public-content equality. It refuses changed or outdated source work.
- Already-posted Story Moments stay `live: true` while the episode remains incomplete. Completion writes only after every current Story Moment passes.
- Preparing a replacement writes a denied internal version and records it on the internal plan without touching canonical Reader content.
- Promotion updates canonical content and `activeVersionId` in one Firestore transaction, marks the episode incomplete for revalidation, then deletes the former version only after the transaction commits. Failed cleanup is reported without rolling back the live promotion.
- `npm run smoke:completion` passes 7/7, including coverage failure and transaction/deletion ordering contracts.
