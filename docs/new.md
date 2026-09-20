```
                ┌────────────────────────────┐
   PDF ───────▶ │  STUDIO (Next.js)          │
                │  - upload / extraction UI  │
                │  - book model review       │
                │  - episode / moment / beat │
                │  - visual review + 2.5D    │
               │
                └─────────────┬──────────────┘
                              │ enqueues jobs, reads/writes Firestore
                ┌─────────────▼──────────────┐
                │  PIPELINE WORKER (Node)    │  long-running, resumable jobs
                │  - extract                 │
                │  - understand (ledger)     │
                │  - consolidate / map       │
                │  - plan / moments / beats  │
                │  - generate visuals        │
                │  - 2.5D build              │
                │  - publish (compile bundle)│
                └─────────────┬──────────────┘
                              │ writes published bundles + assets
                ┌─────────────▼──────────────┐
                │  CDN (CloudFront over S3)  │  images, depth maps, episode bundles
                └─────────────┬──────────────┘
```

**Stack**

- Next.js, TypeScript everywhere
- Firestore (working data + user progress), Firebase Storage (source PDFs, canonical text). Auth is off for development
- AWS S3 + CloudFront (all generated visuals)
- Worker: Node service with a queue. Must support jobs of 30+ minutes, retries, and
- Player rendering: three.js via react-three-fiber, CSS-3D fallback

These are enforced by validators in code, not by prompting.

## 4. Firestore data model

```
books/{bookId}                                   ─ one doc containg all about the book
  metaData:{title, author, genres[], description, coverPhotoUrl}
  sourceFile: { storagePath, originalFileName, sizeBytes, pageCount, checksum }
  visualProfile: { artStyle, palette[], lens, lighting, negativeRules[], lockedAt }
  pipeline: { stage, stageStatus, lastJobId, updatedAt }                   [added]
createdAt, updatedAt

books/{bookId}/textChunks/{chunkId}              ─ 20 paragraphs per doc (as designed)
  info:{index, startPage, endPage, seqStart, seqEnd}
  paragraphs: [{
    id, seq, page, chapterId, text, hash]
  }]


books/{bookId}/entities/{entityId}               ─ [changed] one collection, `type` field, replaces characters/locations/objects/aliases lists
  type: "character" | "location" | "object" | "group"
  canonicalName, aliases: [{ name, firstSeq, paragraphIds[] }]            [changed — aliases live on the entity]
  importance: "major" | "supporting" | "minor"
  firstSeq, lastSeq
  facts: [{ key, value, quote, paragraphIds[] }]                           ─ from the book                            ─ chosen where the book is silent; editable
  states: [{ stateId, label, validFromStoryTime, validToStoryTime, validFromSeq, changes: {key:value}, paragraphIds[] }]
  reveals: [{ what, seq, paragraphIds[] }]                                 [changed — reveal timeline lives per entity]
  relationships: [{ toEntityId, type, validFromSeq, validToSeq, paragraphIds[] }]
  visual {
    spec: string,                                                          ─ locked prompt fragment
    referenceSheet: { s3Keys[], approved, approvedBy, approvedAt },
    stateVariants: { [stateId]: { s3Keys[], approved } },
    preRevealSpec?: string                                                 ─ how to depict before their reveal (hooded, silhouette, …)
  }
  status: "draft" | "reviewed" | "locked"

books/{bookId}/events/{eventId}
  order, summary, seqStart, seqEnd, storyTime, participants[], locationId, objectIds[], kind, paragraphIds[]

books/{bookId}/derived/storyMap                  ─ [changed] single doc
  acts: [{ title, eventIds[] }], arcs: [{ entityId, summary, eventIds[] }]
  episodeProposals: [{ order, title, seqStart, seqEnd, rationale }]
  chronology: [{ storyTime, eventIds[] }]

books/{bookId}/derived/ledger                    ─ [added] the rolling registry used by the understanding pass (snapshot per window in Storage)

books/{bookId}/episodes/{episodeId}
  order, title, seqStart, seqEnd, chapterIds[], summary
  storyPlan { arc, momentOutline: [{ title, seqStart, seqEnd }], visualStrategy, reuseCandidates[] }
  stageStatus { planned, moments, beats, visuals, composed, previewed, published }
  publishedVersion

books/{bookId}/episodes/{episodeId}/moments/{momentId}
  order, seqStart, seqEnd, sourceParagraphIds[]
  summary, startState, endState, storyTime
  characters: [{ entityId, stateId }], locationId, locationStateId, objectIds[]
  exactTextSelections: [{ paragraphId, start, end, text }]
  dialogue: [{ paragraphId, start, end, text, speakerEntityId, addresseeEntityId? }]   [added — extracted, not written]
  commentary: [{ id, text, kind: "scene" | "context" | "clarify", groundedIn: paragraphIds[], verified: boolean }]
  visualPlan { shots: [{ shotId, description, entityStates[], framing, mood, timeOfDay, reuseKey }] }
  compositionIds[]                                                         ─ derived from compositions.usedIn
  readingBeats: [ Beat ]                                                   ─ array (typically 3–12)
  inspectableEntities: [{ entityId, beatId, hotspot }]
  status

books/{bookId}/compositions/{compositionId}
  reuseKey, originEpisodeId, usedIn: [{ episodeId, momentId, beatId }]     ─ source of truth for reuse
  shotSnapshot, entityStatesUsed[], continuityRefs: s3Keys[]
  master { s3Key, w, h }, depth { s3Key, bitDepth }
  layers: [{ layerId, role, entityId?, image, mask, depth, hiddenAreaImage, zOrder, depthRange, transform, renderMode }]
                                                                           [changed — masks/hiddenArea only at layer level]
  safeCamera { maxPanX, maxPanY, maxZoom, maxTilt }
  responsive { focalPoint, portraitCrop, landscapeCrop }
  qa { textDetected, agreementScore, identityScores: {entityId:score}, issues[] }   [added]
  generation { provider, model, prompt, negativePrompt, seed, referenceKeys[], costUsd }
  status: "generated" | "approved" | "rejected" | "composed" | "published"
  createdAt, updatedAt

books/{bookId}/jobs/{jobId}                      ─ [added]
  type, stage, status, progress { done, total }, checkpoint, attempts, error, costUsd, startedAt, finishedAt

books/{bookId}/published/{episodeId}             ─ [added] pointer
  version, bundleUrl, manifestUrl, sizeBytes, publishedAt, publishedBy

books/{bookId}/usage/{yyyymm}                    ─ [added] token + image spend per stage

users/{uid}/progress/{bookId}                    ─ Reader-owned
  episodeId, beatId, percent, updatedAt
```

