# STU-14 — Operate jobs, models, retries, and budgets

- **Status:** tracked in [FEATURE_TRACKER.md](../FEATURE_TRACKER.md)
- **Depends on:** STU-01 (job records and the polling worker); benefits from every ticket that enqueues work
- **Blocks:** nothing; it hardens what the other tickets rely on
- **Spec of record:** [EDITORIAL_DASHBOARD.md](../EDITORIAL_DASHBOARD.md)

## Outcome

The editor can understand and control pipeline activity and spending without using the terminal for routine recovery.

## Scope

### In scope

- Job dashboard.
- Checkpoints and resume.
- Idempotency keys.
- Cancel and retry.
- Per-task OpenRouter model settings.
- Cost ledger with estimated and actual cost.
- Budget confirmation.
- Stale-work indicators for outdated dependent work.

### Out of scope

- Cloud-hosted pipeline execution; the worker stays local in V1.
- Automatic deletion or regeneration of outdated work.

## Spec context

Jobs, retries, and costs:

- Every book owns one `books/{bookId}/jobs/allJobs` document whose `jobs` map contains that book's queued, running, completed, failed, and cancelled jobs.
- The local worker polls for queued jobs and claims them transactionally.
- Polling, presence heartbeats, running-job heartbeats, and progress writes occur no more frequently than once per minute; terminal state changes remain immediate.
- Work is checkpointed at meaningful units so restarts resume safely.
- Idempotency keys prevent completed AI operations from being charged twice.
- Explicit regeneration intentionally creates a new billable operation.
- The editor can select an OpenRouter model per editorial task.
- Studio shows estimated and actual cost per job, episode, and book.
- Exceeding a configurable book budget requires confirmation.

Staleness rule from the visual system, generalised here: a later source correction creates a new revision, preserves unaffected IDs, and marks dependent work outdated. Upstream changes mark image candidates outdated but do not delete them.

## Domain objects touched

| Object | Role in this ticket |
| --- | --- |
| Job | Gains stage, progress, heartbeat, checkpoints, and failure detail |
| CostRecord | Estimated and actual model usage cost per job, episode, and book |
| Book | Holds the configurable budget |
| SourceRevision | Revision changes are what mark dependent work stale |

## Acceptance

- [x] Jobs expose stage, progress, heartbeat, cost, and actionable failure details.
- [x] All jobs are stored under their owning book in `jobs/allJobs`.
- [x] Periodic worker writes are no more frequent than once per minute.
- [x] Interrupted work resumes at the last safe checkpoint.
- [x] Retrying does not charge again for saved completed units.
- [x] Explicit regeneration is clearly identified as billable.
- [x] Each editorial task can use a configured model.
- [x] Exceeding the configured book budget requires editor confirmation.
- [x] Upstream changes mark dependent work outdated without automatic deletion.

## Verification notes

- Resume and idempotency are best tested by killing the worker mid-job and restarting it, then comparing the model-call count and cost ledger against an uninterrupted run.
- "Actionable failure details" means the editor can decide between retry and edit without reading worker logs. Judge it against that bar.
- Parts of this ticket land incrementally with earlier tickets. When they do, record it here so the acceptance list stays the single place the feature is signed off.
- The single-map layout must be monitored against Firestore's document-size limit; archiving or pruning is required before a book's job history approaches that limit.

## Implementation

- Job records now carry stage, one-minute progress/heartbeat, safe checkpoint, estimate, actual cost, selected model, idempotency key, regeneration flag, and actionable failure detail. Cancel, retry, and over-budget confirmation are editor actions.
- Episode-map and Story Moment planners persist each completed model-call unit and resume saved units. Bible chunks and batch candidates retain their existing unit checkpoints. A completed-operation ledger closes the crash window between expensive work and terminal job status.
- Retries retain the same idempotency key; explicit regeneration receives a new billable key. Cost recording is transactional and refuses to increment the book twice for the same job.
- The book panel configures a model for each of eight AI task types and a dollar budget. The worker freezes the selected model onto the claimed job and moves projected over-budget work into `waiting_confirmation` until the editor confirms it.
- Job, episode, and book estimated/actual costs are shown in Studio. Approving a corrected source marks dependent source work and its image candidates stale without deleting them.
- `npm run smoke:operations` passes 12/12. A real worker kill/restart and OpenRouter ledger comparison remain deployment verification, so the tracker stays In review.
