# 2.5D Book Experience and Canonical Schemas — Plan

Owner decisions locked 2026-09-18. Primary and only repository: `C:/Users/800sa/studio`.
Feature slug: `25d-schema-foundation`. Planning only: the owner explicitly deferred all code changes, including development auth, to the build.
This plan supersedes conflicting prototype fixtures, manual-edit workflow assumptions and storage/publishing requirements in `new.md` and older Studio tickets. Read `new.md` for narrative detail; this plan wins on conflicts.
Existing PDF, OCR and EPUB extraction support, Firebase source storage, S3/CloudFront visual delivery, model configuration, budget controls, job recovery and editor approvals remain supported while their consumers are refactored.
No consumer Reader, growth/distribution work, payments, data migration, design spike or new depth/segmentation/inpainting vendor is included.

## 1. Decisions locked

| # | Decision | Choice |
|---|---|---|
| 1 | Product | Studio produces the assets and versioned data for a complete-book 2.5D experience consumed by a separate web Reader. |
| 2 | Complete book | Every story paragraph has a meaningful, traceable representation; retain all extracted paragraphs, including classified non-story material. |
| 3 | Owner workflow | After source upload, owner only reviews/approves and selects one or multiple visual targets for generation/regeneration. No required prompts, camera directions, layer placement, text entry or structured-data editing. |
| 4 | Planning | AI supplies book model, StoryMap, Episode/Moment/Beat plans, subtitles, camera targets/motion, transitions, timing and asset-generation instructions. Approval automatically advances eligible planning; visuals require explicit generation selection. |
| 5 | Schemas | Zod is the single versioned runtime/type source for Book, SourceRevision, Paragraph, Entity, Event, StoryMap, Episode, Moment, Beat, Representation, Composition, Layer, Job and EpisodeBundle plus supporting contracts. |
| 6 | Source revisions | Keep extraction staging; approve into immutable source-specific canonical text and active book-level projections; changed sources invalidate dependent drafts. |
| 7 | Data transition | No legacy-data migration or dual-publication requirement. Use expand → move code consumers → contract; no remote deletion/reset is authorized. |
| 8 | Source coordinates | Zero-based global seq, first paragraph p000000; inclusive seq ranges; paragraph identity always paired with sourceId after source revisions. |
| 9 | Text | Structured Beat.text rendered as semantic HTML subtitles over the visual, never baked into assets. Exact quote/dialogue offsets and commentary provenance are validated. |
| 10 | Coverage | Preserve meaning as well as paragraph membership. Use text for ideas that visuals/camera/transition cannot convey. No arbitrary tagging to satisfy a validator. |
| 11 | UI | Redesign Book Model around typed Entity/Event review; selectively redesign StoryMap/timeline while preserving useful approval and boundary-validation behavior. Primary actions are approve, preview, generate selected, regenerate and approve replacement. |
| 12 | 2.5D assets | Generate clean backgrounds, transparent foreground assets and optional depth through the existing configurable image-generation route. Assemble internally; no separate DepthProvider/SegmentProvider/InpaintProvider integration. |
| 13 | Correction | Regenerate failed assets; no required upload-replacement, hand-painted mask or manual editing workflow. Retain approved versions while a replacement is being generated. |
| 14 | Rendering | Full layered planes plus runtime depthMesh per layer; CSS fallback is included. No stored mesh geometry files required. |
| 15 | Preview | Direct Beat/Moment/Episode scopes use the exact bundle contract; actionable blockers explain what to click. Partial drafts remain inspectable with explicit placeholders. |
| 16 | Consistency | Approve book style and versioned entity/state/location references before scene generation. Pin reference versions and require continuity approval; conditioning is not proof of an exact match. |
| 17 | Storage | All generated images, reference sheets, layers, masks, depth, variants, thumbnails, manifests and bundles in AWS S3; CloudFront delivery. Original sources and canonical text in Firebase Storage. Firestore stores metadata/pointers. |
| 18 | Publication | Each finished Episode can publish independently. Regeneration creates a working revision; published bundles/assets are immutable; explicit replacement approval atomically switches the active pointer. |
| 19 | Preview proof early | Build a deterministic source → Moment → Beats → Composition → bundle → Studio preview slice before the broad pipeline refactor. No prototype/spike tool is required. |
| 20 | Dependencies | Approved: zod, three, @react-three/fiber, @playwright/test and required Three.js type declarations. Ask before adding other direct dependencies. |
| 21 | Development auth | No interactive sign-in in development, including Firebase browser data readiness. Production stays authenticated; implement later in isolated P1. |
| 22 | Execution | Agents implement/test locally. Paid generation, live publication, deployment, security-rule deployment and any existing-data deletion are owner-only; P13 is HUMAN-ONLY. |
| 23 | Commercial scope | Product design and creation workflow only. Do not add acquisition, pricing, analytics collection, subscriptions or a Reader app. |

## 2. Current architecture and landing zones

Current code is one Next.js 16.3.1/React 19 app, `src/features/<domain>` stores/types/components, trusted Admin SDK routes, direct browser Firestore subscriptions, and a standalone `worker/index.mts`.
SourceRevision currently owns chapter documents, generic Bible entries, EpisodePlan and StoryMomentPlan. Jobs currently occupy `books/{bookId}/jobs/allJobs`; live Story Moments currently occupy the book-level episodes path. These are implementation facts, not target ADRs.
The first paragraph is currently p000001. Current moment coverage allows many-to-many mapping and exclusions; the target changes the canonical scene ranges and keeps multi-modal representation inside those ranges.
Current UI has no Beat, Composition, depth, mesh or Player. `image-studio.tsx` has 916 lines; `worker/index.mts` has 635. P0 extracts focused modules before extending them.
New shared contracts live in `src/features/book-experience/schemas/`; domain functions/storage/jobs/book-model/story-map/beats/coverage/visuals/compositions/preview/publishing get focused sibling folders with their own components/hooks/functions as needed.
Worker additions live in domain folders such as `worker/jobs/`, `worker/providers/`, `worker/book-model/`, `worker/story-planning/`, `worker/beats/`, `worker/visuals/`, `worker/compositions/`, `worker/publishing/`.
Existing domain folders may be adapted rather than duplicated. Routes remain thin adapters in `src/app`; Firebase adapters stay in `src/services/firebase`; these are explicit placement exceptions, not permission for unrelated global helpers.
Use real shared imports from both Next and Node. Do not duplicate fixtures/types across applications as the prototype portion of new.md suggested; there is only this application.
Read the relevant bundled Next guide under `node_modules/next/dist/docs/` before code; no assumptions from older Next APIs.

## 3. Canonical contracts and invariant ownership

The following types define the target wire/storage meanings. Implement strict Zod schemas and infer TypeScript from them rather than maintaining parallel handwritten definitions.
All persisted root aggregates carry schemaVersion, source lineage and/or revision identity as applicable. Unsupported versions fail with an actionable error. Timestamps serialize as UTC ISO strings, with explicit Firestore Timestamp codecs. Unknown provider output is never cast into an approved type.
AI writes proposals through validated worker services; trusted server actions write approvals and immutable reference pins; browser clients never write editorial Firestore documents directly.

### 3.1 Source, model and planning types

