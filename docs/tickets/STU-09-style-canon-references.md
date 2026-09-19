# STU-09 — Approve the style canon and reusable visual references

- **Status:** tracked in [FEATURE_TRACKER.md](../FEATURE_TRACKER.md)
- **Depends on:** STU-05 (Book Bible facts describing characters, locations, and objects)
- **Blocks:** STU-10
- **Spec of record:** [EDITORIAL_DASHBOARD.md](../EDITORIAL_DASHBOARD.md)

## Outcome

The editor can establish visual consistency before generating episode scenes.

## Scope

### In scope

- A book-specific style canon.
- Character reference sheets.
- Timeline-aware appearance states.
- On-demand references for recurring locations and important objects.
- Reference approval and regeneration.

### Out of scope

- Story Moment scene generation (STU-10).
- Batch operations (STU-11).

## Spec context

Style canon: each book has an approved style canon defining medium, palette, lighting, period accuracy, realism, composition, recurring motifs, and prohibited tendencies.

Reference assets:

- Major recurring characters require approved reference sheets before Episode 1 images.
- Recurring locations and important objects receive references when first needed.
- Character appearance states are timeline-aware so later changes do not leak into earlier Story Moments.

Generation rules that apply to reference images as well as scenes: the platform uses one configurable image model, each generation request returns one image candidate, and regeneration creates a new retained candidate.

Timeline awareness connects to the objective blocker "character or location continuity contradiction" checked in STU-12.

## Domain objects touched

| Object | Role in this ticket |
| --- | --- |
| Book | Owns the style canon |
| BookBibleEntry | Supplies appearance states, relationships, and object facts |
| ImageCandidate | Reference sheet candidates and their history |
| Job | Reference generation jobs |
| CostRecord | Reference generation is billable image work |

## Acceptance

- [x] The style canon captures required and prohibited visual properties.
- [x] Major recurring characters have approved references before Episode 1 scene generation.
- [x] References retain prompt, model, source facts, and candidate history.
- [x] Later appearance states cannot be used in earlier Story Moments without a warning.
- [x] Recurring locations and objects can receive references when first needed.

## Verification notes

- Appearance states need a position on the source timeline, expressed in paragraph IDs, or the leak warning cannot be computed.
- Resolved by dropping the distinction: the gate applies to every named character and location, so no major/minor definition is needed.
- The appearance-state warning is a warning, not a blocker, consistent with the rule that subjective assessments never block posting by themselves. Confirm which side of that line this check falls on before implementing it as a hard gate.

## Implementation

- `momentReferenceProblems` gates image readiness in every episode until each character and location a Story Moment names has an active approved candidate. A name with no reference row at all is a problem in its own right. This replaced an Episode 1 only, major-characters-only gate; the "major recurring character" flag had no consumer left and was removed.
- Character references require a named appearance state and permanent paragraph start/end positions. `appearanceStateWarning` reports a mismatched timeline state as a warning, not a blocker.
- Each reference-generation request pre-creates one candidate, calls OpenRouter's dedicated image endpoint with `n: 1`, and retains every prior candidate. Candidate records store the exact composed prompt, configured model, source-fact snapshot, editor addition, S3 key, and CloudFront URL.
- Character, location, and object references use the same on-demand creation and candidate workflow. Regeneration never overwrites or deletes history.
- Runtime configuration requires `OPENROUTER_IMAGE_MODEL`, `AWS_REGION`, `AWS_S3_BUCKET`, and `CLOUDFRONT_BASE_URL`.
- `npm run smoke:visual` covers canon completeness, prohibited tendencies, timeline states and warnings, and the character and location reference gate.
