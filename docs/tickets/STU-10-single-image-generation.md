# STU-10 — Generate, regenerate, and select one image

- **Status:** tracked in [FEATURE_TRACKER.md](../FEATURE_TRACKER.md)
- **Depends on:** STU-07 (approved Story Moment plan), STU-09 (style canon and references)
- **Blocks:** STU-11, STU-12
- **Spec of record:** [EDITORIAL_DASHBOARD.md](../EDITORIAL_DASHBOARD.md)

## Outcome

The editor can generate one image for a Story Moment, review it, add prompt guidance, regenerate, and select the active candidate.

## Scope

### In scope

- Structured prompt assembly from canon, references, continuity, and Story Moment facts.
- One configurable platform image model.
- Private S3 upload and CloudFront delivery URL.
- Candidate history and active-candidate selection.
- Focal-point and safe-text metadata.
- Optional editor prompt additions.

### Out of scope

- Batch selection and concurrency (STU-11).
- AI-proposed image reuse approval flow, if deferred; the reuse visual type is planned in STU-07.
- Posting (STU-12).

## Spec context

Generation rules:

- The platform uses one configurable image model.
- Each generation request returns one image candidate.
- Single generation launches one request for one Story Moment.
- The default scene format is portrait 4:5 with focal-point and safe-text metadata.
- Maps and special illustrations may use a more appropriate ratio.
- Optional editor prompt additions are appended without replacing canon and continuity constraints.

Versions and reuse:

- Regeneration creates a new retained candidate.
- One candidate is selected as the active image.
- AI may propose reusing an existing image with new framing; the editor approves reuse.
- Upstream changes mark image candidates outdated but do not delete them.

Storage path: the worker uploads generated images to private S3 and writes CloudFront delivery URLs to Firestore. The Reader loads public CloudFront images backed by private S3.

## Domain objects touched

| Object | Role in this ticket |
| --- | --- |
| StoryMomentPlan | Supplies the facts and visual intention the prompt is built from |
| ImageCandidate | One generated or reused image option |
| Job | One image generation request per candidate |
| CostRecord | Estimated and actual image model cost |

## Acceptance

- [x] One generation request creates exactly one candidate.
- [x] Canon, references, continuity, and Story Moment facts are included automatically.
- [x] Optional editor prompt additions do not replace required constraints.
- [x] Regeneration retains previous candidates.
- [x] Only the selected candidate is active.
- [ ] The image is private in S3 and readable through its CloudFront URL.

## Verification notes

- Verify S3 privacy directly: a signed-out request to the S3 object URL must fail while the CloudFront URL succeeds.
- Prompt assembly should be a testable unit that returns the composed prompt, so the "additions do not replace constraints" criterion can be asserted without generating an image.
- One request equals one candidate is a hard rule. It shapes the batch design in STU-11, which fans out independent single-image requests rather than asking the model for several images.

## Implementation

- `assembleImagePrompt` composes immutable canon, reveal/spoiler constraints, Story Moment facts, matching timeline-valid continuity references, and finally the optional editor addition. Mismatched future appearance references are excluded and surfaced as warnings.
- Every editor action pre-creates exactly one candidate and one `images.moment.generate` job. The OpenRouter Image API request sets `n: 1` and rejects a response that does not contain exactly one image.
- Regeneration appends a candidate beneath the Story Moment. Selection changes only `activeImageCandidateId`; previous candidates stay retained and non-active.
- Scene images default to 4:5, maps to 3:2, and object studies to 1:1. Each candidate stores normalized focal-point and safe-text-area metadata editable in Studio.
- The worker writes objects with no public S3 ACL and stores the configured CloudFront URL. The final privacy checkbox remains open until the deployed bucket and distribution pass the signed-out HTTP check.
- `npm run smoke:images` verifies prompt composition, constraint precedence, reference timeline selection, warnings, and aspect ratio without spending on generation.
