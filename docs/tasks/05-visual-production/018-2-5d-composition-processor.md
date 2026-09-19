# Task 018 — Convert a Composition into a 2.5D Package

Status: Pending

Depends on: Task 017

## Outcome

An accepted master composition becomes a versioned runtime package of semantic layers, depth, and safe camera metadata.

## Scope

- Segment the master into semantic layers.
- Run 2.5D conversion as a resumable background parent job with segmentation, depth, hidden-area reconstruction, asset persistence, and package compilation children.
- Generate master depth and per-layer depth only where useful.
- Classify layers as flat, depth, or special.
- Reconstruct hidden areas exposed by approved camera movement.
- Compile flat planes or shallow meshes.
- Calculate a safe camera envelope.
- Store the package manifest and binary asset references.
- Store each completed package reference in the Episode's `visuals.twoPointFiveD` map and any relevant Reading Beat `visuals` map.
- Present processing status, package diagnostics, and retries inside the 2.5D Composition section of the Visuals generation tab.

## Acceptance criteria

- [ ] Every package reference resolves to a decodable asset.
- [ ] Missing depth can fall back to a flat layer without corrupting the package.
- [ ] Camera movement cannot exceed the safe envelope.
- [ ] Hidden-area gaps are repaired before package acceptance.
- [ ] Reprocessing one composition leaves unrelated packages unchanged.
- [ ] Retrying a failed processing child resumes from accepted upstream artifacts instead of restarting the composition.
- [ ] The parent job exposes its current child step and cannot complete until all required package assets resolve.
- [ ] Lint, schema, asset-integrity, and processor tests pass.

## Not included

- GLB assets
- Rigging, skeletal animation, or physics
- Free camera navigation
