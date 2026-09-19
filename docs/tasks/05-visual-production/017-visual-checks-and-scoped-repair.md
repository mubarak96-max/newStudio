# Task 017 — Manually Check and Regenerate Visual Compositions

Status: Pending

Depends on: Task 016

## Outcome

An operator manually checks each generated visual and can accept it or regenerate only that visual with an optional improved prompt.

## Scope

- Present visual checks one composition at a time within its Episode and Reading Beat context.
- Let the operator review identity, subject count, continuity, anatomy, era, framing, and obvious artifacts.
- Record accepted or rejected status plus optional review notes.
- Keep manual accept/reject and prompt entry synchronous; accepting a visual does not require a worker.
- Regenerate a rejected visual as one new attempt using either its existing prompt or an optional improved prompt supplied for that attempt.
- Enqueue regeneration as a new visual-scoped background job linked to the rejected attempt.
- Save the replacement in AWS S3 and update only that visual's Firestore reference after generation succeeds.
- Preserve prior attempts, accepted visuals, and unaffected work.
- Present checks and regeneration actions inside the Visual Checks section of the Visuals generation tab.

## Acceptance criteria

- [ ] Every composition has an explicit pending, accepted, or rejected manual-review status.
- [ ] Unaccepted visuals cannot enter 2.5D processing.
- [ ] Regeneration creates one new image and preserves the prior attempt.
- [ ] An improved prompt is optional and applies only to the requested regeneration.
- [ ] Requesting regeneration returns a job ID and remains observable after the workspace closes.
- [ ] Regenerating one composition does not regenerate its Episode or other selected images.
- [ ] Operator decisions and regeneration history remain auditable.
- [ ] Lint and regeneration-scope tests pass.

## Not included

- Segmentation and depth
- Episode completion or publication
