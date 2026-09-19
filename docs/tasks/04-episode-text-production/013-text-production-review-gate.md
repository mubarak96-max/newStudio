# Task 013 — Complete the Text Production Review Gate

Status: Pending

Depends on: Task 012

## Outcome

An operator can verify the complete text structure before any expensive visual generation begins.

## Scope

- Present Book, Episode, Moment, and Beat totals.
- Run whole-Book totals, coverage, ordering, reference integrity, and blocker detection as an idempotent background validation job.
- Present paragraph coverage and reference-integrity results.
- Preview every Episode in deterministic reading order.
- Surface unresolved entity, timeline, commentary, and source issues.
- Present the complete gate inside the Episodes planning tab.
- Add a `Text production ready` gate.
- Block visual generation until all hard checks pass.

## Acceptance criteria

- [ ] Coverage is 100% with no unintended duplicate ownership.
- [ ] Every exact-text reference resolves to the approved Source Model version.
- [ ] Every Episode, Moment, and Beat has deterministic ordering.
- [ ] Blocking issues name the exact affected records.
- [ ] Passing the gate records the approved input versions for visual production.
- [ ] The validation job resumes after interruption and returns exact affected record IDs for every failure.
- [ ] Lint and gate tests pass.

## Not included

- Visual continuity
- Image generation
