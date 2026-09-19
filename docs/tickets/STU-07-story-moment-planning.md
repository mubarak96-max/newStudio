# STU-07 — Plan and approve one complete episode's Story Moments

- **Status:** tracked in [FEATURE_TRACKER.md](../FEATURE_TRACKER.md)
- **Depends on:** STU-06 (approved complete episode map)
- **Blocks:** STU-08, STU-10
- **Spec of record:** [EDITORIAL_DASHBOARD.md](../EDITORIAL_DASHBOARD.md)

## Outcome

The editor can generate a density-based Story Moment plan for the active episode and approve its complete source coverage.

## Scope

### In scope

- Dynamic Story Moment count driven by narrative density.
- Many-to-many paragraph-to-Story-Moment mapping.
- Primary text type and visual type per Story Moment.
- Reveal and spoiler constraints.
- Regeneration with editor locks.
- Story Moment reordering, adding, and deleting.

### Out of scope

- Producing the actual text (STU-08) or images (STU-10).
- Planning any episode other than the active one.
- A fixed or configurable Story Moment count.

## Spec context

Detailed Story Moment plans are generated only for the active episode. There is no fixed Story Moment count.

Each Story Moment plan includes:

- Ordered position and narrative purpose.
- Supporting source paragraph IDs.
- Characters, location, objects, and character states.
- Reveal and spoiler constraints.
- Primary text type: `dialogue`, `excerpt`, or `commentary`.
- Visual type: scene, illustration, map, object, or permitted image reuse.
- Visual intention and preliminary framing.
- Optional hotspot plan only for objects, illustrations, or maps.

Paragraph-to-Story Moment mapping is many-to-many. Every main-narrative paragraph must be mapped or explicitly excluded with a reason.

The complete episode Story Moment plan is approved before image generation begins.

## Domain objects touched

| Object | Role in this ticket |
| --- | --- |
| EpisodePlan | Defines the active episode's paragraph range |
| BookBibleEntry | Supplies characters, locations, objects, and reveal timing |
| Paragraph | Mapped many-to-many to Story Moments |
| StoryMomentPlan | Internal plan for a future or posted Story Moment |
| Job | Story Moment planning and regeneration jobs |

## Acceptance

- [x] No fixed Story Moment count is imposed.
- [x] Every in-scope paragraph is mapped or explicitly excluded.
- [x] Each Story Moment has one primary text type and one visual intention.
- [x] The editor can edit, add, delete, reorder, and regenerate Story Moments.
- [x] Locked editor changes survive regeneration.
- [x] Image generation is unavailable until the full Story Moment plan is approved.

## Verification notes

- Coverage is per-episode here, unlike STU-06's whole-book coverage. The validator should report unmapped paragraphs within the active episode range only.
- Locks reuse the STU-05 field-lock model. Prefer extending it over introducing a second locking mechanism.
- Hotspot plans are optional and restricted to objects, illustrations, and maps. Reject a hotspot plan attached to a scene at plan time, not at posting time.

## Implementation

- `npm run smoke:moments` runs `momentCoverageProblems`, `momentRejection`, `reorderMoments`, `activeEpisodeId`, `normaliseMoment`, and `mergeMoments` against fully mapped, gapped, excluded, out-of-range, and locked plans. 21 checks, all passing.
- Coverage is checked inside the active episode's paragraph range only. Many-to-many mapping means an overlap is never a problem here; only an unmapped paragraph without an exclusion reason is.
- No code path caps or targets the Story Moment count. The episode's `momentEstimate` is passed to the model as a range explicitly labelled "never a target".
- Locks reuse the STU-05 model: an editor write sets `locked` and `source: "editor"`, and `mergeMoments` keeps every locked Story Moment while replacing the unlocked ones.
- A hotspot plan on a `scene` or `reuse` moment is refused by `momentRejection` on the write path and again at approval. The worker drops such a plan from AI output instead of failing the job, and reports it in the job result's `rejections`.
- `canGenerateImages` in `src/lib/moments/types.ts` is the gate STU-10 must read; nothing generates images yet, so the gate is implemented but unexercised.
- The panel renders inside each episode card, but has not been opened in a browser and the OpenRouter planning call has never run, so the editing box is unverified rather than unimplemented.