```ts
type IsoDate = string;
type Id = string;
type SeqRange = { seqStart: number; seqEnd: number };
type Lineage = { sourceId: Id; canonicalHash: string };
type Evidence = { paragraphIds: Id[] };
type ReviewStatus = "draft" | "reviewed" | "locked";
type StageState = "pending" | "running" | "review" | "approved" | "outdated" | "failed";
type AssetRef = {
  key: string; w: number; h: number; contentType: string;
  sizeBytes: number; checksum: string; assetVersionId: Id;
  variants?: { mobile: string; desktop: string };
};
type SourceRevision = {
  schemaVersion: 1; sourceId: Id; bookId: Id; baseSourceId?: Id;
  status: "uploaded" | "extracting" | "review" | "approved" | "failed";
  storagePath: string; canonicalPath?: string; canonicalHash?: string;
  idsFrozen: boolean; createdAt: IsoDate; approvedAt?: IsoDate;
};
type VisualProfile = {
  version: number; artStyle: string; palette: string[]; lens: string;
  lighting: string; negativeRules: string[]; lockedAt?: IsoDate;
};
type Book = {
  schemaVersion: 1; bookId: Id; title: string; author: string;
  genres: string[]; description: string; coverPhotoUrl?: string;
  sourceFile: {
    storagePath: string; originalFileName: string; sizeBytes: number;
    pageCount?: number; checksum: string;
  };
  activeSourceId?: Id; canonical?: { storagePath: string; hash: string };
  structure: { chapters: ({ id: Id; title: string; isStory: boolean } & SeqRange)[] };
  stats: { paragraphCount: number; storyParagraphCount: number; wordCount: number; tokenEstimate: number };
  visualProfile?: VisualProfile;
  pipeline: { stage: string; stageStatus: StageState; lastJobId?: Id; updatedAt: IsoDate };
  publishing: { publishedEpisodeIds: Id[]; latestVersion: number; catalogKey?: string; publishedAt?: IsoDate };
  createdBy: string; createdAt: IsoDate; updatedAt: IsoDate;
};
type Paragraph = {
  id: Id; seq: number; page: number | null; chapterId: Id; text: string; hash: string;
  kind: "body" | "heading" | "frontmatter" | "backmatter" | "note" | "caption";
  isStory: boolean;
};
type TextChunk = Lineage & {
  id: Id; index: number; startPage: number | null; endPage: number | null;
  seqStart: number; seqEnd: number; paragraphs: Paragraph[];
};
type VisualReferenceVersion = {
  version: number; s3Keys: string[]; checksum: string;
  approved: boolean; approvedBy?: string; approvedAt?: IsoDate;
};
type Entity = Lineage & {
  schemaVersion: 1; entityId: Id; type: "character" | "location" | "object" | "group";
  canonicalName: string; aliases: ({ name: string; firstSeq: number } & Evidence)[];
  importance: "major" | "supporting" | "minor"; firstSeq: number; lastSeq: number;
  facts: ({ key: string; value: string; quote: string; firstSeq: number } & Evidence)[];
  fills: { key: string; value: string; reason: string; editedBy?: string }[];
  states: ({
    stateId: Id; label: string; validFromStoryTime: number;
    validToStoryTime: number | null; validFromSeq: number;
    changes: Record<string, string>;
  } & Evidence)[];
  reveals: ({ what: string; seq: number } & Evidence)[];
  relationships: ({
    toEntityId: Id; type: string; validFromSeq: number; validToSeq: number | null;
  } & Evidence)[];
  visual: {
    spec: string; referenceSheet?: VisualReferenceVersion;
    stateVariants: Record<Id, VisualReferenceVersion>; preRevealSpec?: string;
  };
  status: ReviewStatus;
};
type Event = Lineage & SeqRange & Evidence & {
  schemaVersion: 1; eventId: Id; order: number; summary: string; storyTime: number;
  participants: Id[]; locationId?: Id; objectIds: Id[]; kind: string;
};
type StoryMap = Lineage & {
  schemaVersion: 1; revision: number; status: ReviewStatus;
  acts: { title: string; eventIds: Id[] }[];
  arcs: { entityId: Id; summary: string; eventIds: Id[] }[];
  episodeProposals: ({ order: number; title: string; rationale: string } & SeqRange)[];
  chronology: { storyTime: number; eventIds: Id[] }[];
};
type Episode = Lineage & SeqRange & {
  schemaVersion: 1; episodeId: Id; revisionId: Id; order: number; title: string;
  chapterIds: Id[]; summary: string;
  storyPlan: {
    arc: string; momentOutline: ({ title: string } & SeqRange)[];
    visualStrategy: string; reuseCandidates: string[];
  };
  stageStatus: Record<"planned" | "moments" | "beats" | "visuals" | "composed" | "previewed" | "published", StageState>;
  publishedVersion?: number;
};
type TextSelection = { paragraphId: Id; start: number; end: number; text: string };
type Dialogue = TextSelection & { speakerEntityId: Id; addresseeEntityId?: Id };
type Commentary = {
  id: Id; text: string; kind: "scene" | "context" | "clarify";
  groundedIn: Id[]; verified: boolean;
};
type EntityState = { entityId: Id; stateId: Id };
type Shot = {
  shotId: Id; description: string; entityStates: EntityState[];
  framing: string; mood: string; timeOfDay: string; reuseKey: string;
};
type Hotspot = { x: number; y: number; w: number; h: number };
type Moment = Lineage & SeqRange & {
  schemaVersion: 1; momentId: Id; order: number; sourceParagraphIds: Id[];
  summary: string; startState: string; endState: string; storyTime: number;
  characters: EntityState[]; locationId?: Id; locationStateId?: Id; objectIds: Id[];
  exactTextSelections: TextSelection[]; dialogue: Dialogue[]; commentary: Commentary[];
  visualPlan: { shots: Shot[] }; compositionIds: Id[]; readingBeats: Beat[];
  inspectableEntities: { entityId: Id; beatId: Id; hotspot: Hotspot }[];
  status: StageState;
};
```

Source range ends are inclusive. Text offsets are UTF-16 code-unit indexes with start inclusive/end exclusive; compare against exactly the canonical string without normalization during verification.
seq is a nonnegative integer, storyTime a finite chronology ordinal. Episode/Moment/Beat display order starts at 1; paragraph seq starts at 0. p + six-digit seq follows new.md; overflow of the supported ID range fails explicitly rather than truncating.
Entity IDs use ch_/loc_/obj_/grp_; Episode ep_01; Moment ep_01_m01; Beat ep_01_m01_b01 initially. IDs are stable once published: order is a separate field, not permission to rename unchanged IDs.
Facts/reveals/events refer to existing paragraphs from the same sourceId. Fills are explicitly invented visual choices where the book is silent, never source facts or ungrounded commentary.
storyTime resolves physical state; seq gates what can be shown. Future-reference variants/pre-reveal hidden faces must never leak through asset conditioning.
Moment/episode ranges tile story paragraphs exactly once; non-story paragraphs remain stored and explicitly classified. Several Beats may represent the same paragraph inside its owning Moment, in source order.

### 3.2 Beat and composition types

```ts
type Representation = {
  paragraphId: Id; modality: "text" | "visual" | "camera" | "transition";
  description: string;
};
type CameraPose = { x: number; y: number; zoom: number; rotate: number };
type SafeCamera = { maxPanX: number; maxPanY: number; maxZoom: number; maxTilt: number };
type Transform = {
  x: number; y: number; z: number; scaleX: number; scaleY: number; rotate: number;
};
type Crop = { x: number; y: number; w: number; h: number };
type Responsive = { focalPoint: [number, number]; portraitCrop: Crop; landscapeCrop: Crop };
type Beat = {
  id: Id; order: number; seq: number;
  type: "quote" | "dialogue" | "commentary" | "mixed" | "title" | "transition";
  text: {
    quote?: TextSelection;
    dialogue?: (Dialogue & { speakerDisplayName: string })[];
    commentary?: Commentary[];
  };
  compositionId: Id;
  camera: {
    from: CameraPose; to: CameraPose; durationMs: number;
    easing: "linear" | "easeInOut" | "spring"; focusLayerId?: Id;
    focusEntityId?: Id; rationale: string;
  };
  transitionIn: {
    type: "cut" | "fade" | "slide" | "zoomThrough" | "parallaxShift";
    durationMs: number;
  };
  inspectables: { entityId: Id; hotspot: Hotspot }[];
  autoAdvanceMs?: number; representations: Representation[];
};
type DepthAsset = AssetRef & {
  bitDepth: 8 | 16; sourceBitDepth: 8 | 16;
  convention: "near-white"; provenance: "generated" | "derived";
};
type Layer = {
  layerId: Id; role: "background" | "midground" | "foreground"; entityId?: Id;
  image: AssetRef; mask?: AssetRef; depth?: DepthAsset; hiddenAreaImage?: AssetRef;
  zOrder: number; depthRange: [number, number]; transform: Transform;
  renderMode: "plane" | "depthMesh";
  mesh?: { segmentsX: number; segmentsY: number; displacementScale: number };
};
type ReferencePin = { entityId: Id; stateId?: Id; version: number; s3Keys: string[]; checksum: string };
type Composition = Lineage & {
  schemaVersion: 1; compositionId: Id; revisionId: Id; reuseKey: string;
  originEpisodeId: Id; usedIn: { episodeId: Id; momentId: Id; beatId: Id; revisionId: Id }[];
  shotSnapshot: Shot; entityStatesUsed: EntityState[]; continuityRefs: string[];
  referenceVersions: ReferencePin[]; visualProfileVersion: number;
  master: AssetRef; depth?: DepthAsset; layers: Layer[];
  safeCamera: SafeCamera; responsive: Responsive;
  qa: {
    textDetected: boolean; agreementScore: number | null;
    identityScores: Record<Id, number>; issues: string[];
    continuityStatus: "pending" | "approved" | "rejected";
    approvedBy?: string; approvedAt?: IsoDate;
  };
  generation: {
    provider: string; model: string; prompt: string; negativePrompt: string;
    seed?: number; referenceKeys: string[]; costUsd: number;
  };
  status: "generated" | "approved" | "rejected" | "composed" | "published";
  createdAt: IsoDate; updatedAt: IsoDate;
};
```

