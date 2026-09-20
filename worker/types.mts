export type Paragraph = {
  id: string;
  seq: number;
  page: number;
  chapterId: string;
  text: string;
  hash: string;
  kind: string;
  isStory: boolean;
  unitIndex?: number;
  fragmentIndex?: number;
  fragmentCount?: number;
};

export type Chapter = {
  id: string;
  title: string;
  seqStart: number;
  seqEnd: number;
};

export type Evidence = { paragraphIds: string[] };

export type EntityType =
  | "character"
  | "location"
  | "object"
  | "group"
  | "concept";
export type Importance = "major" | "supporting" | "minor";
export type Certainty = "stated" | "claimed" | "implied";

export type Mention = {
  paragraphId: string;
  seq: number;
  source: "model" | "scan";
};

export type Fact = {
  key: string;
  value: string;
  quote: string;
  certainty: Certainty;
  claimedBy: string | null;
  firstSeq: number;
  /** False when the quote could not be located in the cited paragraphs. */
  verified: boolean;
} & Evidence;

export type EntityState = {
  stateId: string;
  label: string;
  validFromStoryTime: number;
  validToStoryTime: number | null;
  validFromSeq: number;
  changes: Record<string, string>;
  verified: boolean;
} & Evidence;

export type Reveal = { what: string; seq: number; verified: boolean } & Evidence;

export type Relationship = {
  toEntityId: string;
  type: string;
  validFromSeq: number;
  validToSeq: number | null;
  verified: boolean;
} & Evidence;

export type EntityProfile = {
  role: string;
  description: string;
  appearance: string;
  arc: string;
};

export type Entity = {
  entityId: string;
  type: EntityType;
  canonicalName: string;
  aliases: ({ name: string; firstSeq: number } & Evidence)[];
  importance: Importance;
  firstSeq: number;
  lastSeq: number;
  /** One line drawn from the introducing passage; the consolidated profile supersedes it. */
  description: string;
  parentLocationId: string | null;
  facts: Fact[];
  fills: { key: string; value: string; reason: string }[];
  states: EntityState[];
  reveals: Reveal[];
  relationships: Relationship[];
  mentions: Mention[];
  mentionCount: number;
  profile: EntityProfile | null;
};

export type Event = {
  eventId: string;
  order: number;
  summary: string;
  seqStart: number;
  seqEnd: number;
  chapterId: string;
  storyTime: number;
  storyOrder: number;
  isFlashback: boolean;
  participants: string[];
  locationId: string | null;
  objectIds: string[];
  kind: string;
  verified: boolean;
  paragraphIds: string[];
};

export type AnnotationMode =
  | "narration"
  | "dialogue"
  | "description"
  | "thought"
  | "song"
  | "letter"
  | "list"
  | "title"
  | "mixed";

/**
 * One per story paragraph. This is what makes the model whole: every paragraph
 * says who is there, where, what happens and what it would look like, so a
 * later pass can represent it without re-reading the world from scratch.
 */
export type Annotation = {
  paragraphId: string;
  seq: number;
  chapterId: string;
  summary: string;
  mode: AnnotationMode;
  presentEntityIds: string[];
  mentionedEntityIds: string[];
  speakerEntityIds: string[];
  locationId: string | null;
  timeMarker: string | null;
  mood: string;
  visualCue: string;
  eventIds: string[];
  /** True when no model annotation survived repair and a deterministic placeholder was written. */
  stub: boolean;
};

export type SceneRange = {
  sceneId: string;
  chapterId: string;
  seqStart: number;
  seqEnd: number;
  locationId: string | null;
  entityIds: string[];
  summary: string;
};

export type ChapterSummary = {
  chapterId: string;
  title: string;
  seqStart: number;
  seqEnd: number;
  summary: string;
  entityIds: string[];
  locationIds: string[];
};

export type CoverageReport = {
  storyParagraphs: number;
  annotated: number;
  annotatedByModel: number;
  stubbed: number;
  filtered: number;
  withEvent: number;
  withEntity: number;
  withLocation: number;
  missingAnnotationIds: string[];
  ok: boolean;
};

export type Diagnostics = {
  droppedItems: number;
  unverifiedItems: number;
  remappedEntityIds: number;
  merges: { keepEntityId: string; mergedEntityIds: string[]; reason: string }[];
  repairRoundsRun: number;
  modelCalls: number;
};

export type LedgerPhase = "extract" | "repair" | "consolidate" | "done";

export type World = {
  setting: string;
  era: string;
  premise: string;
  narration: string;
  tone: string;
};

