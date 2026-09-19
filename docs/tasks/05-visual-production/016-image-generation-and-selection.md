# Task 016 — Generate Master Compositions

Status: Pending

Depends on: Task 015

## Outcome

An operator can generate required visuals individually or in a selected bulk run, with exactly one output produced for each requested visual.

## Scope

- Add an OpenRouter image-generation adapter using the application's single server-side API key and a fixed model identifier.
- Construct prompts from the visual plan and canonical references.
- Generate foundational character, location, object, and map references before dependent Episode and Reading Beat visuals.
- Support one-at-a-time generation and selected bulk generation through the same per-visual contract.
- Run every requested visual as its own idempotent background job.
- Represent selected bulk generation as a parent job that fans out independent single-output visual jobs.
- Produce one output per requested visual; do not generate candidate sets or require candidate selection.
- Save generated images in AWS S3.
- Persist provider request IDs so an interrupted worker can resume or reconcile an in-flight generation.
- Persist generated assets to AWS S3 in a separate child step before writing the final Firestore URL and generation state to the owning Episode or Reading Beat visual map.
- Show composition previews in Episode context.
- Keep individual generation and selected bulk generation inside the Image Generation section of the Visuals generation tab.

## Acceptance criteria

- [ ] Generation uses canonical references rather than character names alone.
- [ ] Individual and bulk generation share the same contracts.
- [ ] Every requested visual produces exactly one generated image per attempt.
- [ ] Refreshing or closing the workspace does not interrupt image generation.
- [ ] Retrying one failed bulk child preserves every successful sibling image.
- [ ] A bulk parent reports selected, queued, running, complete, and failed image counts.
- [ ] Dependent visuals cannot start until their required canonical references exist.
- [ ] Every completed image has a resolvable AWS S3 URL stored in Firestore.
- [ ] A generation job is not complete until its AWS S3 persistence child succeeds.
- [ ] Every attempt has provenance and measured cost.
- [ ] The workspace exposes no model picker or generation-settings panel.
- [ ] Generating an output updates only the requested visual.
- [ ] Lint, adapter, persistence, ordering, and single-output tests pass.

## Not included

- Layer segmentation
- Depth generation
- Final reader rendering
