# Editorial Studio

Product and technical specification for the internal dashboard that turns a fiction book into a visual, Story Moment by Story Moment reading experience.

## Status

- Product stage: Planning
- Version: V1
- Editor: One internal editor
- Authentication: Google sign-in restricted to one allowlisted email
- Related documents: [Vertical tickets](./VERTICAL_TICKETS.md) and [feature tracker](./FEATURE_TRACKER.md)

## Product objective

The Studio accepts an EPUB, text PDF, or scanned PDF and helps one editor transform it into episodes containing illustrated Story Moments, exact dialogue or excerpts, commentary, maps, and object illustrations. AI performs the expensive analysis and generation work; the editor approves facts, structure, text, visuals, and posting.

V1 covers fiction only.

## Core principles

1. Preserve a traceable relationship between the source and every generated fact or Story Moment.
2. Use stable paragraph IDs after extraction approval.
3. Let AI propose and the editor approve.
4. Lock editor corrections so regeneration cannot silently overwrite them.
5. Plan the whole book before producing one episode at a time.
6. Use narrative density and source coverage rather than a fixed Story Moment count.
7. Keep exact dialogue and excerpts verifiably exact.
8. Generate one image candidate per request, while allowing one or many requests to be launched together.
9. Allow individual Story Moments to be posted and become live immediately.
10. Block posting only on objective failures.

## V1 scope

### Included

- EPUB, text PDF, and scanned PDF upload.
- Parser/OCR-first extraction.
- AI assistance for uncertain text, reading order, paragraph boundaries, and chapter detection.
- Manual extraction cleanup and approval.
- Hierarchical analysis with source-linked facts.
- Editable Book Bible with locked editor overrides.
- Complete episode-map planning and approval.
- Detailed Story Moment planning for one episode at a time.
- Exact dialogue and excerpt selection with source validation.
- Editable commentary.
- Book-specific style canon.
- Character reference sheets and on-demand references for recurring locations and objects.
- Single and batch image-generation controls.
- Image candidate history, regeneration, selection, and AI-proposed reuse.
- Story Moment review and immediate posting.
- Episode completion checks and versioned republication.
- Job progress, retry, cost estimation, and actual-cost tracking.

### Not included

- Non-fiction editorial workflows.
- Multiple editors, roles, comments, or assignments.
- Public editor registration.
- Cloud-hosted pipeline execution in V1.
- Automatic publication without editor action.
- Multiple image candidates returned by one generation request.
- Automatic deletion or regeneration of outdated work.

## End-to-end editorial flow

```text
Upload book file and create its book record
  -> deterministic parsing or OCR
  -> AI resolves flagged uncertainty
  -> editor cleans and approves extraction
  -> permanent paragraph IDs are frozen
  -> hierarchical AI analysis
  -> editor edits and approves Book Bible
  -> AI creates the complete episode map
  -> editor approves episode ranges and coverage
  -> produce one episode
       -> generate and approve Story Moment plan
       -> select exact text or create commentary
       -> approve visual plan
       -> generate one image or a batch
       -> review each complete Story Moment
       -> run objective checks
       -> post Story Moment immediately
  -> mark episode complete after episode-level checks
  -> move to the next episode
```

## Runtime architecture

```text
Next.js Studio on Firebase App Hosting
  -> Firebase Authentication
  -> Firestore editorial data and per-book job maps
  -> Firebase Storage source uploads

Local Node.js pipeline worker
  -> polls books/{bookId}/jobs/allJobs
  -> parses files and runs OCR
  -> calls OpenRouter task models
  -> calls the platform image model
  -> uploads generated images to private S3
  -> writes CloudFront delivery URLs and results to Firestore

Reader application
  -> reads posted content from the same Firebase project
  -> loads public CloudFront images backed by private S3
```

The worker is started separately with `npm start`. The Studio can enqueue, cancel, and retry work but cannot start a process on the editor's computer.

## Extraction

### EPUB

- Walk the EPUB table of contents and document spine.
- Extract readable text and structural chapter information.
- Remove markup without using AI as the default extraction mechanism.

### Text PDF

- Extract positioned text.
- Reconstruct reading order, paragraphs, repeated headers, footers, and page numbers using deterministic rules.
- Flag ambiguous layouts for AI assistance.

### Scanned PDF

- Render and OCR pages locally or through the selected OCR provider.
- Preserve page references and confidence information.
- Send only uncertain regions or structural ambiguities to AI.

### Review and approval

- Extraction begins with temporary paragraph identifiers.
- The editor may correct text, reorder content, split or merge paragraphs, and correct chapter boundaries.
- AI may propose corrections to flagged uncertainty; the editor accepts or rejects them.
- Approval freezes permanent paragraph IDs and creates an immutable source revision.
- A later source correction creates a new revision, preserves unaffected IDs, and marks dependent work outdated.

## Hierarchical analysis and Book Bible

Analysis processes chapters or safe-sized source sections before synthesizing whole-book knowledge. The resulting Book Bible includes:

- Characters, aliases, relationships, appearance states, goals, and changes.
- Locations and their visual or narrative properties.
- Recurring objects, creatures, symbols, costumes, and terminology.
- Chronology, major events, reveals, and causality.
- Chapter summaries and whole-book narrative structure.
- Facts that become visible only at their exact revealing point.

Every factual entry must reference the permanent paragraph IDs that support it. Entries are editable. An editor-modified field becomes a locked override; regeneration updates only unlocked AI fields.

Book Bible approval is required before episode-map generation.

## Episode map

The AI plans all episodes before detailed Story Moment work begins. Each episode contains:

- Working title.
- Narrative purpose.
- Start and end paragraph IDs.
- Major developments, characters, locations, and reveals.
- An estimated Story Moment range based on narrative density.