Dialogue and commentary are text representations, not extra Representation.modality values. A coverage validator checks IDs and meaningful links; grounded AI review plus editorial preview confirms semantic fidelity. A camera pan alone cannot stand in for an unexpressed internal thought.
Each Beat has exactly one compositionId. Draft IDs can name planned compositions pending assets; publication requires all references to resolve. Approximate 60-word quote screens split into ordered Beats, never truncate. Dialogue shows short exchanges; subtitles do not auto-advance unless explicitly timed by the plan, with reader-controlled pause/advance supported.
Camera x/y are signed fractions of the composition width/height from its center; zoom=1 is the fitted viewport view and must be >=1; rotate/maxTilt are radians around the screen normal. Positive x is right, positive y is down. The name maxTilt is retained for the 2D camera rotation bound; do not silently reinterpret it as a free 3D orbit.
Transform x/y follow the same center origin, z is normalized scene depth, scaleX/scaleY are positive multipliers, rotate radians. Hotspot/crop coordinates are normalized top-left x/y with w/h extents contained in [0,1]. Focal points use this same top-left frame.
DepthRange uses [far,near] with values in [0,1]; larger zOrder/z/depth is closer. Overlapping depth ranges are allowed for real geometry; require valid monotonic ranges and consistent occlusion ordering rather than inventing disjoint-depth physics.
depthMesh requires depth plus bounded integer subdivisions and finite displacementScale; planes may omit depth and mesh. Convert depth using explicit near-white convention; never treat depth or alpha data as color-managed photographs.
A 16-bit depth asset is preferred when the provider genuinely supplies that precision. Converting 8-bit data to a 16-bit container must retain sourceBitDepth=8, never claim recovered detail. Full mesh support does not justify fabricated depth-quality scores.
Master is the flattened composite/thumbnail derived from the approved layer assembly; it is not a competing scene source. Optional master depth cannot substitute for each depthMesh layer's aligned depth.
All layers share an explicit composition canvas/perspective and keep transparent padding/placement consistent. Validate actual alpha, dimensions, masks/depth alignment and background overscan. Generate clean backgrounds so hidden areas exist; hiddenAreaImage is only needed when a further generated repair is required.
safeCamera is computed from actual opaque/background coverage, crop/aspect, all layer movement, rotation and displacement limits. Metadata claims alone are not proof of hole-free motion. AI replans or regeneration resolves unsafe shots; owners never fix camera directions.
Do not assume image conditioning guarantees identity equality; store actual review results and pending/null scores when no check exists.

### 3.3 Jobs, publication and actionable workflow types

```ts
type Job = Lineage & {
  schemaVersion: 1; jobId: Id; type: string; stage: string;
  status: "queued" | "running" | "waiting_confirmation" | "completed" | "failed" | "cancelled";
  progress: { done: number; total: number }; checkpoint: { storagePath: string; unit: number } | null;
  attempts: number; maxAttempts: number; error: { code: string; message: string } | null;
  estimatedCostUsd: number; costUsd: number; idempotencyKey: string;
  workerId?: Id; leaseExpiresAt?: IsoDate; startedAt?: IsoDate; finishedAt?: IsoDate;
};
type PublishedEntity = {
  displayName: string; card: { line: string; knownFacts: string[]; firstSeenEpisode: Id };
  image?: AssetRef;
};
type EpisodeBundle = Lineage & {
  schemaVersion: 1; bookId: Id; episodeId: Id; version: number; revisionId: Id;
  order: number; title: string; summary: string; beats: Beat[];
  compositions: Record<Id, Pick<Composition, "master" | "depth" | "layers" | "safeCamera" | "responsive">>;
  entities: Record<Id, PublishedEntity>;
  entityViews: Record<Id, Record<Id, PublishedEntity>>;
  assetsBaseUrl: string;
};
type EpisodeManifest = {
  schemaVersion: 1; bookId: Id; episodeId: Id; version: number;
  bundleKey: string; bundleChecksum: string; sizeBytes: number;
  assets: { key: string; checksum: string; sizeBytes: number; contentType: string }[];
  progressAnchors: { fromVersion: number; fromBeatId: Id; toBeatId: Id; seq: number }[];
};
type PublishedPointer = {
  version: number; revisionId: Id; bundleUrl: string; manifestUrl: string;
  sizeBytes: number; publishedAt: IsoDate; publishedBy: string;
};
type BookCatalog = {
  schemaVersion: 1; bookId: Id; version: number;
  episodes: { episodeId: Id; order: number; title: string; version: number; bundleUrl: string; manifestUrl: string }[];
};
type WorkflowAction = {
  id: string; label: string; kind: "approve" | "generate" | "regenerate" | "preview" | "retry" | "publish" | "compare";
  target: { bookId: Id; episodeId?: Id; momentId?: Id; beatId?: Id; entityId?: Id; compositionId?: Id; layerId?: Id };
  enabled: boolean; blockers: { code: string; message: string; targetActionId?: string }[];
};
```

EpisodeBundle.entities is safe at episode start, not episode end. entityViews[beatId] is the resolved safe view at that Beat's seq; inspectables use that view, never raw canonical entities. Summaries/previews also must avoid leaking future revelations. Bundle data is downloadable for the episode: this is display spoiler safety, not DRM.
Publish only allowlisted public fields. Do not export model prompts, jobs, emails, private facts, unpublished candidates or generation cost records.
BookCatalog, not stale prev/next fields inside immutable bundles, determines currently available neighboring episodes. Use versioned catalog objects plus a small revalidated active pointer; long-lived immutable caching belongs to versioned assets/bundles only.
External Reader sessions pin a version while reading. Stable IDs persist when meaning is unchanged; changed/split/deleted Beats get explicit progress anchors, falling back to source seq within the same sourceId. Cross-source progress mapping is explicit or unresolved, never a silently reused paragraph ID.
Visual regeneration yields a new Composition/revision and updates draft usedIn references. Published bundles retain their exact composition snapshots/asset keys.
Approval gates bind to content fingerprints, sourceId, visualProfile/reference versions and relevant plan revision. Async job completion must compare these pins before promotion; outdated work cannot regain approval.

## 4. Persistence, immutability and module boundaries

| Path | Owner and purpose |
|---|---|
| books/{bookId} | Server-owned active source, structure/stats, visualProfile, pipeline and publication summaries. |
| books/{bookId}/sources/{sourceId} | Extraction staging and correction history; never destroy approved source versions. |
| books/{bookId}/textChunks/{sourceId}__{chunkId} | Version-keyed canonical projection; logical chunkId c0001, c0002, etc., normally 20 paragraphs. Query by activeSourceId. |
| books/{bookId}/entities/{entityId} | Current source model proposal/approval. |
| books/{bookId}/entities/{entityId}/visualVersions/{versionId} | Immutable approved reference metadata; S3 contains the assets. |
| books/{bookId}/events/{eventId} | Source-grounded event model. |
| books/{bookId}/derived/storyMap | Current source StoryMap. |
| books/{bookId}/derived/ledger | Pointer/checkpoint summary; large per-window snapshots in Firebase Storage. |
| books/{bookId}/episodes/{episodeId} | Current working Episode and active revision pointer; private editorial document. |
| books/{bookId}/episodes/{episodeId}/moments/{momentId} | Current working Moment with readingBeats, source/revision pins. |
| books/{bookId}/episodes/{episodeId}/revisions/{revisionId} | Revision manifest and immutable snapshot pointer; large episode snapshots in Storage/S3, not one oversized Firestore document. |
| books/{bookId}/compositions/{compositionId} | Composition metadata and canonical usedIn reuse relationships. |
| books/{bookId}/jobs/{jobId} | Individual durable job with bounded checkpoint metadata. |
| books/{bookId}/published/{episodeId} | Sanitized active PublishedPointer. |
| books/{bookId}/usage/{yyyymm} | Token/image spend totals derived idempotently from job/call records. |

