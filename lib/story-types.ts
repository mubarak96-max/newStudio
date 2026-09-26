/**
 * Story planning contract shared by the worker (writer) and Studio (reader).
 *
 * Firestore layout:
 *   books/{bookId}/derived/storyMap
 *   books/{bookId}/episodes/{episodeId}
 *   books/{bookId}/episodes/{episodeId}/moments/{momentId}
 *
 * Seq ranges are inclusive. Episodes tile every paragraph of the source exactly
 * once; Moments tile their Episode's range exactly once.
 */

export type Lineage = { sourceId: string; canonicalHash: string };

export type StoryAct = {
  order: number;
  title: string;
  summary: string;
  seqStart: number;
  seqEnd: number;
  eventIds: string[];
};

export type StoryArc = {
  arcId: string;
  title: string;
  summary: string;
  entityIds: string[];
  eventIds: string[];
};

export type EpisodeProposal = {
  order: number;
  title: string;
  rationale: string;
  seqStart: number;
  seqEnd: number;
};

export type StoryMap = Lineage & {
  schemaVersion: 1;
  jobId: string;
  workerVersion: string;
  acts: StoryAct[];
  arcs: StoryArc[];
  episodeProposals: EpisodeProposal[];
  /** Events grouped by represented time, ascending. */
  chronology: { storyTime: number; eventIds: string[] }[];
  /** How the episode boundaries were produced, for the review screen. */
  planning: { source: 'model' | 'fallback'; notes: string[] };
};

export type StageState = 'pending' | 'running' | 'done' | 'failed';

export type MomentOutlineItem = {
  momentId: string;
  title: string;
  purpose: string;
  seqStart: number;
  seqEnd: number;
};

export type EpisodeStoryPlan = {
  arc: string;
  openingState: string;
  endingState: string;
  emotionalProgression: string;
  revealProgression: string[];
  keyEventIds: string[];
  visualStrategy: string;
  reuseCandidates: string[];
  momentOutline: MomentOutlineItem[];
};

export type Episode = Lineage & {
  schemaVersion: 1;
  episodeId: string;
  order: number;
  title: string;
  summary: string;
  seqStart: number;
  seqEnd: number;
  chapterIds: string[];
  paragraphCount: number;
  storyParagraphCount: number;
  wordCount: number;
  storyPlan: EpisodeStoryPlan | null;
  stageStatus: { planned: StageState; moments: StageState; beats?: StageState; composed?: StageState };
  momentCount: number;
  beatCount?: number;
  warnings: string[];
};

export type TextSelection = {
  paragraphId: string;
  start: number;
  end: number;
  text: string;
};

export type Dialogue = TextSelection & {
  speakerEntityId: string | null;
  addresseeEntityId: string | null;
};

export type Commentary = {
  id: string;
  text: string;
  kind: 'scene' | 'context' | 'clarify';
  groundedIn: string[];
  verified: boolean;
  issues: string[];
};

export type Shot = {
  shotId: string;
  description: string;
  entityStates: { entityId: string; stateId: string | null }[];
  framing: string;
  mood: string;
  timeOfDay: string;
  /**
   * Each shot names its own place. A Moment-wide location put a garden shot
   * inside a mansion and an interior close-up outside on the lawn.
   */
  locationId: string | null;
  locationStateId: string | null;
  reuseKey: string;
  /** Absent only on legacy plans, which must be rebuilt before generation. */
  direction?: {
    sourceParagraphIds: string[];
    sourceEvidence?: { paragraphId: string; text: string }[];
    sourceSeq?: number;
    presentation: 'physical' | 'memory' | 'dream' | 'imagined' | 'perception' | 'descriptive';
    purpose: string;
    changeReason: string;
    focusRegions: { entityId: string; x: number; y: number; w: number; h: number }[];
  };
};

export type MomentEntityState = { entityId: string; stateId: string | null };

