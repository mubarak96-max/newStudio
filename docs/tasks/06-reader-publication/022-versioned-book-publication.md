# Task 022 — Publish a Versioned Book

Status: Pending

Depends on: Task 021

## Outcome

Completed Episodes can be assembled into a versioned public Book without exposing production records.

## Scope

- Create a public Reader contract separate from production contracts.
- Require every included Episode to be complete and marked published.
- Build and store a versioned publication manifest.
- Run publication preflight, Episode-package validation, and manifest construction as an idempotent background job.
- Add Book-level publish and rollback controls.
- Keep activation and rollback synchronous atomic operations against an already-built manifest.
- Serve only current and nearby reader assets at runtime.
- Record publication provenance and compatibility versions.
- Keep Book publishing, version history, and rollback controls inside the Whole book preview tab.

## Acceptance criteria

- [ ] A publication references immutable Episode package versions.
- [ ] Closing the workspace does not interrupt publication preflight or manifest construction.
- [ ] Retrying identical publication inputs reuses the existing manifest version instead of duplicating it.
- [ ] Rolling back changes the active manifest without deleting newer work.
- [ ] Production prompts, diagnostics, and internal metadata are not public.
- [ ] The Reader fails safely on unsupported package versions.
- [ ] Lint, build, publication, rollback, and contract tests pass.

## Not included

- Public marketplace or payments
- Multi-tenant operator permissions
