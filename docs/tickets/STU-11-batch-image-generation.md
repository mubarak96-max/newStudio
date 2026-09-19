# STU-11 — Generate a selected batch of Story Moment images

- **Status:** tracked in [FEATURE_TRACKER.md](../FEATURE_TRACKER.md)
- **Depends on:** STU-10 (single image generation, candidates, cost recording)
- **Blocks:** nothing directly
- **Spec of record:** [EDITORIAL_DASHBOARD.md](../EDITORIAL_DASHBOARD.md)

## Outcome

The editor can select multiple ready Story Moments and generate one candidate for each while monitoring the batch.

## Scope

### In scope

- Eligibility checks for batch entry.
- Batch selection UI.
- A batch parent job with independent child requests.
- A concurrency limit inside the active episode.
- Partial failure handling and per-child retry.
- Batch cost estimate and actual cost.

### Out of scope

- Multiple image candidates returned by one generation request; this is explicitly excluded from V1.
- Any change to how a single candidate is generated or selected (STU-10 owns that).

## Spec context

Generation rules:

- Batch generation launches multiple independent one-image requests for selected Story Moments.
- Up to three requests may execute concurrently inside the active episode.

Job rules the batch must respect:

- Work is checkpointed at meaningful units so restarts resume safely.
- Idempotency keys prevent completed AI operations from being charged twice.
- Explicit regeneration intentionally creates a new billable operation.
- Studio shows estimated and actual cost per job, episode, and book.

Single and batch image generation share the same candidate and version workflow — the batch is a fan-out over the STU-10 path, not a second generation path.

## Domain objects touched

| Object | Role in this ticket |
| --- | --- |
| StoryMomentPlan | Eligibility source; only approved, image-ready plans qualify |
| ImageCandidate | One per child request, identical in shape to STU-10 output |
| Job | Batch parent job plus one child job per Story Moment |
| CostRecord | Estimated and actual batch cost |

## Acceptance

- [x] Only approved, image-ready Story Moments can enter a batch.
- [x] Each selected Story Moment receives one independent image request.
- [x] No more than three requests run concurrently by default.
- [x] A failed child does not discard successful candidates.
- [x] Retrying a failed child does not regenerate completed children.
- [x] The editor sees estimated and actual batch cost.

## Verification notes

- Force a mid-batch failure to test the partial-failure and retry criteria together; both fail silently if only the happy path is exercised.
- The retry criterion is an idempotency test, so assert on the number of model calls and the cost ledger, not only on the visible candidates.
- "By default" in the concurrency criterion implies the limit is configurable. Confirm whether it is editor-facing or a server constant.

## Implementation

- Batch creation re-runs the STU-10 gates, pre-creates one ordinary candidate and one `images.moment.generate` child per selected Story Moment, and links them to an `images.batch.generate` parent.
- Parent-owned queued children are excluded from the general worker claim loop. The parent runs them through the shared STU-10 generator with a concurrency pool capped at three; `IMAGE_BATCH_CONCURRENCY` may lower that cap.
- Each child checkpoints its own candidate and cost record. A resumed parent skips candidates already marked ready, so completed children are not regenerated or charged again.
- The parent uses settled results: successful candidates remain ready when another child fails. Failed child jobs appear in the existing Jobs panel and its Retry action requeues only that child and candidate.
- The episode stores the latest batch status, selected/completed/failed counts, configured estimate, and accumulated actual OpenRouter cost for the Studio display.
- `npm run smoke:batch` forces one child failure and verifies five independent calls, a peak concurrency of three, retained successes, and failure-only retry targeting.