export type Moment = Lineage & {
  schemaVersion: 1;
  momentId: string;
  episodeId: string;
  order: number;
  title: string;
  seqStart: number;
  seqEnd: number;
  /** Story paragraphs in the range; non-story paragraphs stay in the range but are not listed. */
  sourceParagraphIds: string[];
  wordCount: number;
  summary: string;
  startState: string;
  endState: string;
  storyTime: number;
  characters: MomentEntityState[];
  locationId: string | null;
  locationStateId: string | null;
  objectIds: string[];
  eventIds: string[];
  exactTextSelections: TextSelection[];
  dialogue: Dialogue[];
  commentary: Commentary[];
  visualPlan: { shots: Shot[] };
  inspectableEntities: { entityId: string; reason: string }[];
  compositionIds: string[];
  readingBeats: Beat[];
  /** Filled by the Beats job; null until it has run for this Moment. */
  beatCoverage: BeatCoverage | null;
  status: 'planned' | 'fallback';
  warnings: string[];
};

/**
 * Camera x/y are signed fractions of the composition from its centre
 * (positive x right, positive y down); zoom 1 is the fitted view and never
 * below 1; rotate is radians around the screen normal.
 */
export type CameraPose = { x: number; y: number; zoom: number; rotate: number };

export type CameraMove = 'hold' | 'push-in' | 'pull-back' | 'pan-left' | 'pan-right' | 'tilt-up' | 'tilt-down' | 'drift';

export type Representation = {
  paragraphId: string;
  modality: 'text' | 'visual' | 'camera' | 'transition';
  description: string;
};

export type Beat = {
  id: string;
  order: number;
  /** Seq of the first paragraph the Beat represents; Beats run in source order. */
  seq: number;
  type: 'quote' | 'dialogue' | 'commentary' | 'mixed' | 'title' | 'transition';
  text: {
    quote?: TextSelection;
    dialogue?: (Dialogue & { speakerDisplayName: string | null })[];
    commentary?: Commentary[];
  };
  shotId: string | null;
  compositionId: string | null;
  camera: {
    move: CameraMove;
    from: CameraPose;
    to: CameraPose;
    durationMs: number;
    easing: 'linear' | 'easeInOut' | 'spring';
    focusEntityId: string | null;
    rationale: string;
  };
  transitionIn: { type: 'cut' | 'fade' | 'slide' | 'zoomThrough' | 'parallaxShift'; durationMs: number };
  inspectables: { entityId: string; hotspot: { x: number; y: number; w: number; h: number } | null }[];
  /** Undefined means the reader advances; subtitles never auto-advance on their own. */
  autoAdvanceMs: number | null;
  representations: Representation[];
  /** Reading-order neighbours across Moment and Episode boundaries. */
  previousBeatId: string | null;
  nextBeatId: string | null;
};

export type BeatCoverage = {
  storyParagraphs: number;
  representedByModel: number;
  representedByFallback: string[];
  words: number;
  wordsShownVerbatim: number;
  /**
   * Paragraphs the reader actually reads, and those only shown as a picture.
   * A picture is never coverage of the book's words: `shownAsText` is the only
   * number that says how much of the book an Episode really carries.
   */
  shownAsText: number;
  visualOnly: number;
  warnings: string[];
};

export type VisualProfile = {
  version: number;
  artStyle: string;
  medium: string;
  palette: string[];
  lens: string;
  lighting: string;
  texture: string;
  eraDetails: string;
  negativeRules: string[];
};

export type EntityVisualPlan = {
  entityId: string;
  /** Locked prompt fragment compiled from source facts plus labelled fills. */
  spec: string;
  sourceFacts: { key: string; value: string; paragraphIds: string[] }[];
  fills: { key: string; value: string; reason: string }[];
  referenceSheet: { views: string[]; prompt: string; approved: boolean };
  stateVariants: Record<string, { label: string; spec: string; validFromSeq: number; approved: boolean }>;
  preRevealSpec: string | null;
  hiddenUntilSeq?: number | null;
  /** Location-only layout notes: zones, entrances and anchors. */
  layout: string | null;
};