Firebase Storage source: `books/{bookId}/sources/{sourceId}/original/{fileName}`.
Firebase Storage canonical: `books/{bookId}/sources/{sourceId}/text/canonical.json`; never overwrite after approval.
Ledger checkpoints: `books/{bookId}/sources/{sourceId}/ledger/{jobId}/{window}.json`.
AWS assets: `books/{bookId}/assets/{assetVersionId}/{role}.{extension}`.
AWS published: `books/{bookId}/published/{episodeId}/v{version}/bundle.json` and `manifest.json`.
AWS catalogs: `books/{bookId}/catalog/v{version}.json`; Book.publishing.catalogKey is the trusted active discovery pointer.
AWS drafts: `books/{bookId}/drafts/{episodeId}/{revisionId}/...`; do not infer drafts are private merely from this prefix. Local tests use a fake asset store; production delivery authorization must distinguish drafts from published assets before exposure.
All generated reference/layer/depth/mask/variant/thumbnail assets go to S3, not Firebase Storage. Canonical source and ledger remain Firebase Storage. Firestore holds keys/hashes/review state only.
Stage source-specific chunks first, validate their canonical hash and count, then atomically advance Book.activeSourceId/canonical. Physical chunk keys are source-versioned to avoid replacing chunks while the old active source is still selected.
Working model/episode documents carry lineage; queries must refuse mismatched source revisions. Model promotion invalidates old active working artifacts. Published snapshots remain intact.
Compositions.usedIn is the canonical reuse relationship. Moment.compositionIds is derived; do not create two independently edited authorities.
Bound every document and array against Firestore payload limits. Avoid embedding complete canonical text, mesh geometry, full checkpoints or unbounded jobs in one document. If a Moment would exceed limits, split at a valid scene/text seam or record a plan contradiction; never silently truncate.
Route handlers validate input and dispatch domain actions; stores own transactions, approvals and promotion; workers execute long-running work; pure functions own invariants; preview consumes bundles only.

## 5. Visual planning, cameras and faithful reading

Planning selects semantic targets (character, object, location, reveal), framing, transitions, timing and normalized camera intent based on Book Model → StoryMap → Moment → Beat. Layer IDs become concrete after generation; assembly resolves them and computes actual limits.
The owner does not set camera direction, zoom, layer position, prompts or shot descriptions. Diagnostic depth/layer inspection is read-only in the primary workflow.
References use canonical facts plus explicitly labelled fills; state/reveal-specific references must match both storyTime and seq. The image-generation request pins visualProfile and reference versions.
Background generation includes the parts that become visible behind foreground assets. Foreground candidates need real alpha, not a drawn checkerboard. Generated depth must align with the exact image and preserve truthful bit-depth metadata.
Regenerate at asset/layer/composition scope; a failed layer does not require discarding every approved sibling. Reference changes flag dependent drafts but never mutate published assets.
Verification has two levels: deterministic schema/coverage/asset/camera checks and grounded/visual review. AI quality scores are evidence, not a mathematical guarantee of story fidelity or visual equality.
Every story paragraph appears in a coverage report linking source → Moment → Beat → Representation. Non-story material has explicit classification and remains available as source. The experience must not present itself as a summary/abridgment.
Quote/dialogue text is exact; commentary has supported sentence-level citations and spoiler checks. Preserve negation, causality, attribution, internal thoughts and chronology; if camera/visual alone cannot carry them, use subtitles.
Rendering uses an orthographic composition frame for WebGL planes/meshes. CSS fallback approximates planes/parallax and supported transitions; depth displacement degrades to flat layers with the same text, source order and controls.
Respect reduced motion; default to user-driven reading without arbitrary timed advancement. Provide keyboard and touch navigation, readable subtitle safe areas, contrast and portrait/landscape wrapping. Sanitize any formatting; do not inject model-produced HTML through unchecked innerHTML.
Preview scopes use the same coordinate/easing/crop/text/transition rules as exported data. No editor-only interpretation that makes an invalid bundle look valid.

## 6. Pipeline and approval gates

| Stage | Automatic work | Owner-facing action |
|---|---|---|
| Source | Extract/layout/OCR, paragraph order/classification, chapter proposal and validation | Review source; approve extraction. Failed steps offer retry/AI repair, not required forms. |
| Understand/consolidate | Chapter-bounded rolling ledger, facts/events/states/reveals, alias candidates and chronology | Review/approve Book Model; disputed proposals return to AI regeneration. |
| Map/plan | StoryMap, Episode ranges, episode storyPlan and scene Moments | Review/approve StoryMap and episode plans. |
| Build Beats | Grounded text, paragraph representations, semantic cameras/transitions and composition recipes | Preview planned Beats; review/approve content. |
| Visual references | AI drafts visualProfile/specs/reference prompts and target lists | Generate one/select multiple references; approve candidates/style. |
| Scene visuals | Requests use only approved pinned references | Generate one/select multiple visual targets; regenerate failures; approve continuity. |
| Compose | Assemble planes/depthMesh, responsive crops, camera limits and validation automatically | Preview Beat/Moment/Episode; approve assembled result. |
| Publish | Validate/compile/upload immutable version and prepare atomic promotion | Explicit approve and publish; readers can access this Episode independently. |
| Replacement | AI updates only affected draft assets/assembly and approval fingerprints | Regenerate → compare → approve replacement; previous version stays live. |

Planning jobs continue after prerequisites are approved, not after extra manual data entry. No visual-image API calls run merely because a user opens a page.
Preserve cost limits and explicit over-budget confirmation; cap automatic plan-repair attempts and show actionable failures. Single and batch visuals share the same prompt/validation/approval path.
Current LLM/image configuration stays; model choices are configuration, not required per-shot inputs. All provider calls are validated and checkpointed; only current approved reference versions may be used.
Callbacks carry jobId/idempotencyKey and expected revision; retry is not a new billable regeneration. Explicit regeneration is a new attempt with a distinct idempotency key.

## 7. Studio surfaces and direct preview

Library shows each book's stage, active job and published episodes. Book overview exposes one next action plus exact clickable blockers.
Book Model: Entity table/type filters, facts versus fills, states/reveals/relationships, reference status, Event list/chronology and provenance. AI merge/split proposals are approve/reject actions; no required manual field editing.
StoryMap: acts/arcs, chronology and paragraph timeline with proposed Episode boundaries. Underlying neighbor-boundary validation is retained, but AI owns changes; owner approves or requests a revised plan.
Episode board: Moment scene ranges, stage status, coverage and production readiness. Focused Moment/Beat review replaces large nested editing cards.
Visual review: approved versioned references beside generated candidates, multi-select generation, targeted regeneration and affected-dependency status.
2.5D review: read-only layer/depth inspector and parallax scrub; AI cameras displayed with their source-backed purpose. Do not ship a required Set camera step.
Preview panel: Beat/Moment/Episode scope, play/pause/replay/scrub/next/previous, subtitle and motion controls, plus working/published/compare modes.
Scope selection immediately loads a renderable preview; playback obeys user/reduced-motion preferences and does not auto-start paid work.
Draft preview can show explicit missing-layer/asset placeholders; those placeholders can never count as approved/publishable assets.
Loading, empty, failed, partial, outdated, ready-for-review and approved states are distinct. Every blocker has a named target and useful action: approve reference, generate selected, regenerate layer, retry AI planning, preview or compare.
Approval controls show what stage they unlock. Reopen/reject/regenerate invalidates relevant draft approvals explicitly; it never silently unpublishes the current episode.
Publication checklist is entirely derived from validators, reference approvals and content/preview fingerprints; no manual checkbox may bypass a failing invariant.
Acceptance: from upload to publication an owner can finish using approval, visual selection/generation and preview only. Never force the owner to type JSON, fields, camera values, prompts or repair text.

## 8. Independent publication, regeneration and Reader handoff

Compile complete EpisodeBundle and EpisodeManifest; resolve every Beat/composition/asset reference and source/reveal view. Preview the exact compiled candidate before approval.
S3 objects are written to new versioned keys and verified before a Firestore transaction promotes PublishedPointer and the active catalog. Use expected prior version/source/draft fingerprint for compare-and-swap; concurrent publishers cannot clobber each other.
A failed upload leaves the old published pointer intact. Orphan staging artifacts may be reported; automatic destructive remote cleanup is outside scope.
Each Episode can be released as soon as it passes gates. Never wait for the whole book; later-episode discovery comes from the catalog, not an immutable bundle's frozen next pointer.
Regeneration creates a separate working revision and new affected asset/composition versions. Approved unaffected assets are reused by immutable key. Sharing a composition across episodes never authorizes mutating its previously published contents.
Keep published version 1 readable while draft version 2 generates or fails. A stale job must not publish itself; owner approves the candidate version after preview and validators pass.
Compare shows changed Beats/visuals/reference pins and newly invalidated approvals. Rollback points to an existing valid version; withdrawal removes the active catalog entry without destroying historical assets.
Expose schemaVersion and clear coordinate/depth/easing semantics. All subtitle text is separate data rendered into HTML. Include asset manifests/checksums/dimensions/variants and source-aligned progress anchors.
The external Reader is not implemented here: document the contract in this plan, test with Studio preview, and produce data it can consume. No accounts, saved-progress database implementation or Reader authentication is added.
Before live release, the owner verifies intended published delivery plus private draft/source access; S3 private-bucket settings alone do not prove CloudFront object privacy.
Performance tests use representative multi-layer episodes, bounded textures/mesh grids, prompt release of GPU textures and progressive next-composition loading. Do not mark production/mobile performance proven by a desktop fixture screenshot.