export type Ledger = {
  sourceId: string;
  canonicalHash: string;
  phase: LedgerPhase;
  consolidationSteps: string[];
  processedWindow: number;
  processedUnitIndex: number;
  processedThroughSeq: number;
  coveredParagraphIds: string[];
  filteredParagraphIds: string[];
  filteredWindows: number[];
  rollingSynopsis: string;
  entities: Entity[];
  events: Event[];
  annotations: Record<string, Annotation>;
  aliasConflicts: { alias: string; entityIds: string[]; paragraphIds: string[] }[];
  sceneRanges: SceneRange[];
  chapterSummaries: ChapterSummary[];
  world: World | null;
  coverage: CoverageReport | null;
  diagnostics: Diagnostics;
};

export type Window = {
  index: number;
  owned: Paragraph[];
  contextBefore: Paragraph[];
  contextAfter: Paragraph[];
};

export type DeltaEntity = {
  entityId: string;
  type: EntityType;
  canonicalName: string;
  aliases: ({ name: string; firstSeq: number } & Evidence)[];
  importance: Importance;
  description: string;
  parentLocationId: string | null;
} & Evidence;

export type DeltaFact = {
  entityId: string;
  key: string;
  value: string;
  quote: string;
  certainty: Certainty;
  claimedBy: string | null;
} & Evidence;

export type DeltaEvent = {
  eventId: string;
  summary: string;
  kind: string;
  storyTimeHint: number;
  isFlashback: boolean;
  participants: string[];
  locationId: string | null;
  objectIds: string[];
  evidenceQuotes: string[];
} & Evidence;

export type DeltaStateChange = {
  entityId: string;
  stateId: string;
  label: string;
  validFromStoryTime: number;
  changes: Record<string, string>;
  evidenceQuotes: string[];
} & Evidence;

export type DeltaReveal = {
  entityId: string;
  what: string;
  evidenceQuotes: string[];
} & Evidence;

export type DeltaRelationship = {
  entityId: string;
  toEntityId: string;
  type: string;
  evidenceQuotes: string[];
} & Evidence;

export type DeltaAnnotation = Omit<Annotation, "seq" | "chapterId" | "stub">;

export type Delta = {
  entities: DeltaEntity[];
  facts: DeltaFact[];
  events: DeltaEvent[];
  stateChanges: DeltaStateChange[];
  reveals: DeltaReveal[];
  relationshipChanges: DeltaRelationship[];
  annotations: DeltaAnnotation[];
  aliasConflicts: { alias: string; entityIds: string[]; paragraphIds: string[] }[];
  updatedSynopsis: string;
};

export function emptyLedger(sourceId: string, canonicalHash: string): Ledger {
  return {
    sourceId,
    canonicalHash,
    phase: "extract",
    consolidationSteps: [],
    processedWindow: -1,
    processedUnitIndex: -1,
    processedThroughSeq: -1,
    coveredParagraphIds: [],
    filteredParagraphIds: [],
    filteredWindows: [],
    rollingSynopsis: "",
    entities: [],
    events: [],
    annotations: {},
    aliasConflicts: [],
    sceneRanges: [],
    chapterSummaries: [],
    world: null,
    coverage: null,
    diagnostics: {
      droppedItems: 0,
      unverifiedItems: 0,
      remappedEntityIds: 0,
      merges: [],
      repairRoundsRun: 0,
      modelCalls: 0,
    },
  };
}

/** Checkpoints written by an older worker lack later fields; fill them so a resume never crashes. */
export function upgradeLedger(
  value: Partial<Ledger> & Pick<Ledger, "sourceId" | "canonicalHash">,
): Ledger {
  const base = emptyLedger(value.sourceId, value.canonicalHash);
  const ledger: Ledger = {
    ...base,
    ...value,
    diagnostics: { ...base.diagnostics, ...(value.diagnostics ?? {}) },
  };
  ledger.entities = ledger.entities.map((entity) => ({
    ...entity,
    description: entity.description ?? "",
    parentLocationId: entity.parentLocationId ?? null,
    mentions: entity.mentions ?? [],
    mentionCount: entity.mentionCount ?? 0,
    profile: entity.profile ?? null,
    fills: entity.fills ?? [],
    facts: (entity.facts ?? []).map((fact) => ({
      ...fact,
      certainty: fact.certainty ?? "stated",
      claimedBy: fact.claimedBy ?? null,
      firstSeq: fact.firstSeq ?? 0,
      verified: fact.verified ?? true,
    })),
    states: (entity.states ?? []).map((state) => ({
      ...state,
      verified: state.verified ?? true,
    })),
    reveals: (entity.reveals ?? []).map((reveal) => ({
      ...reveal,
      verified: reveal.verified ?? true,
    })),
    relationships: (entity.relationships ?? []).map((relationship) => ({
      ...relationship,
      verified: relationship.verified ?? true,
    })),
  }));
  ledger.events = ledger.events.map((event) => ({
    ...event,
    chapterId: event.chapterId ?? "",
    storyOrder: event.storyOrder ?? event.order,
    isFlashback: event.isFlashback ?? false,
    verified: event.verified ?? true,
  }));
  return ledger;
}