export type LayerPlan = {
  layerId: string;
  role: 'background' | 'midground' | 'foreground';
  /**
   * How the image is made. 'master' is one complete scene with everyone in it,
   * at the right scale because it was painted in one go: it is approved first
   * and it is what plays when layering fails. 'plate' is the same scene with
   * nobody in it and 'figure' is one cut-out, both derived from the approved
   * master rather than invented separately.
   */
  kind?: 'master' | 'plate' | 'figure';
  /** The layer this one is derived from, which must be approved first. */
  derivedFrom?: string | null;
  entityId: string | null;
  /** The mechanical prompt: style line, place, shot and cast, concatenated. */
  prompt: string;
  /**
   * The same shot written as art direction by a model and checked against the
   * prompt contract (staging, light, lens, scale anchors). Null when authoring
   * was refused, in which case `prompt` is used as it stands.
   */
  authoredPrompt?: string | null;
  promptVersion?: string;
  transparent: boolean;
  /** Larger is closer. */
  zOrder: number;
  /** [far, near] in [0, 1]; larger is closer, ranges never run backwards. */
  depthRange: [number, number];
  renderMode: 'plane' | 'depthMesh';
  mesh: { segmentsX: number; segmentsY: number; displacementScale: number } | null;
  /**
   * Where a cut-out sits in the 9:16 frame, as fractions of the frame: its
   * horizontal centre, its height, and how far down its lowest visible point
   * is. Figures generated separately would otherwise all land centred on top
   * of each other.
   */
  placement?: { centerX: number; heightFraction: number; baseline: number } | null;
  /**
   * Everyone drawn in this layer. A shot with several characters gets one
   * cast layer holding all of them: generated separately, figures came back
   * duplicated and on top of each other.
   */
  entityIds?: string[];
};

/**
 * 2.5D targets decided before any image exists, from how the Beats that use
 * the composition actually move. The real safe camera is computed again from
 * the generated layers; these numbers are what generation must make possible.
 */
export type Stage25dPlan = {
  /** The largest movement any Beat asks of this composition. */
  cameraEnvelope: { maxPanX: number; maxPanY: number; maxZoom: number; maxTilt: number };
  plannedSafeCamera: { maxPanX: number; maxPanY: number; maxZoom: number; maxTilt: number };
  /** Fraction of the frame the background must extend beyond each edge. */
  backgroundOverscan: { x: number; y: number };
  /** Background canvas size relative to the visible frame. */
  backgroundCanvas: { width: number; height: number };
  /** Relative on-screen movement per layer for a camera pan of 1; the background moves least. */
  parallax: Record<string, number>;
};

/** A layer as the player uses it: the approved image, keyed to real transparency when it was a cut-out. */
export type AssembledLayer = {
  layerId: string;
  role: LayerPlan['role'];
  entityId: string | null;
  /** Everyone drawn in the layer; a cast layer holds several figures. */
  entityIds?: string[];
  url: string;
  s3Key: string;
  width: number;
  height: number;
  zOrder: number;
  depthRange: [number, number];
  /** Share of the image that stays visible; a cut-out that is all or nothing is flagged. */
  opaqueFraction: number;
  /** Normalized top-left box around the visible pixels, used for tap targets. */
  bbox: { x: number; y: number; w: number; h: number } | null;
  /** How far the layer moves for a camera pan of 1; nearer layers move more. */
  parallax: number;
  /** Scale applied so the layer covers the frame through the whole camera range. */
  scale: number;
  sourceVersionId: string;
};

/** Measured from the actual images; the Beats' cameras are clamped to `safeCamera`. */
export type CompositionAssembly = {
  status: 'composed' | 'issues';
  /**
   * 'layered' plays the derived plate and cut-outs with parallax; 'flat' plays
   * the approved master alone with camera movement only. A composition that
   * cannot be layered still plays.
   */
  mode?: 'layered' | 'flat';
  masterUrl?: string;
  degradationReason?: string | null;
  layers: AssembledLayer[];
  safeCamera: { maxPanX: number; maxPanY: number; maxZoom: number; maxTilt: number };
  issues: string[];
  /** Approved version per layer at assembly time; a change marks the assembly stale. */
  fingerprint: string;
  composedAt: string;
};