## 9. Security, development mode and execution boundaries

Existing server `isAuthDisabled()` defaults to development bypass, but browser listeners still wait for Firebase auth and Dashboard duplicates that wait. Fix both in P1, during the build, not scaffold creation.
The bypass is strictly development-only and cannot be enabled by STUDIO_AUTH_DISABLED in production. It must not expose service credentials, ship passwords or weaken live Firestore rules. Test blank/stale browser sessions and production with the bypass flag present.
Use a server-authorized development bridge/identity with appropriately scoped local request checks; no anonymous endpoint may mint production editor sessions. Keep browser data readiness consistent with the server mode.
Current Firestore public episodes path collides with the proposed private Episode documents. P11 changes local rules explicitly; until owner deploys reviewed rules, this schema is not approved for a live environment.
Keep public output allowlisted and separate; all client writes remain denied for editorial data. Reader users/progress are not implemented.
No agent executes live cloud writes, paid models, identity provisioning, deployments, rules/IAM changes, live publication, remote deletion or destructive migrations in unattended phases. Fakes/local repositories are the default; local emulator tests are allowed only when truly isolated.
Never run `tests/smoke/smoke-e2e.mts` or `smoke-formats.mts` against the current .env during autonomous gates: they authenticate and write real records. Do not print .env, credentials or tokens.
P13 is the sole HUMAN-ONLY release/real-generation checkpoint; its owner may front-load configuration but is not assumed present during agent phases.
No commits, pushes or deployments by implementation agents. Headless runner permissions are not authority to ignore these boundaries.

## 10. What this breaks and transition strategy