- `sourceProvenance.AllSourceProvenance` → provenance is embedded on every fact, state, event and commentary sentence instead of a parallel list.
- `appearanceChanges` → folded into `entities.states`.
- `revealTimeline` → per-entity `reveals`; the story map holds an aggregated view if needed.
- `themesSymbols` → optional; not needed for visuals. Keep as a `derived/themes` doc if you want it for commentary flavour.
- `visuals.visualProfile` → top-level on the book (it is a book-wide style lock).
- `compositionReferences` on moments → derived from `compositions.usedIn` to avoid two sources of truth.
- `metaData.status` / `format` / `checksum` marked "ignore" → dropped or folded into `pipeline`/`sourceFile`.

---

## 5. Reading beat

```ts
type Beat = {
  id: string; // ep_03_m07_b02
  order: number;
  type: "quote" | "dialogue" | "commentary" | "mixed" | "title" | "transition";
  text: {
    quote?: { paragraphId: string; start: number; end: number; text: string };
    dialogue?: {
      speakerEntityId: string;
      speakerDisplayName: string;
      text: string;
      paragraphId: string;
    }[];
    commentary?: string; // plain language, grounded
  };
  compositionId: string;
  camera: {
    from: CameraPose;
    to: CameraPose; // { x, y, zoom, rotate } in normalized units
    durationMs: number;
    easing: "linear" | "easeInOut" | "spring";
    focusLayerId?: string;
  };
  transitionIn: {
    type: "cut" | "fade" | "slide" | "zoomThrough" | "parallaxShift";
    durationMs: number;
  };
  inspectables: {
    entityId: string;
    hotspot: { x: number; y: number; w: number; h: number };
  }[];
  autoAdvanceMs?: number; // undefined = wait for user
};
```

Rules: a beat has exactly one composition. A quote beat carries at most ~60 words on screen; longer passages split into consecutive beats over the same composition with camera drift. Dialogue beats show one exchange (2–4 lines).