export type CompositionPlan = Lineage & {
  schemaVersion: 1;
  compositionId: string;
  reuseKey: string;
  originEpisodeId: string;
  usedIn: { episodeId: string; momentId: string; beatId: string }[];
  shotSnapshot: Shot;
  locationId: string | null;
  entityStatesUsed: MomentEntityState[];
  referenceEntityIds: string[];
  visualProfileVersion: number;
  prompt: string;
  negativePrompt: string;
  layers: LayerPlan[];
  stage25d: Stage25dPlan;
  /** Mobile first: every layer is generated on the same 9:16 phone canvas. */
  responsive: { focalPoint: [number, number]; aspect: '9:16' };
  status: 'planned';
  /** Written by the 2.5D assembly job once every layer has an approved image. */
  assembly?: CompositionAssembly;
};

/**
 * One image the owner generates on demand. The target ID is derived from what
 * it depicts, so regenerating adds a version to the same document:
 *   ref__{entityId} · var__{entityId}__{stateId} · layer__{compositionId}__{layerId}
 */
export type AssetKind = 'reference' | 'variant' | 'layer';

export type AssetTarget = {
  kind: AssetKind;
  entityId: string | null;
  stateId: string | null;
  compositionId: string | null;
  layerId: string | null;
};

export type AssetVersion = {
  versionId: string;
  s3Key: string;
  url: string;
  contentType: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  checksum: string;
  model: string;
  costUsd: number;
  prompt: string;
  note: string | null;
  /** Approved references this image was conditioned on, pinned by version. */
  references: { targetId: string; versionId: string }[];
  /** Foreground layers come back on flat green for the 2.5D step to key out. */
  alpha: 'none' | 'chroma-green';
  /** OpenRouter returns one image at once; Gemini batches return later at half price. */
  provider: 'openrouter' | 'gemini-batch';
  /** False when the cost is estimated from token counts rather than billed by the provider. */
  costExact: boolean;
  planKey?: string;
  visualProfileVersion?: number;
  /**
   * Mechanical checks only: the 9:16 canvas, one scene rather than a sheet or
   * a strip, and a green screen behind a cut-out. Everything else about an
   * image is reviewed by hand. Null for images generated before checks existed.
   */
  check?: { ok: boolean; issues: string[]; checkedAt: string; version?: string; semantic?: boolean } | null;
  createdAt: string;
};

export type ImageBatchItem = {
  key: string;
  targetId: string;
  target: AssetTarget;
  note: string | null;
  prompt: string;
  role: string;
  alpha: AssetVersion['alpha'];
  episodeId: string | null;
  references: AssetVersion['references'];
  planKey?: string;
  visualProfileVersion?: number;
  expectation?: { cutOut: boolean } | null;
};

export type ImageBatch = Lineage & {
  batchId: string;
  /** Gemini's name for the batch, `batches/…`. */
  providerName: string;
  model: string;
  status: 'submitted' | 'running' | 'completed' | 'failed';
  providerState: string;
  items: ImageBatchItem[];
  counts: { total: number; saved: number; failed: number };
  error: string | null;
  jobId: string;
  submittedAt: string;
  completedAt: string | null;
};

export type VisualAsset = Lineage &
  AssetTarget & {
    targetId: string;
    episodeId: string | null;
    /** `batched`: waiting inside a Gemini batch whose results have not arrived yet. */
    status: 'generating' | 'batched' | 'generated' | 'approved' | 'failed';
    versions: AssetVersion[];
    approvedVersionId: string | null;
    error: string | null;
    lastJobId: string | null;
    batchId?: string | null;
  };

export function assetTargetId(target: AssetTarget): string {
  if (target.kind === 'reference') return `ref__${target.entityId}`;
  if (target.kind === 'variant') return `var__${target.entityId}__${target.stateId}`;
  return `layer__${target.compositionId}__${target.layerId}`;
}

export type VisualForecast = {
  compositions: number;
  shotsPlanned: number;
  reuseRate: number;
  referenceSheets: number;
  stateVariants: number;
  imagesToGenerate: number;
  costPerImageUsd: number;
  estimatedCostUsd: number;
};

export type VisualPlanSummary = Lineage & {
  schemaVersion: 1;
  jobId: string;
  visualProfile: VisualProfile;
  forecast: VisualForecast;
  notes: string[];
};
