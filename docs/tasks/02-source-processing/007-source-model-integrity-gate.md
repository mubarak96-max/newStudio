# Task 007 — Build and Gate the Verified Source Model

Status: Completed

Depends on: Task 006

## Outcome

The Book receives an immutable, versioned verified narrative only after deterministic integrity checks pass across all `verifiedParagraphs` ranges.

## Scope

- Compile the ordered `verifiedParagraphs` range documents into one canonical Book order while retaining chapter and section metadata when available.
- Run full-Book compilation and integrity validation as an idempotent background job using the approved verification job outputs.
- Assign persistent paragraph IDs.
- Detect gaps, unintended duplicates, invalid references, invalid encoding, and unresolved blockers.
- Validate that every range contains no more than 50 source pages and remains below Firestore's document-size limit.
- Preserve both page-local order and deterministic whole-book `globalOrder` for every paragraph.
- Show the integrity report in the Text correction tab.
- Prevent downstream understanding while the gate fails.

## Acceptance criteria

- [x] All verified paragraphs have unique persistent IDs.
- [x] Every verified paragraph exists in exactly one page-range document.
- [x] Range boundaries have no unexplained gaps or overlaps.
- [x] No range document contains more than 50 source pages or exceeds Firestore's document-size limit.
- [x] Canonical source order is deterministic.
- [x] Integrity failures block the next stage.
- [x] Refreshing the workspace does not interrupt the gate and retrying it does not create another Source Model for identical inputs.
- [x] The report lists exact missing, duplicate, or invalid units.
- [x] Passing the gate creates a versioned immutable Source Model.
- [x] Lint and integrity tests pass.

## Not included

- Entity or event extraction
- Story planning
- Source-model mutation after approval