```

### A4. Book model review

Show:

- `Entity.type`: `character | location | object | group`
- `canonicalName`, `aliases`, `importance`, `firstSeq`, `lastSeq`
- `facts`, `fills`, `states`, `reveals`, `relationships`
- fact provenance through `paragraphIds`
- alias conflicts and merge/split candidates
- `Event.summary`, `seqStart`, `seqEnd`, `storyTime`, `participants`, `locationId`, `objectIds`, `paragraphIds`

### A5. Story map and Episode board

Purpose: turn the book model into contiguous `Episode` and `Moment` ranges while preserving book order.

Show:

- `StoryMap.acts`, `StoryMap.arcs`, `StoryMap.episodeProposals`, `StoryMap.chronology`
- `Episode.order`, `title`, `seqStart`, `seqEnd`, `chapterIds`, `summary`, `stageStatus`
- `Moment.order`, `seqStart`, `seqEnd`, `sourceParagraphIds`, `summary`, `startState`, `endState`, `storyTime`, `status`

### A6. Moment and Beat editor

Each `Beat` must expose:

- `id`, `order`, `type`, `text`, `compositionId`
- `camera.from`, `camera.to`, `camera.durationMs`, `camera.easing`, `camera.focusLayerId`
- `transitionIn.type`, `transitionIn.durationMs`
- `inspectables`, `autoAdvanceMs`
- `representations[]`

Each `representations[]` entry uses these exact fields:

- `paragraphId`
- `modality`: `text | visual | camera | transition`
- `description`

### A7. Visual bible and Composition review

Purpose: establish visual consistency and approve generated `Composition` assets.

Show:

- `visualProfile.artStyle`, `palette`, `lens`, `lighting`, `negativeRules`, `lockedAt`
- `Entity.visual.spec`, `referenceSheet`, `stateVariants`, `preRevealSpec`
- `Composition.reuseKey`, `originEpisodeId`, `usedIn`, `shotSnapshot`, `entityStatesUsed`, `continuityRefs`
- `master`, `depth`, `layers`, `safeCamera`, `responsive`, `qa`, `generation`, `status`

## Data vocabulary — use these EXACT names

- `Book` — `bookId`, `title`, `author`, `genres`, `description`, `coverPhotoUrl`, `sourceFile`, `structure`, `stats`, `visualProfile`, `pipeline`, `publishing`, `createdBy`, `createdAt`, `updatedAt`
- `Paragraph` — `id`, `seq`, `page`, `chapterId`, `text`, `hash`, `kind`, `isStory`
- `Entity` — `entityId`, `type`, `canonicalName`, `aliases`, `importance`, `firstSeq`, `lastSeq`, `facts`, `fills`, `states`, `reveals`, `relationships`, `visual`, `status`
- `Event` — `eventId`, `order`, `summary`, `seqStart`, `seqEnd`, `storyTime`, `participants`, `locationId`, `objectIds`, `kind`, `paragraphIds`
- `StoryMap` — `acts`, `arcs`, `episodeProposals`, `chronology`
- `Episode` — `episodeId`, `order`, `title`, `seqStart`, `seqEnd`, `chapterIds`, `summary`, `storyPlan`, `stageStatus`, `publishedVersion`
- `Moment` — `momentId`, `order`, `seqStart`, `seqEnd`, `sourceParagraphIds`, `summary`, `startState`, `endState`, `storyTime`, `characters`, `locationId`, `locationStateId`, `objectIds`, `exactTextSelections`, `dialogue`, `commentary`, `visualPlan`, `compositionIds`, `readingBeats`, `inspectableEntities`, `status`
- `Beat` — `id`, `order`, `type`, `text`, `compositionId`, `camera`, `transitionIn`, `inspectables`, `autoAdvanceMs`, `representations`
- `Representation` — `paragraphId`, `modality`, `description`; `modality` is `text | visual | camera | transition`
- `Composition` — `compositionId`, `reuseKey`, `originEpisodeId`, `usedIn`, `shotSnapshot`, `entityStatesUsed`, `continuityRefs`, `master`, `depth`, `layers`, `safeCamera`, `responsive`, `qa`, `generation`, `status`
- `Layer` — `layerId`, `role`, `entityId`, `image`, `mask`, `depth`, `hiddenAreaImage`, `zOrder`, `depthRange`, `transform`, `renderMode`
- `Job` — `jobId`, `type`, `stage`, `status`, `progress`, `checkpoint`, `attempts`, `error`, `startedAt`, `finishedAt`
- `seq` — global book order and the reveal-safety position
- `storyTime` — in-story chronology used to resolve entity state
- `canonical.json` — the complete extracted source preserved in book order
- `ledger` — the checkpointed rolling registry built during understanding
- `visualProfile` — book-wide visual direction

Prototype labels, tables, filters, chips, fields, and state names must use these names so the prototype maps directly onto the planned data.


## 2. Pipeline design, stage by stage

### 2.1 Upload

- Accept PDF  Store in Firebase Storage, compute checksum, create `books/{bookId}`

### 2.2 Extract complete content


### 2.3 AI understands the entire book — the rolling ledger

The constraint: the whole book cannot go in one request, and even if it could, a single response cannot carry the whole model. The solution is a **sequential, windowed pass with a rolling registry ("ledger")**, followed by consolidation on the ledger rather than the text.

**Pass A — Windowed extraction (job `understand`)**

- Window = ~40–80 story paragraphs (~4–8K tokens), aligned to paragraph boundaries and never crossing a chapter boundary. Windows overlap by ~5 paragraphs for continuity.
- Each call receives:
  1. _System_: role, output JSON schema, the fidelity rules (only what the text says; quote evidence; use paragraph IDs).
  2. _Ledger slice_: compact registry of entities/aliases/locations/events so far. For big books, send the full alias index (small) plus only entities that are name-matched in this window or appeared in the last ~3 windows.
  3. _Rolling synopsis_: 150–300 words of "story so far", regenerated every window.
  4. _The window_: paragraphs as `[p000412] text…`.
- Each call returns **deltas only**:
```