The complete map must have continuous main-narrative coverage before approval. Moving a boundary automatically adjusts the neighbouring episode. Gaps and unintended overlaps block approval.

## Story Moment planning

Detailed Story Moment plans are generated only for the active episode. There is no fixed Story Moment count.

Each Story Moment plan includes:

- Ordered position and narrative purpose.
- Supporting source paragraph IDs.
- Characters, location, objects, and character states.
- Reveal and spoiler constraints.
- Primary text type: `dialogue`, `excerpt`, or `commentary`.
- Visual type: scene, illustration, map, object, or permitted image reuse.
- Visual intention and preliminary framing.
- Optional hotspot plan only for objects, illustrations, or maps.

Paragraph-to-Story Moment mapping is many-to-many. Every main-narrative paragraph must be mapped or explicitly excluded with a reason.

The complete episode Story Moment plan is approved before image generation begins.

## Text rules

- Dialogue and exact excerpts are selected from contiguous source spans.
- A validator compares exact text character-for-character with the approved source revision.
- The editor changes exact text by selecting a different source span, not by silently rewriting it.
- Non-contiguous dialogue remains separate entries.
- Commentary is AI-proposed, paraphrased, source-linked, and freely editable.
- Commentary length follows what the Story Moment needs; it is normally concise.
- Every Story Moment has one primary text type.

## Visual system

### Style canon

Each book has an approved style canon defining medium, palette, lighting, period accuracy, realism, composition, recurring motifs, and prohibited tendencies.

### Reference assets

- Major recurring characters require approved reference sheets before Episode 1 images.
- Recurring locations and important objects receive references when first needed.
- Character appearance states are timeline-aware so later changes do not leak into earlier Story Moments.

### Generation

- The platform uses one configurable image model.
- Each generation request returns one image candidate.
- Single generation launches one request for one Story Moment.
- Batch generation launches multiple independent one-image requests for selected Story Moments.
- Up to three requests may execute concurrently inside the active episode.
- The default scene format is portrait 4:5 with focal-point and safe-text metadata.
- Maps and special illustrations may use a more appropriate ratio.
- Optional editor prompt additions are appended without replacing canon and continuity constraints.

### Versions and reuse

- Regeneration creates a new retained candidate.
- One candidate is selected as the active image.
- AI may propose reusing an existing image with new framing; the editor approves reuse.
- Upstream changes mark image candidates outdated but do not delete them.

## Posting and republication

- Studio and Reader share one Firebase project and book data hierarchy.
- There is no separate public snapshot collection.
- Internal plans, jobs, and generation candidates are not posted Story Moments.
- When the editor posts a Story Moment, its active version becomes immediately readable by the Reader.
- Every canonical posted Story Moment is live; there is no public draft state.
- A partially produced episode may expose the Story Moments already posted.
- Episode-level checks are required before the episode can be marked complete.
- Republication keeps the current version live while a replacement is prepared.
- Promotion atomically switches to the replacement, then deletes the old version.

## Objective checks

### Story Moment blockers

- Missing or invalid source mapping.
- Exact dialogue or excerpt mismatch.
- Missing required primary text.
- Missing, failed, or inaccessible active image.
- Character or location continuity contradiction.
- A reveal appearing before its source-supported point.
- Invalid hotspot target or coordinates.

### Episode-completion blockers

- Unaccounted main-narrative paragraphs.
- Broken ordering or episode-range coverage.
- Unresolved continuity conflicts.
- Incorrect revelation timing across Story Moments.
- Any posted Story Moment failing its current validation checks.

Subjective visual or writing assessments appear as warnings and never block posting by themselves.

## Jobs, retries, and costs

- Every book owns `books/{bookId}/jobs/allJobs`.
- `allJobs` contains a `jobs` map keyed by job ID; there is no root-level jobs collection.
- Firestore stores queued, running, completed, failed, and cancelled jobs in that map.
- The local worker polls for queued jobs and claims them transactionally.
- Worker polling, presence heartbeats, running-job heartbeats, and progress writes occur no more frequently than once per minute. Claims, completion, failure, cancellation, and explicit editor actions are written immediately.
- Work is checkpointed at meaningful units so restarts resume safely.
- Idempotency keys prevent completed AI operations from being charged twice.
- Explicit regeneration intentionally creates a new billable operation.
- The editor can select an OpenRouter model per editorial task.
- Studio shows estimated and actual cost per job, episode, and book.
- Exceeding a configurable book budget requires confirmation.

## Primary domain objects

| Object            | Purpose                                                         |
| ----------------- | --------------------------------------------------------------- |
| Book              | Root editorial and Reader identity                              |
| SourceRevision    | Original file, extracted text, structure, and approval state    |
| Paragraph         | Permanently identified source unit after approval               |
| BookBibleEntry    | Source-supported narrative fact with locked-field metadata      |
| EpisodePlan       | Whole-book episode boundary and purpose                         |
| StoryMomentPlan   | Internal plan for a future or posted Story Moment               |
| ImageCandidate    | One generated or reused image option                            |
| PostedStoryMoment | Canonical Reader-visible Story Moment and active version        |
| Episode           | Ordered collection of posted Story Moments and completion state |
| Job               | Durable unit of local-worker activity                           |
| CostRecord        | Estimated and actual model usage cost                           |

## Success criteria

- One editor can upload every supported file format and approve a stable extraction.
- Every Book Bible fact and Story Moment can be traced to source paragraphs.
- A full episode map accounts for the main narrative before Story Moment production.
- The editor can complete and post an illustrated Story Moment without leaving Studio.
- Single and batch image generation share the same candidate/version workflow.
- A posted Story Moment becomes readable by the Reader without a second publishing system.
- Failed or interrupted jobs can resume without duplicating completed model calls.
