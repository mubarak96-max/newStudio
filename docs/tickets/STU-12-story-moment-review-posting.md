# STU-12 — Review and post a complete Story Moment

- **Status:** tracked in [FEATURE_TRACKER.md](../FEATURE_TRACKER.md)
- **Depends on:** STU-08 (verified text), STU-10 (an active image candidate)
- **Blocks:** STU-13
- **Spec of record:** [EDITORIAL_DASHBOARD.md](../EDITORIAL_DASHBOARD.md)

## Outcome

The editor can inspect a Story Moment as readers will see it, pass objective checks, and post it live.

## Scope

### In scope

- Composed reader-accurate preview.
- Source and evidence inspection from the preview.
- The Story Moment objective check suite.
- Warnings that do not block.
- The post action and the canonical active version.
- Reader visibility of posted content.

### Out of scope

- Episode-level completion checks and republication (STU-13).
- Automatic publication without editor action.
- A public draft state; every canonical posted Story Moment is live.

## Spec context

Posting rules:

- Studio and Reader share one Firebase project and book data hierarchy.
- There is no separate public snapshot collection.
- Internal plans, jobs, and generation candidates are not posted Story Moments.
- When the editor posts a Story Moment, its active version becomes immediately readable by the Reader.
- Every canonical posted Story Moment is live; there is no public draft state.
- A partially produced episode may expose the Story Moments already posted.

Story Moment blockers, all objective:

- Missing or invalid source mapping.
- Exact dialogue or excerpt mismatch.
- Missing required primary text.
- Missing, failed, or inaccessible active image.
- Character or location continuity contradiction.
- A reveal appearing before its source-supported point.
- Invalid hotspot target or coordinates.

Subjective visual or writing assessments appear as warnings and never block posting by themselves.

## Domain objects touched

| Object | Role in this ticket |
| --- | --- |
| StoryMomentPlan | The internal plan being reviewed |
| ImageCandidate | The active image the preview renders |
| PostedStoryMoment | Canonical Reader-visible Story Moment and active version |
| Episode | Ordered collection of posted Story Moments |

## Acceptance

- [x] Preview contains the selected image, primary text, title/context, and allowed hotspots.
- [x] Objective Story Moment check failures block posting; subjective warnings do not.
- [x] Posting writes/promotes a canonical posted Story Moment in Firestore.
- [ ] The Reader can access the Story Moment immediately.
- [ ] Internal jobs, plans, and unselected candidates remain inaccessible to the Reader.

## Verification notes

- Reader isolation is a Firestore rules test, not a UI test. Attempt to read a plan, a job, and an unselected candidate as an unauthenticated Reader client and confirm each is denied.
- Every blocker in the list needs a case that triggers it. A check suite that has never returned a failure has not been verified.
- "Inaccessible active image" includes a broken CloudFront URL, not only a missing candidate reference.

## Implementation

- The review panel composes the selected CloudFront image, episode context, primary text, and normalized hotspot overlays, with source/evidence available separately to the editor.
- Posting revalidates source mapping, exact text, commentary evidence, active-image delivery, continuity, reveal timing, hotspot targets, coordinates, and stale candidates. Objective problems block; candidate warnings remain non-blocking.
- Canonical content lives at `books/{bookId}/episodes/{episodeId}/storyMoments/{momentId}` with an active internal version. The public projection intentionally removes paragraph IDs, evidence spans, editor identity, jobs, plans, and unselected candidates.
- `npm run smoke:posting` passes 11 blocker cases and 5 Firestore-rules contract checks. Reader access/isolation checkboxes remain open until the rules are deployed and probed with an unauthenticated Firebase client.
