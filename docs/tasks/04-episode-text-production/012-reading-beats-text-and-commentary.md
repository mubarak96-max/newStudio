# Task 012 — Generate Reading Beats, Exact Text, and Commentary

Status: Pending

Depends on: Task 011

## Outcome

Each Story Moment becomes a readable sequence of exact source text and optional source-bounded commentary.

## Scope

- Generate Reading Beats within Story Moments.
- Run Reading Beat and commentary generation as background work fanned out by Episode and Story Moment.
- Use the configured fixed OpenRouter text model for Beat planning and commentary; expose no model settings.
- Reference exact paragraph or text spans from `verifiedParagraphs`.
- Retrieve readable text at runtime instead of copying independent AI-generated text.
- Generate clearly separated commentary using only spoiler-safe context.
- Model deterministic Next and Previous ordering.
- Persist each Beat in its Episode document's `readingBeats` map with its Story Moment ID, exact-text references, ordering, commentary, and a `visuals` reference map.
- Render Reading Beats as nested collapsibles inside their parent Story Moment on the Episodes planning tab.

## Acceptance criteria

- [ ] Displayed book text exactly matches the referenced verified source.
- [ ] All text references resolve.
- [ ] Commentary is labeled and stored separately from source text.
- [ ] Commentary cannot use knowledge beyond the allowed reveal boundary.
- [ ] Next and Previous resolve across Moment and Episode boundaries.
- [ ] Retrying one failed Story Moment preserves completed Beats and commentary outside that Moment.
- [ ] The parent job completes only after ordering and exact-text reference validation pass.
- [ ] Reading Beats do not use a separate workspace tab or page.
- [ ] Every persisted Reading Beat has a `visuals` map, even when it is initially empty.
- [ ] Every Beat remains visibly associated with its parent Story Moment.
- [ ] Lint, exact-text, ordering, and context-boundary tests pass.

## Not included

- Final reader presentation
- Visual plans
- Image generation
