# Project Context — Visual Book Platform Studio

Confirmed with the owner on 2026-09-18; the current feature plan is `docs/features/25d-schema-foundation/plan.md`.
This document distinguishes inspected legacy implementation from the confirmed target. Executing sessions use these names verbatim and do not add or rewrite ADRs; proposed changes go to feature status.md Deferred.

## Product and boundaries

Studio is the internal editorial production application in `C:/Users/800sa/studio`. It turns a complete source book into approved, ordered 2.5D assets and episode bundles.
The external Reader is a separate web application and is not built in this repository.
Studio Preview renders the Reader data contract for editorial inspection of Beats, Moments and Episodes. It is not a consumer library/account/payment product.
The Pipeline Worker executes long-running, checkpointed jobs independently of Next.js.
After uploading a source, the owner reviews/approves and selects visuals for single/batch generation or regeneration. AI supplies the plans, text, prompts, camera motion, transitions and assembly.

## Vocabulary

| Name | Exact meaning |
|---|---|
| Book | Root metadata, active source, book-wide style, pipeline and publication identity. |
| SourceRevision | One extraction/correction staging revision; approved canonical text is immutable within that sourceId. |
| Paragraph | Canonical source unit with id, global seq, chapterId, text/hash, kind and isStory. |
| seq | Zero-based position in canonical book order and the coordinate for reveal safety; never chronology. |
| storyTime | In-story chronology ordinal used to resolve entity state; flashbacks do not reorder playback. |
| canonical.json | Complete source-specific canonical paragraph text in Firebase Storage. |
| Entity | Character, location, object or group with facts, fills, states, reveals, relationships and visual references. |
| Fact | A sourced claim, with paragraph evidence and earliest known seq. |
| Fill | An explicitly invented visual choice where source text is silent; never presented as a sourced fact. |
| Event | Source-grounded occurrence with seq range, storyTime and entity participants. |
| ledger | Rolling registry built by the understanding pass; each window has a resumable checkpoint. |
| StoryMap | Acts, arcs, chronology and proposed contiguous Episode ranges. |
| Episode | Ordered publication unit containing Moments and their Beats; independently publishable. |
| Moment | Scene unit with continuous time, stable cast/location and a contiguous source range. |
| Beat | Reading/playback step: structured subtitle text, exactly one composition, AI camera motion, transition and inspectables. |
| Representation | Explicit description linking a paragraph to text, visual, camera or transition expression in a Beat. Dialogue/commentary are text forms. |
| Composition | Reusable source/reference-pinned scene with master, layers, optional depth, safe camera bounds, responsive framing and continuity approval. |
| Layer | Independently rendered background/midground/foreground asset using plane or depthMesh mode. |
| depthMesh | A runtime subdivided layer mesh displaced by its aligned depth texture; not a separately authored geometry file. |
| visualProfile | Versioned book-wide art direction and constraints. |
| VisualReferenceVersion | Immutable approved entity/state/location reference assets and metadata. |
| ReferencePin | Exact approved reference version/keys/hash used for generation. |
| safeCamera | Deterministically computed motion limits based on actual scene coverage and displacement. |
| Job | One durable Firestore work item with lease, retries, progress, checkpoints and costs. |
| Working revision | Mutable editorial replacement candidate, separate from the active published Episode version. |
| EpisodeBundle | Immutable, schema-versioned resolved playback data and asset references for one Episode. |
| EpisodeManifest | Asset/checksum/size list and progress-anchor metadata for one published version. |
| PublishedPointer | Sanitized active version pointer switched only after complete upload and approval. |
| BookCatalog | Versioned ordered list of independently published Episodes; authority for next-episode discovery. |
| WorkflowAction | A next-step button or a blocker-resolution action with an explicit target and validation state. |

Identifiers follow new.md: p000000 onwards for canonical paragraphs; ch_/loc_/obj_/grp_ for entities; ep_01, ep_01_m01, ep_01_m01_b01 initially; cmp_ content/version hash for compositions; L0 background to nearer layers.
Published IDs stay stable when meaning stays stable. Display order is separate. Paragraph IDs only identify text together with sourceId/canonicalHash.

## Inspected legacy vocabulary

- Book Bible/BibleEntry: generic kind/name/aliases/fields entries under a SourceRevision. Target Entity/Event/StoryMap is a semantic replacement, not a mechanical rename.
- EpisodePlan: source-scoped paragraph-ID start/end ranges with intentional-overlap/exclusion support. Target Episode uses strict canonical story coverage.
- StoryMomentPlan: old many-to-many paragraph mappings, one primary text and one active image plus posting state. Target Moment is a scene container; Beat is the playback unit.
- StyleCanon: existing book-wide visual rules; target visualProfile preserves the purpose with version pins.
- jobs/allJobs: current one-document job map; target one document per Job.
- Canonical Story Moments/live=true: legacy Firestore publication projection; target immutable AWS EpisodeBundle plus active published pointers.

## Modules and evidence