| Existing area | Specific files/behavior replaced |
|---|---|
| Paragraph/source identity | src/features/sources/types.ts, store.ts, mappers.ts, edit-ops.ts; worker/extraction.mts, ingest.mts; source approve/edit routes. Changes p000001 IDs, mutable chapter projection, deletes/exclusions and revision invalidation. |
| Book Bible | src/features/bible/types.ts, mappers.ts, store.ts, components/book-bible.tsx; worker/bible-analyze.mts, bible-merge.mts, bible-synthesize.mts. Generic fields become typed model/ledger review. |
| Episode/Moment planning | src/features/episodes/*, src/features/moments/*, worker/episode-map.mts, story-moments.mts, moment-merge.mts. Source-nested plans and many-to-many scene mapping give way to canonical ranges and Beat representations. |
| Primary text | src/features/moment-text/*, components/moment-text-editor.tsx, worker/commentary.mts. One primary text becomes structured Beat text with complete-book representation. |
| Visuals | src/features/visual/*, src/features/images/*; worker/style-canon.mts, reference-images.mts, moment-images.mts, image-prompt.mts, image-api.mts. One flat active image becomes reference-pinned layered Composition revisions. |
| Queue/costs | src/features/jobs/*, src/app/api/jobs/route.ts, worker/index.mts, costs.mts and all job producers. allJobs map is retired for individual documents without losing idempotency/budgets. |
| Publishing | src/features/posting/*, src/features/completion/*, firestore.rules. Old live StoryMoment projection is replaced by versioned Episode bundles/catalog/pointers. |
| Auth/readiness | src/features/auth/constants.ts/session.ts, src/proxy.ts, src/services/firebase/use-live.ts, src/features/library/components/studio-dashboard.tsx, Studio layout/sign-out. |
| Tests | Existing source-string checks encode old paths/function locations; update narrowly with equivalent/new behavioral proof rather than deleting failing coverage. |

No old-data migration is required. Preserve the owner's untracked `new.md`, all existing unrelated changes, and every remote object.
Expand: P2 introduces shared contracts/preview beside current features; P3–P4 add canonical storage/job paths and temporary code adapters.
Move consumers: P5–P10 migrate current code consumers to the canonical flow with independent green gates. These are code transitions, not historical Firestore backfills.
Contract: P12 removes obsolete code/adapters only after references/tests prove no active caller needs them. Remove no cloud records or user files.
Where old source-string checks conflict with intentional changes, record why and test the new requirement plus the preserved surrounding behavior.

## 11. Verification, owner preparation and parked decision

Discovered existing commands: `npm.cmd run lint`, `npm.cmd run build`, and smoke:workflow, smoke:ui, smoke:episodes, smoke:bible, smoke:moments, smoke:text, smoke:visual, smoke:images, smoke:batch, smoke:posting, smoke:completion, smoke:operations, smoke:pdf, smoke:uncertainties.
No aggregate test script, runtime schema library, Three.js dependency or browser framework exists at scaffold time. New script names listed in phase gates are deliverables of their owning phases, not claims that those scripts already exist.
Windows PowerShell blocks npm.ps1 here; use npm.cmd. Node executes existing .mts fixtures via --experimental-strip-types. Keep tests runnable outside Next path aliases.
UI/rules smoke tests currently inspect source strings; they do not prove rendering or deployed security. P2 establishes real Playwright prior art; P11 adds isolated emulator proof if the environment permits it.
Every code phase runs lint/build and its listed relevant gates, records skips/failures explicitly, and never marks unverified code done. P12/audit run the full declared safe suite. No application gates were run during this documentation-only scaffold.
Owners may front-load development service/model configuration and local browser/emulator prerequisites. Credentials must never be committed or embedded in plan/prompt files.
Phase-specific OWNER/QA lines are authoritative instructions surfaced by preflight and QA.md. Supervised phases run alone and end qa-pending when unattended.
One artistic/model capability decision remains:

| ID | Question | Options | Blocks | Answer |
|---|---|---|---|---|
| D-1 | Does the owner-selected image model produce acceptably consistent, aligned alpha/depth assets from approved references? | Use existing configurable ImageProvider, assess a small owner-run paid sample, regenerate poor outputs; change model configuration if needed. No dedicated external 2.5D provider. | P13 real-asset acceptance only; all implementation uses honest fakes/fixtures. | Open until owner records real sample evidence in status.md. |

No other product-design choice is delegated to an unattended session. A new architectural decision goes to Deferred; plan.md and CONTEXT.md are read-only during execution.

## Phase breakdown

These phases implement the confirmed outcomes as cohesive slices. P2 proves one scene end to end before the broad canonical/pipeline refactor. P1 is isolated because development authentication affects both server and browser trust boundaries. P4/P5 isolate core processing changes; P11 isolates security rules; P12 is the contract/removal phase.
No application implementation is included in scaffold creation.

### P0 — Behavior-neutral preparation

- **Scope:** Record the existing lint/build/smoke baseline; split the 916-line image-studio component into focused components and extract worker queue/dispatch helpers without behavior changes. Preserve the current routes, approval gates, costs and recovery. Adapt source-string tests to follow extracted modules without weakening their behavioral claims.
- **Demoable outcome:** The existing editorial workflow remains usable with no behavior change and its baseline checks still pass.
- **Test seam:** Existing pure validators and queue helpers; compare pre/post behavior. Prior art: `tests/smoke/smoke-operations.mts`; `tests/smoke/smoke-editorial-ui.mjs`.
- **Repos:** Studio only, `C:/Users/800sa/studio`.
- **Files expected:** src/features/images/components/, worker/jobs/, worker/index.mts, tests/smoke/.
- **Gates:** `npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:workflow && npm.cmd run smoke:ui && npm.cmd run smoke:operations`
- **At-keyboard-only:** no
- **Depends on:** —
- **QA:** Open the current Studio workflow; verify tabs, image selection and job progress behave as before.

### P1 — Development access without sign-in

- **Scope:** Make next dev usable without an interactive login, including browser Firestore readiness and dashboard subscriptions. Unify the development mode from a trusted server decision, hide sign-out when bypassed, show actionable connection failures, and force production authentication on even if a bypass flag is set. Use the narrowest development-only data bridge or automatic identity compatible with current Firebase access; no public permissive rules, shipped credentials or production bypass. Reject any development identity at production session boundaries. Do not exercise live identity issuance during unattended testing. Add smoke:auth with development/production and request-boundary regression cases.
- **Demoable outcome:** A fresh local browser opens Studio without signing in; a production-mode request without a valid editor session is rejected.
- **Test seam:** Auth mode/session policy and local request boundary with fake Firebase auth; browser readiness transitions. Prior art: `tests/smoke/smoke-workflow-contract.mjs`; `tests/smoke/smoke-operations.mts`.
- **Repos:** Studio only, `C:/Users/800sa/studio`.
- **Files expected:** src/features/auth/, src/services/firebase/, src/app/studio/layout.tsx, src/app/api/auth/, src/proxy.ts, src/features/library/components/studio-dashboard.tsx.
- **Gates:** `npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:auth && npm.cmd run smoke:workflow && npm.cmd run smoke:ui`
- **At-keyboard-only:** yes; run alone. Unattended implementation ends qa-pending.
- **Depends on:** P0
- **QA:** Open a fresh local browser and verify live-data readiness without login; test production mode with the bypass flag set and confirm it still rejects anonymous access.
- **Owner checklist:** Before: use local fixtures/fakes; any real development Firebase identity or credentials are configured by the owner. During: stop before live auth changes or permissive rule deployment. After: verify anonymous development access and authenticated production isolation; unattended completion remains qa-pending.

### P2 — One complete 2.5D scene proof

- **Scope:** Add approved Zod/Three.js/React Three Fiber/Playwright dependencies (and Three.js type declarations if required). Build a deterministic local fixture with source paragraphs, one Moment and several Beats. Parse the fixture through canonical schemas, serve its assembled draft bundle through a local preview endpoint, and render that exact bundle with HTML subtitles, layer parallax, one depthMesh and forced CSS fallback. Add /studio/preview?fixture=room-entry without cloud writes. Controls are Beat/Moment/Episode selection, play, pause, scrub and next/previous only; no camera authoring. Add smoke:schemas and test:preview scripts and the first browser-test prior art. Clearly label fixture provenance; no paid generation or claims about model quality.
- **Demoable outcome:** An editor opens one bundled scene, reads its HTML subtitles and previews the same Beats with WebGL depth meshes or CSS layers.
- **Test seam:** EpisodeBundle parse/compile round-trip and pure resolveFrame; browser interaction against a local deterministic bundle. Prior art: `tests/smoke/smoke-posting.mts`; `tests/smoke/smoke-image-prompt.mts`; `new tests/book-experience/preview.spec.ts establishes the missing browser pattern`.
- **Repos:** Studio only, `C:/Users/800sa/studio`.
- **Files expected:** src/features/book-experience/schemas/, src/features/book-experience/preview/, src/features/book-experience/functions/, src/app/studio/preview/page.tsx, src/app/api/studio/preview/, fixtures/book-experience/, tests/book-experience/.
- **Gates:** `npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:schemas && npm.cmd run test:preview`
- **At-keyboard-only:** no
- **Depends on:** P1
- **QA:** Open /studio/preview?fixture=room-entry; play every Beat, switch Moment/Episode scopes, resize portrait/landscape and force CSS fallback. Confirm text remains readable and no manual camera input is required.

### P3 — Canonical source and complete schema foundation

- **Scope:** Complete every schema in plan section 3 and Firestore codecs; keep one shared source of truth. Promote approved SourceRevision to versioned canonical.json plus 20-paragraph chunk projections with sourceId, hash, kind and isStory. Adopt p000000-based seq scoped to a sourceId; retain source correction history and explicit downstream invalidation. Preserve current PDF/text/OCR/EPUB capabilities. Replace deleting non-story paragraphs with classification in the canonical flow. Stage generation outputs and promote active pointers only after validation; do not migrate or delete existing remote records. Build the source review/approval slice against local repositories/fakes, with invalid-source and promotion-interruption tests. Add smoke:canonical.
- **Demoable outcome:** A fixture source is approved into immutable canonical text, every paragraph remains traceable, and a correction revision marks dependent drafts outdated.
- **Test seam:** canonicalizeSource/promoteSource and storage codecs against fake repositories, with hash/ID/coverage validation. Prior art: `tests/smoke/smoke-pdf-cleaning.mts`; `tests/smoke/smoke-workflow-contract.mjs`.
- **Repos:** Studio only, `C:/Users/800sa/studio`.
- **Files expected:** src/features/book-experience/schemas/, src/features/book-experience/storage/, src/features/sources/, worker/extraction.mts, worker/ingest.mts, src/app/api/books/.
- **Gates:** `npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:schemas && npm.cmd run smoke:canonical && npm.cmd run smoke:pdf && npm.cmd run smoke:uncertainties`
- **At-keyboard-only:** no
- **Depends on:** P2
- **QA:** Approve a fixture source containing story and non-story paragraphs; inspect p000000, chunk sizes and immutable source pointer. Approve a correction and confirm old published bundles remain unchanged.

### P4 — Durable jobs and automatic planning orchestration

- **Scope:** Introduce one job document per job, transactional leases, heartbeats, retries, checkpoints, cancellation, idempotency and bounded concurrency. Wrap existing LLM/image transport behind LlmProvider/ImageProvider; do not add dedicated depth/segment/inpaint vendors. Automatically enqueue only the next eligible AI planning step after approval; expensive visual generation requires an explicit single/batch selection. Keep existing model configuration, budget confirmation and idempotent costs. Approval actions and plan repairs must be safe against duplicate clicks, stale versions and failed prerequisites. Add smoke:job-engine using fake clocks and providers; migrate callers incrementally while temporary code adapters remain until P12.
- **Demoable outcome:** Approving a fixture checkpoint advances the next planning job automatically; a killed/retried job resumes without repeating completed calls or costs.
- **Test seam:** claimJob/advancePipeline/resumeJob through fake clock, provider and repository boundaries. Prior art: `tests/smoke/smoke-operations.mts`; `tests/smoke/smoke-image-batch.mts`.
- **Repos:** Studio only, `C:/Users/800sa/studio`.
- **Files expected:** src/features/book-experience/jobs/, src/features/jobs/, worker/jobs/, worker/providers/, worker/index.mts, src/app/api/books/[bookId]/jobs/.
- **Gates:** `npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:job-engine && npm.cmd run smoke:operations && npm.cmd run smoke:batch && npm.cmd run smoke:workflow`
- **At-keyboard-only:** yes; run alone. Unattended implementation ends qa-pending.
- **Depends on:** P3
- **QA:** Approve twice, interrupt a fake multi-step job and resume it; verify one successor job, retained checkpoints and no duplicate completed-call charges. Confirm no visual generation starts without your selection.
- **Owner checklist:** Before: prepare deterministic job/provider fixtures, no live worker. During: stop before touching a live queue, paid providers or changing budget authority. After: inspect lease recovery, approval idempotency and cost accounting evidence; live kill/restart verification belongs to P13.

### P5 — Rolling ledger and redesigned Book Model

- **Scope:** Implement chapter-bounded understanding windows, overlap deduplication, compact entity/alias context, rolling synopsis, deterministic ledger deltas and per-window immutable checkpoints. Consolidate Entity/Event/state/reveal/relationship models with provenance. AI resolves alias conflicts and proposes merges/splits for approval; the owner never types entity data. Preserve approved editorial decisions on regeneration. Build searchable Entity table/detail and Event chronology review with source links, facts versus invented fills, pre-reveal identity and state-specific references. Keep existing supported terminology/chapter summaries as derived context rather than silently discarding them. Add smoke:book-model.
- **Demoable outcome:** An editor reviews an AI-proposed book model with evidence, separate storyTime and reveal seq, and approves it without entering fields.
- **Test seam:** applyLedgerDelta/consolidateModel/resolveEntityState and reveal visibility using schema-parsed fixtures and fake LLM responses. Prior art: `tests/smoke/smoke-bible.mts`; `tests/smoke/smoke-posting.mts`.
- **Repos:** Studio only, `C:/Users/800sa/studio`.
- **Files expected:** worker/book-model/, src/features/book-experience/book-model/, src/features/bible/, src/app/api/books/[bookId]/model/.
- **Gates:** `npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:book-model && npm.cmd run smoke:schemas && npm.cmd run smoke:bible`
- **At-keyboard-only:** yes; run alone. Unattended implementation ends qa-pending.
- **Depends on:** P4
- **QA:** Review a fixture with an alias change and flashback; verify correct state and spoiler-safe identity, reject a proposal and inspect the AI revision, then approve without entering data.
- **Owner checklist:** Before: prepare the alias/flashback fixtures. During: stop before paid understanding calls or changing the no-fabricated-facts rule. After: inspect deterministic replay, evidence validity and retained approvals; real-book model quality remains an owner check in P13.

### P6 — Story Map, Episodes and Moments

- **Scope:** AI creates StoryMap acts/arcs/chronology and strict Episode ranges, then per-episode plans and contiguous Moment ranges in book order. Retain existing boundary validation internals but remove required manual boundary/field editing from the primary UI. Build timeline review, source highlights, stage chips and approval-driven progression; invalid gaps/overlaps trigger bounded AI repair, not a blank form. New Moments are scene containers rather than the old primary-text/one-image StoryMomentPlan. Permit continuing later-episode production after an earlier episode is published. Add smoke:story-planning.
- **Demoable outcome:** An editor approves AI-proposed Episode and Moment ranges, sees complete story coverage, and proceeds through clear next-action buttons.
- **Test seam:** validateStoryCoverage/planEpisode/planMoments through fake AI output and deterministic range validators. Prior art: `tests/smoke/smoke-episode-map.mts`; `tests/smoke/smoke-moments.mts`.
- **Repos:** Studio only, `C:/Users/800sa/studio`.
- **Files expected:** src/features/book-experience/story-map/, src/features/episodes/, src/features/moments/, worker/story-planning/, src/app/api/books/[bookId]/episodes/.
- **Gates:** `npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:story-planning && npm.cmd run smoke:episodes && npm.cmd run smoke:moments`
- **At-keyboard-only:** no
- **Depends on:** P5
- **QA:** Inspect an AI map and moment timeline, inject a coverage gap and overlap, verify repair/blocking, and approve the valid proposal without changing boundaries manually.

### P7 — AI Beat planning and complete-book representation

- **Scope:** Generate structured quotes/dialogue/commentary, sentence-level grounding, source offsets, representations and semantic camera/transition plans. Every story paragraph needs a meaningful representation; arbitrary ID tagging is insufficient and explicit/internal meaning that visuals cannot preserve must remain in HTML subtitles. Preserve source order, split long text without dropping content, and gate entities by each Beat's seq. AI supplies every camera target, pose, timing and transition; the owner reviews/approves only. Reuse the fixture preview with clear pending-visual placeholders. Add smoke:beats and coverage-negative cases.
- **Demoable outcome:** An editor previews AI-planned Beats with readable subtitles and a complete paragraph-to-Beat coverage review, with no camera or text entry.
- **Test seam:** buildBeats/validateRepresentations/validateVerbatim/verifyCommentary/resolveRevealView with fake LLM and canonical source. Prior art: `tests/smoke/smoke-moment-text.mts`; `tests/smoke/smoke-posting.mts`; `tests/book-experience/preview.spec.ts from P2`.
- **Repos:** Studio only, `C:/Users/800sa/studio`.
- **Files expected:** src/features/book-experience/beats/, src/features/book-experience/coverage/, src/features/moment-text/, worker/beats/, worker/commentary.mts.
- **Gates:** `npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:beats && npm.cmd run smoke:text && npm.cmd run smoke:posting && npm.cmd run test:preview`
- **At-keyboard-only:** no
- **Depends on:** P6
- **QA:** Inspect a long passage and an internal thought: confirm all meaning survives across subtitles/visuals, quotes match source offsets, future identities stay hidden, and malformed coverage blocks approval.

### P8 — Immutable visual references and single/batch generation

- **Scope:** AI proposes book visualProfile and entity/state reference sets; generation is owner-triggered for one or multiple selected targets. Approve and version references before generating dependent scenes. Generate aligned clean background, RGBA foreground layers and optional depth assets directly through the configured ImageProvider using the same coordinate frame/reference versions. Use generated backgrounds with complete hidden coverage; do not introduce segmentation/depth/inpaint services or manual upload/edit tools. Validate outputs and expose targeted regenerate actions. Record immutable S3 keys, source/reference versions, actual bit depth, prompts, model, costs and continuity results. Add smoke:visual-generation; tests use deterministic images/fake uploads.
- **Demoable outcome:** An editor approves consistent references, selects one or several visual targets to generate, and regenerates a failed asset while approved assets remain unchanged.
- **Test seam:** assembleVisualRequest/validateAsset/planRegeneration through fake ImageProvider and S3 boundary; existing bounded batch pool. Prior art: `tests/smoke/smoke-image-prompt.mts`; `tests/smoke/smoke-image-batch.mts`; `tests/smoke/smoke-visual-system.mts`.
- **Repos:** Studio only, `C:/Users/800sa/studio`.
- **Files expected:** src/features/book-experience/visuals/, src/features/visual/, src/features/images/, worker/visuals/, worker/image-api.mts, worker/image-batch.mts.
- **Gates:** `npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:visual-generation && npm.cmd run smoke:images && npm.cmd run smoke:batch && npm.cmd run smoke:visual`
- **At-keyboard-only:** no
- **Depends on:** P7
- **QA:** Select one target and a batch, inspect their reference provenance, reject a foreground/depth asset and regenerate only the affected target. Verify reference approval blocks premature scene generation.

### P9 — Automatic 2.5D assembly and actionable previews

- **Scope:** Assemble generated layers into canonical compositions; resolve semantic AI targets to layer IDs, compute safeCamera from actual layer/background coverage and depth displacement, clamp/replan cameras and block unsafe compositions. Finish WebGL plane/depthMesh rendering, responsive crops, transition execution, DOM subtitles and CSS fallback with deterministic reduced capability. Provide direct Beat/Moment/Episode preview with layer/depth inspection, actionable blockers, approve-and-continue, generate selected and regenerate; no required camera/layer/text inputs. Empty/loading/error/outdated/partial states must be explicit. Add smoke:compose and extend test:preview with real rendering fixtures, context loss, forced fallback and source-to-episode progression.
- **Demoable outcome:** An editor previews a complete assembled Episode, clicks the exact action that resolves each blocker, and approves without setting camera directions or editing scene data.
- **Test seam:** assembleComposition/computeSafeCamera/resolveFrame/getNextAction plus P2 browser fixture seams. Prior art: `tests/smoke/smoke-image-prompt.mts`; `tests/book-experience/preview.spec.ts from P2`.
- **Repos:** Studio only, `C:/Users/800sa/studio`.
- **Files expected:** src/features/book-experience/compositions/, src/features/book-experience/preview/, worker/compositions/, src/app/studio/books/[bookId]/.
- **Gates:** `npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:compose && npm.cmd run smoke:beats && npm.cmd run test:preview`
- **At-keyboard-only:** yes; run alone. Unattended implementation ends qa-pending.
- **Depends on:** P8
- **QA:** Play Beat, Moment and Episode scopes; test camera extremes, portrait/landscape, reduced motion and forced CSS fallback. Follow a rejected-layer blocker to regeneration and back to preview with no manual scene authoring.
- **Owner checklist:** Before: use the deterministic asset fixture, then owner-supplied generated assets when available. During: stop before paid regeneration or weakening camera/coverage validation. After: visually inspect silhouettes, holes, layer order, subtitle legibility, motion comfort and fallback; browser automation cannot certify artistic quality.

### P10 — Independent episode publishing and safe regeneration

- **Scope:** Compile canonical EpisodeBundle/manifest with checksummed immutable AWS assets, source/reference lineage and per-Beat spoiler-safe entity views. Publish each completed Episode independently; upload/verify everything before atomically promoting its Firestore pointer and versioned book catalog reference. Build Published/Working revision/Compare preview modes, localized regeneration invalidation, explicit replacement approval, rollback and withdrawal. Never mutate a shared published composition. Preserve stable IDs and explicit old-to-new progress anchors where Beats change; define external Reader session pinning/catalog discovery without building that app. Add smoke:bundles and smoke:publishing with fake storage and publish-race/failure tests.
- **Demoable outcome:** Episode 1 becomes independently available in a fixture catalog; regenerating its visual leaves version 1 unchanged until approved version 2 is atomically promoted.
- **Test seam:** compileEpisodeBundle/publishEpisode/promoteRevision/resolveProgressAnchor through fake storage and compare-and-swap repository. Prior art: `tests/smoke/smoke-posting.mts`; `tests/smoke/smoke-completion.mts`; `tests/book-experience/preview.spec.ts from P2`.
- **Repos:** Studio only, `C:/Users/800sa/studio`.
- **Files expected:** src/features/book-experience/publishing/, src/features/posting/, src/features/completion/, src/app/api/books/[bookId]/published/, worker/publishing/.
- **Gates:** `npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:bundles && npm.cmd run smoke:publishing && npm.cmd run smoke:posting && npm.cmd run smoke:completion && npm.cmd run test:preview`
- **At-keyboard-only:** no
- **Depends on:** P9
- **QA:** Publish Episode 1 while Episode 2 is incomplete; regenerate a shared visual into a draft, compare, approve replacement, and roll the pointer back in fixtures. Confirm old bundles/assets and other episodes do not change.

### P11 — Canonical data access rules

- **Scope:** Isolate the security transition from the old public episodes/storyMoments paths to private editorial collections plus sanitized published pointers/catalog. Retain trusted server writes and editor-only working records; never make all books or descendants public. Add required indexes for per-job queries. Preserve production authentication and development-only access separation from P1. Test actual access with an available local Firestore emulator and existing SDK REST facilities where possible; do not add unapproved test dependencies. If emulator unavailable, run static tests but explicitly mark behavioral rules validation qa-pending. Do not deploy rules or create Reader progress/account write policies.
- **Demoable outcome:** Local rule tests distinguish editor drafts from published pointers and reject anonymous draft reads/client writes; deployment remains owner-controlled.
- **Test seam:** Firestore access-policy boundary through emulator requests for anonymous/editor identities; static checks are supplementary only. Prior art: `tests/smoke/smoke-firestore-rules.mjs`; `no existing emulator prior art, establish tests/book-experience/rules.mts without claiming static checks prove security`.
- **Repos:** Studio only, `C:/Users/800sa/studio`.
- **Files expected:** firestore.rules, firestore.indexes.json, src/features/book-experience/storage/, tests/smoke/smoke-firestore-rules.mjs, tests/book-experience/.
- **Gates:** `npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:auth && npm.cmd run smoke:posting && npm.cmd run smoke:publishing`
- **At-keyboard-only:** yes; run alone. Unattended implementation ends qa-pending.
- **Depends on:** P10
- **QA:** With local rules applied, verify anonymous users cannot read source/model/draft/job data, published pointers expose only sanitized fields, and direct client writes fail. Verify production never accepts development bypass.
- **Owner checklist:** Before: owner may prepare a local emulator and its runtime; no production console is needed for implementation. During: stop before rules deployment, IAM/CDN policy changes or live data access. After: review emulator evidence and production-mode auth negatives; deploy only in P13.

### P12 — Contract cleanup and complete workflow verification

- **Scope:** Contract the temporary code adapters only after all new callers and tests use canonical schemas; remove superseded code paths, not cloud data or the owner's new.md. Verify one complete local fixture from approved source through AI plans, selected visual generation, preview, independent publication and replacement. Preserve existing supported extraction/model-settings/cost features; remove required editorial form inputs from the primary flow. Run all package-defined smoke scripts, preview tests, lint and build; record baseline defects without silently fixing unrelated work. Do not create a Reader, distribution/payment features or extra documentation.
- **Demoable outcome:** A complete book fixture can be produced using approvals, single/batch visual generation and preview alone, and no retired storage/schema path remains a required consumer.
- **Test seam:** Local workflow fixtures through canonical schemas, fake provider/repository boundaries and the established preview browser tests. Prior art: `tests/smoke/smoke-workflow-contract.mjs`; `tests/book-experience/preview.spec.ts from P2`.
- **Repos:** Studio only, `C:/Users/800sa/studio`.
- **Files expected:** src/features/book-experience/, src/features/bible/, src/features/episodes/, src/features/moments/, src/features/posting/, worker/, tests/.
- **Gates:** `npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:workflow && npm.cmd run smoke:ui && npm.cmd run smoke:auth && npm.cmd run smoke:schemas && npm.cmd run smoke:canonical && npm.cmd run smoke:job-engine && npm.cmd run smoke:book-model && npm.cmd run smoke:story-planning && npm.cmd run smoke:beats && npm.cmd run smoke:visual-generation && npm.cmd run smoke:compose && npm.cmd run smoke:bundles && npm.cmd run smoke:publishing && npm.cmd run smoke:episodes && npm.cmd run smoke:bible && npm.cmd run smoke:moments && npm.cmd run smoke:text && npm.cmd run smoke:visual && npm.cmd run smoke:images && npm.cmd run smoke:batch && npm.cmd run smoke:posting && npm.cmd run smoke:completion && npm.cmd run smoke:operations && npm.cmd run smoke:pdf && npm.cmd run smoke:uncertainties && npm.cmd run test:preview`
- **At-keyboard-only:** no
- **Depends on:** P11
- **QA:** Produce the full fixture using only approvals and visual generation selections; verify every story paragraph is represented, all three preview scopes work, and published version 1 survives draft regeneration.

### P13 — Owner-only real generation and release acceptance

- **Scope:** Owner configures the selected image model and development services, runs a limited paid source/reference/layer/depth sample, evaluates continuity and complete-book representation, and resolves D-1. Owner validates on intended phones, deploys reviewed rules/application changes and explicitly publishes a sample Episode if desired. Agents must never run this phase unattended, issue paid model calls, deploy, delete existing remote data or publish live content. Do not treat completion of local code as completion of this phase.
- **Demoable outcome:** The owner verifies real generated assets produce an acceptable episode and explicitly decides whether to release the independently published version.
- **Test seam:** Human end-to-end visual acceptance plus deployed access/delivery checks, separate from local unit/browser proof. Prior art: `docs/FEATURE_TRACKER.md existing owner verification gaps`.
- **Repos:** Studio only, `C:/Users/800sa/studio`.
- **Files expected:** Owner-controlled external systems; docs/features/25d-schema-foundation/status.md verification record only.
- **Gates:** Owner-only verification; no unattended command.
- **At-keyboard-only:** yes; run alone. Unattended implementation ends qa-pending. HUMAN-ONLY: never dispatch this phase to an unattended agent.
- **Depends on:** P12; D-1 real sample evidence.
- **QA:** Generate an owner-approved real sample, check identity continuity/alpha/depth and subtitles on desktop and mobile, publish Episode 1, regenerate into a draft, verify readers retain version 1, then approve replacement and test rollback.
- **Owner checklist:** Before: choose/configure the existing image provider model, review its spend limit, configure development Firebase and S3/CloudFront, and review QA.md/audit findings. Model/credential setup can be front-loaded; real asset quality cannot be proven with fakes. During: owner alone authorizes paid generation, live publication, deployment and any deletion; no deletion is required by this plan. After: verify model capability, real asset alignment, CDN delivery, rule privacy and episode replacement/rollback. Record D-1's outcome without rewriting plan.md.

## Concurrency and waves

| Wave | Run together |
|---|---|
| 1 | P0 |
| 2 | P1 |
| 3 | P2 |
| 4 | P3 |
| 5 | P4 |
| 6 | P5 |
| 7 | P6 |
| 8 | P7 |
| 9 | P8 |
| 10 | P9 |
| 11 | P10 |
| 12 | P11 |
| 13 | P12 |
| 14 | P13 |

Sequential spine: P0 → P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8 → P9 → P10 → P11 → P12 → P13.
All phases run alone because they change shared schemas, package scripts, worker dispatch, storage paths or consumers built by their predecessors. No parallel agent build is approved by these waves.
Only one schema/contract/lockfile-writing phase may run at a time. Supervised auth/core/security/visual-acceptance phases are always solo.
P13 is placed last so no local implementation depends on paid generation or deployment. D-1 does not block fixture-based work, but cannot be declared resolved without real owner evidence.

## Rollback and abort

- Never git commit/push/deploy. Preserve the existing dirty worktree and untracked new.md.
- Before each phase, inventory tracked changes and untracked source files and record the baseline in the progress log without dumping secrets.
- Save a binary-safe tracked patch at `.patches/<phase>-studio.patch` using `git diff --binary --output=<path>`. Also save newly created non-secret source/test files as individual no-index binary patches or explicit copies under that phase's snapshot directory; plain git diff omits untracked files. Do not stage files just to make snapshots.
- A cumulative patch against HEAD is evidence, not a clean per-phase reversal. Record each phase's changed-file list and preserve its starting snapshot so selective recovery can distinguish owner changes and earlier phases.
- No git reset --hard, git checkout -- ., broad recursive deletion or whole-worktree restore. Rollback is an owner-reviewed selective restore against the relevant before/after snapshot.
- If a dependency did not land, implement only independent in-scope work, label any placeholder honestly, and finish qa-pending with the missing proof named. Never fake successful generation, approval or publication.
- If the plan itself is contradictory, log the exact contradiction in status.md Deferred and stop that phase; executing sessions cannot rewrite plan.md/CONTEXT.md to hide it.
- Failed/skipped gates cannot yield done. Use qa-pending only for complete code with named verification gaps; blocked means the required work did not land.
- The runner performs a final read-only AUDIT and writes QA.md; it does not make unresolved work production-ready.