newEntities[], newAliases[] (alias → canonicalId or "new"), facts[] (with quote + paragraphIds),
events[] (seq range, participants, location, storyTime hint), stateChanges[], reveals[],
relationshipChanges[], updatedSynopsis

```
- Code merges deltas into the ledger deterministically (dedupe by canonicalId; alias conflicts go to a review queue). Checkpoint the ledger to Storage after every window. A crash resumes from the last window.

**Pass B — Consolidation (job `consolidate`)**, runs on the ledger only:

1. Entity merge/split review: candidates with similar names or overlapping alias sets; the model proposes merges with evidence; editor confirms.
2. Per-entity finalization: canonical name, ordered facts, `fills` (only where the book is silent, each with a `reason`), states with `validFrom/To`, reveals.
3. Chronology: assign `storyTime` ordinals to events; flag flashbacks (events whose `storyTime` order differs from `seq` order).
4. Relationships with validity ranges.

### 2.4 Book model + story map → episodes (job `map`)

Input: the ordered event list (a compact outline of the whole book) + chapter structure. Output: `storyMap` with acts/arcs and **episode proposals** as `seqStart/seqEnd` ranges.

Sizing guidance in the prompt: an episode ≈ one chapter or 10–20 minutes of reading; boundaries fall at scene/chapter breaks, never mid-scene.

### 2.5 Story plan for each episode (job `plan_episode`)

Input: the episode's full original text + ledger slice for entities present + previous episode's end state. Output: `storyPlan` — arc, moment outline (each a `seq` range), visual strategy (which locations/characters dominate, time of day, mood shifts), reuse candidates (moments sharing location + character set + time).

A **moment** = a scene unit: same location, continuous time, stable cast. This definition is what makes composition reuse tractable.

Validator: moment ranges tile the episode.

### 2.6 Story moments (job `build_moments`)

For each moment, with its exact paragraphs and entity specs:

- `summary`, `startState`, `endState`, `storyTime`, characters with the **state valid at that storyTime**, location + state, objects.
- `exactTextSelections`: the passages worth showing verbatim (key descriptions, striking lines). Validator: exact substring.
- `dialogue`: every quoted line in the moment, attributed to a speaker entity. The model attributes; it does not write. Validator: exact substring; speaker must be present in the moment.
- `commentary`: 1–4 short plain-language sentences per moment of kind `scene` (what is happening), `context` (who this person is, as known so far), `clarify` (archaic phrasing, unfamiliar terms). Each sentence carries `groundedIn` paragraph IDs.
- `visualPlan.shots`: 1–4 shots with framing, entity states, mood, `reuseKey = hash(locationId, locationStateId, sorted entityId@stateId, timeOfDay, framingClass)`.
- `inspectableEntities`: major-character first appearances, reveals, key objects.

**Commentary grounding check** (job `verify_commentary`): a second call receives each sentence + its cited paragraphs + the ledger's _reveals as of this seq_ and answers per sentence: supported / unsupported / spoils-future. Unsupported and spoiler sentences are flagged and blocked from publish until edited.

### 2.7 Reading beats (job `build_beats`)

Split each moment into 3–12 beats. Rules in prompt + post-check:

- One composition per beat; quote beats ≤ ~60 words; dialogue beats 2–4 lines; commentary beats 1–5 sentences.
- Beats keep source order. A long passage becomes consecutive beats on the same composition with camera drift (push-in, pan to the speaking character, pull-back).
- Camera poses are proposed by the model in normalized units; clamped to the composition's `safeCamera` after 2.5D build.
- Transition choice follows the moment boundary type: `cut` within a moment, `fade`/`zoomThrough` across moments, `parallaxShift` for location continuity.

### 2.8 Visual bible (job `build_visual_bible`) — before any composition

- `visualProfile` for the book: art style, palette, lens/focal feel, lighting rules, negative rules ("no text, no watermarks, no modern objects").
- Per major entity: `visual.spec` compiled from facts + fills. Generate a **reference sheet** (front / three-quarter / profile, neutral expression, canonical outfit) and state variants (aged, injured, disguised) as needed. Locations get establishing shots (day/night as needed). Editors approve, regenerate, or edit specs.
- Pre-reveal spec for characters whose identity or face is hidden until a later `seq`.

The reference sheet is what every later generation conditions on. This is the single biggest lever for consistency

### 2.9 Compositions (job `generate_compositions`)

For each shot, in episode order:

1. **Reuse check**: if a composition with the same `reuseKey` exists and is approved, link it (`usedIn`) and skip generation.
2. **Prompt assembly**: visualProfile + shot description + entity specs for the states in play + reference images of those entities (and the location's establishing shot) as conditioning inputs. Negative prompt includes "text, letters, captions, watermark".
3. Generate 1 candidate. We can regenerate more if that one is not good enough.

4. Rank; editors pick or regenerate with a note. Approved → `status: approved`.

Provider choice: use an image model that accepts reference images / multi-image conditioning. This category moves fast; benchmark two or three current options against your own approved reference sheets before committing, and keep the adapter thin.

### 2.10 Image → layers → depth → 2.5D (job `compose_25d`)

1. Monocular depth estimation on the master → `depth.png` (16-bit).
2. Segmentation into layers: background, midground, one layer per foreground character/object (use the entity list to guide the segmenter). Typically 3–5 layers.
3. For each non-background layer, inpaint the area it occludes in the layer behind it (`hiddenAreaImage`) so parallax never shows holes.
4. Compute `safeCamera` from how much hidden area was recovered: the more inpaint margin, the wider the allowed pan/zoom.
5. Export layers, masks, per-layer depth crops, `depthRange`, `transform`. Produce mobile first variants and `responsive` crops around the focal point.
6. Clamp every beat camera that uses this composition to `safeCamera`.

MVP renders as layered planes with parallax plus subtle depth displacement on the background. Full mesh-per-layer can come later; the schema already carries `renderMode`/`mesh`.

### 2.11 Preview and publish

## 3. Studio UI (screens)

| Screen             | Purpose                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home            | All books, upload new books                                                                                                          |
| Dashboard      | The sidebar nav with the pipeline as routes, versions                                                                                       |
| Extraction  | Exracting pdf                                                                     |
| Book model         | Entities table (filter by type), entity detail (facts/fills/states/reveals/relationships/visual), chronology strip, alias review queue,
| Story map          | Acts/arcs summary, episode boundary editor on the paragraph timeline                                                                                  |
| Episode board      | Moments as cards on a seq timeline; status chips (plan/moments/beats/visuals/2.5D)                                                                             |
| Moment editor      | Source paragraphs, selections, dialogue attribution, commentary (with grounding flags), visual plan/shots, inspectables                                        |
| Beat editor        | Beat list, text payload, composition picker, camera keyframes by dragging on the preview, transitions, live Player                                             |
| Visual bible       | visualProfile lock; entity reference sheets and state variants with approve/regenerate                                                                         |
| Composition review | Candidates side by side, approve/reject/regenerate; reuse links                                                                                                |
| 2.5D review        | Layer inspector, depth view, safeCamera bounds, parallax scrub                                                                                                 |
| Publish            | Preview full episode, checklist (all validators green, all approvals present), publish                                                       |
| Settings           | AI Providers from openrouter/models,                                                                                                                                              |

## 7. Build phases

**Phase 1 — Upload & extraction**
Upload and extraction. This is already done

**Phase 2 — Understanding & book model**
Windowed ledger pass with checkpoints, consolidation, states/reveals/chronology views, etc

**Phase 3 — Story map, episodes, moments, beats**
Map job, episode plan, moments with selections/dialogue/commentary + grounding check, beats, validators `coverage.*`, `verbatim`, `spoiler`

**Phase 4 — Visual bible & compositions**
visualProfile, reference sheets with approval, composition generation with reuse

**Phase 5 — 2.5D build**
Depth, segmentation, inpainting, safeCamera, variants; 2.5D review; camera clamping; `@vb/player` rendering layers.

Also add mesh-per-layer rendering

---

## 8. Risks and mitigations

                   |

type Paragraph = {
id: string;
seq: number;
page: number;
chapterId: string;
text: string;
hash: string;
};
type Entity = {
entityId: string;
type: "character" | "location" | "object" | "group";
canonicalName: string;
aliases: { name: string; firstSeq: number; paragraphIds: string[] }[];
importance: "major" | "supporting" | "minor";
firstSeq: number;
lastSeq: number;
facts: {
  key: string;
  value: string;
  quote: string;
  paragraphIds: string[];
}[];
fills: { key: string; value: string; reason: string }[];
states: {
  stateId: string;
  label: string;
  validFromStoryTime: number;
  validToStoryTime: number;
  validFromSeq: number;
  changes: Record<string, string>;
  paragraphIds: string[];
}[];
reveals: { what: string; seq: number; paragraphIds: string[] }[];
relationships: {
  toEntityId: string;
  type: string;
  validFromSeq: number;
  validToSeq: number;
  paragraphIds: string[];
}[];
visual: {
  spec: string;
  referenceSheet: { approved: boolean };
  stateVariants: Record<string, { approved: boolean }>;
  preRevealSpec?: string;
};
status: "draft" | "reviewed" | "locked";
};
type Representation = {
paragraphId: string;
modality: "text" | "visual" | "camera" | "transition";
description: string;
};
type Beat = {
id: string;
order: number;
type: string;
text: string;
compositionId: string;
camera: {
  from: object;
  to: object;
  durationMs: number;
  easing: string;
  focusLayerId?: string;
};
transitionIn: { type: string; durationMs: number };
inspectables: string[];
autoAdvanceMs?: number;
representations: Representation[];
};
type Moment = {
momentId: string;
order: number;
seqStart: number;
seqEnd: number;
sourceParagraphIds: string[];
summary: string;
startState: string;
endState: string;
storyTime: number;
characters: { entityId: string; stateId: string }[];
locationId: string;
locationStateId: string;
objectIds: string[];
exactTextSelections: {
  paragraphId: string;
  start: number;
  end: number;
  text: string;
}[];
dialogue: {
  paragraphId: string;
  start: number;
  end: number;
  text: string;
  speakerEntityId: string;
}[];
commentary: {
  id: string;
  text: string;
  kind: "scene" | "context" | "clarify";
  groundedIn: string[];
  verified: boolean;
}[];
visualPlan: {
  shots: {
    shotId: string;
    description: string;
    entityStates: string[];
    framing: string;
    mood: string;
    timeOfDay: string;
    reuseKey: string;
  }[];
};
compositionIds: string[];
readingBeats: Beat[];
inspectableEntities: {
  entityId: string;
  beatId: string;
  hotspot: { x: number; y: number; w: number; h: number };
}[];
status: string;
};
type Composition = {
compositionId: string;
reuseKey: string;
originEpisodeId: string;
usedIn: { episodeId: string; momentId: string; beatId: string }[];
master: { gradient: string; label: string };
depth: { layers: number };
layers: {
  layerId: string;
  role: string;
  entityId?: string;
  zOrder: number;
  depthRange: [number, number];
}[];
safeCamera: {
  maxPanX: number;
  maxPanY: number;
  maxZoom: number;
  maxTilt: number;
};
responsive: {
  focalPoint: [number, number];
  portraitCrop: string;
  landscapeCrop: string;
};
qa: {
  textDetected: boolean;
  agreementScore: number;
  identityScores: Record<string, number>;
  issues: string[];
};
generation: { provider: "placeholder"; model: "css-svg"; costUsd: 0 };
status: "generated" | "approved" | "rejected" | "composed" | "published";
};
type Job = {
jobId: string;
type: string;
stage: string;
status: string;
progress: { done: number; total: number };
checkpoint: string;
attempts: number;
error?: string;
startedAt: string;
finishedAt?: string;
};
                                                                                                                                                                                                                                                                            |



```
