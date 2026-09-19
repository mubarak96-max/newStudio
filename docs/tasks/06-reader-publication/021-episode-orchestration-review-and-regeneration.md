# Task 021 — Orchestrate, Review, and Complete an Episode

Status: Pending

Depends on: Task 020

## Outcome

The semi-automated pipeline produces an Episode for operator review; the operator can regenerate a requested scope or complete and mark the Episode as published.

## Scope

- Orchestrate planning, generation, processing, checks, repair, and compilation jobs.
- Enforce the shared persistent job contract for parent and child jobs, including scope, dependencies, input versions, idempotency keys, heartbeats, attempts, errors, provider request IDs, and output references.
- Apply separate concurrency and rate limits to OCR, OpenRouter text calls, OpenRouter image calls, AWS S3 transfers, and 2.5D processing.
- Add a recovery worker that detects stale job leases, resumes retryable work, and marks exhausted jobs with their actual terminal error.
- Add safe cleanup for abandoned Firebase Storage and AWS S3 objects only after proving that no Firestore record or active job references them.
- Surface Episode progress, blockers, cost, repair count, and composition reuse.
- Let the operator read the Episode exactly as a reader will.
- Support scoped regeneration of commentary, one Moment visual, one composition, one identity reference, or Episode pacing.
- Add an explicit completion action that records the exact accepted inputs, marks the Episode complete, and sets its publication status.
- Preserve locked and unrelated outputs.
- Keep review, regeneration, completion, and publication controls inside the Whole book preview tab.

## Acceptance criteria

- [ ] Normal production requires no intervention before Episode review.
- [ ] Job retries are idempotent and resume from completed stages.
- [ ] A stale worker lease can be recovered without creating duplicate records, provider charges, or assets.
- [ ] A parent job cannot complete while a required child is queued, running, or failed.
- [ ] The review screen lists zero unresolved blockers before completion.
- [ ] Scoped regeneration invalidates only proven dependents.
- [ ] Completion records the exact input and package versions.
- [ ] An Episode cannot be marked published while it has unresolved blockers or unaccepted visuals.
- [ ] Completing one Episode does not publish or regenerate any other Episode.
- [ ] Lint, orchestration, dependency, and regeneration tests pass.
- [ ] Recovery, concurrency-limit, stale-job, and duplicate-delivery tests pass.

## Not included

- Whole-book publication
- Manual asset editor
