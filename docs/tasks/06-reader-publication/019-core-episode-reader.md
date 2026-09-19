# Task 019 — Read One Episode End to End

Status: Pending

Depends on: Task 018

## Outcome

A reader can open one compiled Episode, read exact text, and move deterministically through its Beats and compositions.

## Scope

- Compile the public Episode package.
- Run Episode package compilation and asset-reference validation as an idempotent background job.
- Render exact HTML text over a full-viewport 2.5D composition.
- Implement deterministic Next and Previous.
- Run controlled push, pan, focus, fade, and dissolve transitions.
- Stop continuous rendering after a transition settles.
- Preload the next likely composition and retain the previous one when useful.
- Let the operator choose an Episode and preview it exactly as the reader will experience it.
- Embed the production reader inside the Whole book preview tab.

## Acceptance criteria

- [ ] Exact source text remains readable and is never baked into imagery.
- [ ] Next and Previous always reach the expected Beat.
- [ ] Progress cannot advance before the destination is ready.
- [ ] A failed optional depth asset degrades safely.
- [ ] Refreshing the workspace does not interrupt compilation and retrying identical inputs does not create a duplicate package version.
- [ ] The scene becomes still while the reader reads.
- [ ] Lint, build, navigation, and reader tests pass.

## Not included

- Inspect Mode
- Text Focus Mode
- Cross-device progress