- `src/app`: thin Next pages/routes; `src/proxy.ts` is an optimistic access check.
- `src/features/<domain>/store.ts`: trusted server Firestore transactions, enqueueing and approvals.
- `src/features/<domain>/types.ts`: current domain types/pure invariants; canonical schemas move to `src/features/book-experience/schemas/`.
- `src/features/<domain>/components`: editorial UI; new feature domains own their hooks/functions/components.
- `src/services/firebase`: admin/client boundary and live browser reads.
- `worker/index.mts`: current poll/claim/dispatch/recovery entry; focused worker domain folders own new behavior.
- `tests/smoke`: custom Node fixture tests; source-string UI/rules checks are not behavioral proof.
- `tests/book-experience`: planned schema/preview/local integration tests; P2 creates browser prior art.
- Existing evidence: `src/features/sources/store.ts`, `bible/store.ts`, `episodes/store.ts`, `moments/store.ts`, `posting/store.ts`, `jobs/store.ts`, `firestore.rules`, `worker/index.mts`.
- Existing product docs: `docs/EDITORIAL_DASHBOARD.md`, `docs/FEATURE_TRACKER.md`, `new.md`. The confirmed feature plan overrides conflicts.

## Architectural decisions

### ADR-001 — Canonical order and immutable source identity
Context: AI output and published versions must remain traceable through corrections.
Decision: approve SourceRevision into immutable source-specific canonical text; seq is book order and IDs begin p000000. Store sourceId/hash on derived work.
Consequence: a new source invalidates dependent drafts; published snapshots and prior source remain intact.

### ADR-002 — Complete-book representation
Context: a cinematic presentation can silently omit information even when all source text is retained.
Decision: every story paragraph has a meaningful Representation in one or more Beats. Preserve internal/abstract meaning in HTML subtitles when visuals cannot carry it; no story gaps or overlapping Episode/Moment ownership.
Consequence: deterministic coverage and evidence checks plus semantic/editorial review are publication gates; source retention alone is insufficient.

### ADR-003 — AI plans; owner approves and generates visuals
Context: the owner explicitly rejects manual prompts, structured-data entry, camera direction and layer authoring.
Decision: AI generates all planning and camera/transition/timing choices; the owner selects single/multiple visual targets, previews and approves or requests regeneration.
Consequence: guided next actions and bounded automatic plan repair replace required editing forms.

### ADR-004 — Typed shared contracts
Context: the brief includes conflicting production and prototype fixture types.
Decision: Zod schemas are the single source of runtime validation and inferred types; richer production forms, representations, source/reference versions and publication semantics win.
Consequence: APIs, worker, codecs, fixtures, previews and bundles share contracts; there is no separate Reader code/type copy here.

### ADR-005 — Trusted writes and development-only bypass
Context: browser reads need Firebase readiness while current server-only development bypass leaves a login dependency.
Decision: make development usable without interactive sign-in; keep production auth and trusted server writes enforced, with no permissive live rules or exposed credentials.
Consequence: auth/data readiness is an isolated build phase and must pass production-negative tests. No auth change was applied during planning.

### ADR-006 — Durable individual jobs
Context: long jobs require resumability and the allJobs map is not an unbounded queue.
Decision: one Firestore document per Job; transactional claims/leases, checkpointed units, idempotent charges, bounded concurrency and explicit visual-generation triggers.
Consequence: approval-driven planning can resume after failures without duplicate paid work.

### ADR-007 — Reference-first generated scenes
Context: visual consistency requires approved shared identity and state across many scenes.
Decision: approve versioned visualProfile and entity/state/location references before scene generation; pin those versions and review continuity.
Consequence: regenerate failures, never assume reference conditioning guarantees exact identity, and flag dependent drafts when references change.

### ADR-008 — Generated layers, automatic assembly
Context: the owner does not want dedicated depth/segmentation/inpainting services or manual asset correction.
Decision: image generation produces clean backgrounds, aligned alpha layers and optional depth; internal assembly supports planes and depthMesh, validates coverage and computes safeCamera.
Consequence: no third-party 2.5D provider; missing/invalid depth blocks depthMesh approval, with targeted regeneration available.

### ADR-009 — HTML subtitles and faithful preview
Context: text must remain readable across devices and the external Reader needs a consistent contract.
Decision: render text as HTML over the composition; preview Beat/Moment/Episode from the same bundle contract, including CSS fallback and reduced motion.
Consequence: no baked text or required camera controls; partial placeholders are honest draft states and never publishable.

### ADR-010 — AWS assets and immutable episode publication
Context: finished Episodes must be available before the whole book and remain stable during regeneration.
Decision: all generated assets/manifests/bundles live in S3/CloudFront; source/canonical/ledger stay Firebase Storage; Firestore owns metadata/pointers.
Consequence: stage versioned output, atomically promote active pointers/catalog, keep old versions for active sessions and rollback, and never mutate shared published assets.

### ADR-011 — Source of truth for reuse and revisions
Context: duplicate composition links and mutable reference IDs create drift.
Decision: Composition.usedIn owns reuse relationships; Moment.compositionIds is derived. Working revisions and published snapshots pin source/style/reference/asset versions.
Consequence: regeneration invalidates only affected draft dependencies and cannot silently alter another published Episode.

### ADR-012 — Local implementation, owner-only release
Context: the owner permits code/test automation but reserves paid generation, deployment and live publication.
Decision: implementation uses deterministic fakes/local fixtures; P13 is HUMAN-ONLY. No cloud migration/deletion is needed; no consumer Reader, payment or distribution work.
Consequence: artistic/model capability and deployed security remain explicit owner QA, never inferred from local tests.
