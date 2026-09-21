import { consolidationModels, profileBatchSize } from "./config.mts";
import { asBoolean, asNumber, asString, nullableString, records, strings } from "./coerce.mts";
import { unique } from "./evidence.mts";
import {
  assignImportance,
  buildSceneRanges,
  enrichAnnotations,
  entitiesByMentions,
  inheritLocations,
  scanMentions,
} from "./mentions.mts";
import { computeCoverage } from "./coverage.mts";
import { callJsonModel } from "./openrouter.mts";
import {
  chapterSystemPrompt,
  chronologySystemPrompt,
  mergeSystemPrompt,
  profileSystemPrompt,
  worldSystemPrompt,
} from "./prompts.mts";
import type { Chapter, Entity, EntityType, Ledger, Paragraph } from "./types.mts";

export type ConsolidationContext = {
  ledger: Ledger;
  paragraphs: Paragraph[];
  chapters: Chapter[];
  onActivity: (activity: {
    label: string;
    detail: string;
    done: number;
    total: number;
    unit: string;
  }) => Promise<void>;
  /** Called after each completed step so a checkpoint can be written. */
  onStep: (step: string, cost: number) => Promise<void>;
  log: (message: string) => void;
};

/**
 * Consolidation runs at the end of a job that has already spent an hour
 * reading the book, so one refused or truncated call must not throw the work
 * away. A failed step degrades to its deterministic fallback and says so.
 */
async function callModel(
  context: ConsolidationContext,
  label: string,
  system: string,
  payload: unknown,
): Promise<{ parsed: unknown; cost: number }> {
  try {
    const result = await callJsonModel({
      system,
      user: JSON.stringify(payload),
      models: consolidationModels,
      label,
    });
    context.ledger.diagnostics.modelCalls += 1;
    return { parsed: result.parsed, cost: result.cost };
  } catch (error) {
    context.log(
      `${label} failed, continuing without it: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { parsed: {}, cost: 0 };
  }
}

function findEntity(ledger: Ledger, entityId: string): Entity | undefined {
  return ledger.entities.find((entity) => entity.entityId === entityId);
}

function remapEntityReferences(ledger: Ledger, from: string, to: string): void {
  const swap = (id: string | null) => (id === from ? to : id);
  const swapAll = (ids: string[]) => unique(ids.map((id) => (id === from ? to : id)));
  for (const entity of ledger.entities) {
    entity.parentLocationId = entity.parentLocationId === from ? to : entity.parentLocationId;
    if (entity.parentLocationId === entity.entityId) entity.parentLocationId = null;
    for (const fact of entity.facts) fact.claimedBy = swap(fact.claimedBy);
    entity.relationships = entity.relationships
      .map((relationship) => ({ ...relationship, toEntityId: swap(relationship.toEntityId)! }))
      .filter((relationship) => relationship.toEntityId !== entity.entityId);
  }
  for (const event of ledger.events) {
    event.participants = swapAll(event.participants);
    event.locationId = swap(event.locationId);
    event.objectIds = swapAll(event.objectIds);
  }
  for (const annotation of Object.values(ledger.annotations)) {
    annotation.presentEntityIds = swapAll(annotation.presentEntityIds);
    annotation.mentionedEntityIds = swapAll(annotation.mentionedEntityIds);
    annotation.speakerEntityIds = swapAll(annotation.speakerEntityIds);
    annotation.locationId = swap(annotation.locationId);
  }
  for (const conflict of ledger.aliasConflicts) conflict.entityIds = swapAll(conflict.entityIds);
}

export function applyMerge(ledger: Ledger, keepId: string, mergeIds: string[], reason: string): boolean {
  const keep = findEntity(ledger, keepId);
  if (!keep) return false;
  const merged: string[] = [];
  for (const mergeId of mergeIds) {
    const other = findEntity(ledger, mergeId);
    if (!other || other === keep) continue;
    if (
      !keep.aliases.some((alias) => alias.name.toLowerCase() === other.canonicalName.toLowerCase()) &&
      other.canonicalName.toLowerCase() !== keep.canonicalName.toLowerCase()
    ) {
      keep.aliases.push({
        name: other.canonicalName,
        firstSeq: other.firstSeq,
        paragraphIds: other.mentions.slice(0, 3).map((mention) => mention.paragraphId),
      });
    }
    for (const alias of other.aliases) {
      if (!keep.aliases.some((candidate) => candidate.name.toLowerCase() === alias.name.toLowerCase()))
        keep.aliases.push(alias);
    }
    keep.facts.push(
      ...other.facts.filter(
        (fact) => !keep.facts.some((candidate) => candidate.key === fact.key && candidate.value === fact.value),
      ),
    );
    keep.states.push(...other.states.filter((state) => !keep.states.some((candidate) => candidate.stateId === state.stateId)));
    keep.reveals.push(...other.reveals.filter((reveal) => !keep.reveals.some((candidate) => candidate.what === reveal.what)));
    keep.relationships.push(
      ...other.relationships.filter(
        (relationship) =>
          !keep.relationships.some(
            (candidate) => candidate.toEntityId === relationship.toEntityId && candidate.type === relationship.type,
          ),
      ),
    );
    const known = new Set(keep.mentions.map((mention) => mention.paragraphId));
    keep.mentions.push(...other.mentions.filter((mention) => !known.has(mention.paragraphId)));
    keep.mentions.sort((left, right) => left.seq - right.seq);
    keep.mentionCount = keep.mentions.length;
    keep.firstSeq = Math.min(keep.firstSeq, other.firstSeq);
    keep.lastSeq = Math.max(keep.lastSeq, other.lastSeq);
    if (!keep.description && other.description) keep.description = other.description;
    if (!keep.parentLocationId && other.parentLocationId && other.parentLocationId !== keep.entityId)
      keep.parentLocationId = other.parentLocationId;
    ledger.entities = ledger.entities.filter((entity) => entity !== other);
    remapEntityReferences(ledger, other.entityId, keep.entityId);
    merged.push(other.entityId);
  }
  if (merged.length === 0) return false;
  ledger.diagnostics.merges.push({ keepEntityId: keep.entityId, mergedEntityIds: merged, reason });
  return true;
}

async function stepMerge(context: ConsolidationContext): Promise<number> {
  const { ledger } = context;
  const compact = ledger.entities.map((entity) => ({
    entityId: entity.entityId,
    type: entity.type,
    canonicalName: entity.canonicalName,
    aliases: entity.aliases.map((alias) => alias.name),
    parentLocationId: entity.parentLocationId,
    mentionCount: entity.mentionCount,
    description: entity.description.slice(0, 200),
  }));
  let cost = 0;
  const chunkSize = 250;
  for (let offset = 0; offset < compact.length; offset += chunkSize) {
    const slice = compact.slice(offset, offset + chunkSize);
    const { parsed, cost: callCost } = await callModel(
      context,
      `consolidate merge ${offset / chunkSize + 1}`,
      mergeSystemPrompt,
      { entities: slice },
    );
    cost += callCost;
    const data = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    for (const row of records(data.merges)) {
      const keepId = asString(row.keepEntityId);
      const mergeIds = strings(row.mergeEntityIds);
      const reason = asString(row.reason);
      if (keepId && mergeIds.length > 0 && applyMerge(ledger, keepId, mergeIds, reason)) {
        context.log(`merged ${mergeIds.join(", ")} into ${keepId}: ${reason}`);
      }
    }
    for (const row of records(data.corrections)) {
      const entity = findEntity(ledger, asString(row.entityId));
      if (!entity) continue;
      const type = nullableString(row.type) as EntityType | null;
      if (type && ["character", "location", "object", "group", "concept"].includes(type)) entity.type = type;
      const canonicalName = nullableString(row.canonicalName);
      if (canonicalName && canonicalName !== entity.canonicalName) {
        if (!entity.aliases.some((alias) => alias.name.toLowerCase() === entity.canonicalName.toLowerCase())) {
          entity.aliases.push({ name: entity.canonicalName, firstSeq: entity.firstSeq, paragraphIds: [] });
        }
        entity.aliases = entity.aliases.filter((alias) => alias.name.toLowerCase() !== canonicalName.toLowerCase());
        entity.canonicalName = canonicalName;
      }
      const parent = nullableString(row.parentLocationId);
      if (parent && parent !== entity.entityId && findEntity(ledger, parent)?.type === "location") {
        entity.parentLocationId = parent;
      }
    }
  }
  return cost;
}

function excerptsFor(entity: Entity, paragraphById: Map<string, Paragraph>): string[] {
  const mentions = entity.mentions;
  if (mentions.length === 0) return [];
  const picks = new Set<number>([0, mentions.length - 1]);
  for (let step = 1; step <= 3; step += 1) picks.add(Math.floor((mentions.length * step) / 4));
  return Array.from(picks)
    .sort((left, right) => left - right)
    .map((index) => mentions[index]!)
    .map((mention) => {
      const text = paragraphById.get(mention.paragraphId)?.text ?? "";
      return `[${mention.paragraphId}] ${text.length > 500 ? `${text.slice(0, 500)}…` : text}`;
    });
}

async function stepProfiles(context: ConsolidationContext): Promise<number> {
  const { ledger } = context;
  const paragraphById = new Map(context.paragraphs.map((paragraph) => [paragraph.id, paragraph]));
  const nameOf = (id: string) => findEntity(ledger, id)?.canonicalName ?? id;
  const pending = entitiesByMentions(ledger).filter((entity) => !entity.profile);
  const batchCount = Math.ceil(pending.length / profileBatchSize);
  let cost = 0;
  for (let offset = 0; offset < pending.length; offset += profileBatchSize) {
    const batch = pending.slice(offset, offset + profileBatchSize);
    const batchNumber = offset / profileBatchSize + 1;
    await context.onActivity({
      label: `Writing entity profiles: batch ${batchNumber} of ${batchCount}`,
      detail: `${batch.length} entities in this batch`,
      done: batchNumber - 1,
      total: batchCount,
      unit: "batches",
    });
    const payload = {
      entities: batch.map((entity) => ({
        entityId: entity.entityId,
        type: entity.type,
        canonicalName: entity.canonicalName,
        aliases: entity.aliases.map((alias) => alias.name),
        importance: entity.importance,
        mentionCount: entity.mentionCount,
        introducedAs: entity.description,
        facts: entity.facts.map(
          (fact) =>
            `${fact.key}: ${fact.value}${fact.certainty !== "stated" ? ` [${fact.certainty}${fact.claimedBy ? ` by ${nameOf(fact.claimedBy)}` : ""}]` : ""}`,
        ),
        states: entity.states.map((state) => `seq ${state.validFromSeq}: ${state.label}`),
        reveals: entity.reveals.map((reveal) => `seq ${reveal.seq}: ${reveal.what}`),
        relationships: entity.relationships.map(
          (relationship) => `${relationship.type} -> ${nameOf(relationship.toEntityId)}`,
        ),
        excerpts: excerptsFor(entity, paragraphById),
      })),
    };
    const { parsed, cost: callCost } = await callModel(
      context,
      `consolidate profiles ${offset / profileBatchSize + 1}`,
      profileSystemPrompt,
      payload,
    );
    cost += callCost;
    const data = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    for (const row of records(data.profiles)) {
      const entity = findEntity(ledger, asString(row.entityId));
      if (!entity) continue;
      entity.profile = {
        role: asString(row.role).trim(),
        description: asString(row.description).trim(),
        appearance: asString(row.appearance).trim(),
        arc: asString(row.arc).trim(),
      };
    }
    for (const entity of batch) {
      if (!entity.profile) {
        entity.profile = { role: "", description: entity.description, appearance: "unknown", arc: "" };
      }
    }
    await context.onStep("profiles:partial", cost);
    cost = 0;
  }
  return cost;
}

async function stepChapters(context: ConsolidationContext): Promise<number> {
  const { ledger } = context;
  let cost = 0;
  const done = new Set(ledger.chapterSummaries.map((summary) => summary.chapterId));
  const pending = context.chapters
    .filter((chapter) => !done.has(chapter.id))
    .map((chapter) => ({
      chapter,
      annotations: Object.values(ledger.annotations)
        .filter((annotation) => annotation.chapterId === chapter.id)
        .sort((left, right) => left.seq - right.seq),
    }))
    .filter(({ annotations }) => annotations.length > 0);
  for (let index = 0; index < pending.length; index += 1) {
    const { chapter, annotations } = pending[index]!;
    await context.onActivity({
      label: `Summarizing chapter ${index + 1} of ${pending.length}`,
      detail: chapter.title,
      done: index,
      total: pending.length,
      unit: "chapters",
    });
    const events = ledger.events.filter((event) => event.chapterId === chapter.id);
    const stride = Math.max(1, Math.ceil(annotations.length / 600));
    const { parsed, cost: callCost } = await callModel(
      context,
      `consolidate chapter ${chapter.id}`,
      chapterSystemPrompt,
      {
        chapter: { id: chapter.id, title: chapter.title, seqStart: chapter.seqStart, seqEnd: chapter.seqEnd },
        annotations: annotations
          .filter((_, index) => index % stride === 0)
          .map((annotation) => `[${annotation.paragraphId}] ${annotation.summary}`),
        events: events.map((event) => `[${event.eventId} seq ${event.seqStart}-${event.seqEnd}] ${event.summary}`),
      },
    );
    cost += callCost;
    const data = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    // Without a model summary the chapter is still described, by stitching the
    // first paragraph annotations together, so no chapter is left blank.
    const summary =
      asString(data.summary).trim() ||
      annotations
        .slice(0, 8)
        .map((annotation) => annotation.summary)
        .join(" ");
    ledger.chapterSummaries.push({
      chapterId: chapter.id,
      title: chapter.title,
      seqStart: chapter.seqStart,
      seqEnd: chapter.seqEnd,
      summary,
      entityIds: unique(
        annotations.flatMap((annotation) => [
          ...annotation.presentEntityIds,
          ...annotation.speakerEntityIds,
          ...annotation.mentionedEntityIds,
        ]),
      ),
      locationIds: unique(annotations.flatMap((annotation) => (annotation.locationId ? [annotation.locationId] : []))),
    });
    await context.onStep("chapters:partial", cost);
    cost = 0;
  }
  return cost;
}

function orderEventsBySeq(ledger: Ledger): void {
  ledger.events.sort(
    (left, right) =>
      left.seqStart - right.seqStart || left.seqEnd - right.seqEnd || left.eventId.localeCompare(right.eventId),
  );
  ledger.events.forEach((event, index) => {
    event.order = index + 1;
  });
}

async function stepChronology(context: ConsolidationContext): Promise<number> {
  const { ledger } = context;
  orderEventsBySeq(ledger);
  const fallback = () => {
    ledger.events.forEach((event) => {
      event.storyOrder = event.order;
      event.storyTime = event.order;
    });
  };
  if (ledger.events.length === 0) return 0;
  if (ledger.events.length > 600) {
    context.log(`chronology: ${ledger.events.length} events, using narration order without a model pass.`);
    fallback();
    return 0;
  }
  const { parsed, cost } = await callModel(context, "consolidate chronology", chronologySystemPrompt, {
    events: ledger.events.map((event) => ({
      eventId: event.eventId,
      seqStart: event.seqStart,
      chapterId: event.chapterId,
      storyTimeHint: event.storyTime,
      isFlashback: event.isFlashback,
      summary: event.summary,
    })),
  });
  const data = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const ranks = new Map<string, { storyOrder: number; isFlashback: boolean }>();
  for (const row of records(data.events)) {
    const eventId = asString(row.eventId);
    const storyOrder = asNumber(row.storyOrder);
    if (eventId && storyOrder > 0 && !ranks.has(eventId))
      ranks.set(eventId, { storyOrder, isFlashback: asBoolean(row.isFlashback) });
  }
  if (ranks.size < ledger.events.length * 0.8) {
    context.log(`chronology: model ranked ${ranks.size} of ${ledger.events.length} events; keeping narration order.`);
    fallback();
    return cost;
  }
  const ranked = [...ledger.events].sort((left, right) => {
    const l = ranks.get(left.eventId)?.storyOrder ?? left.order + 1_000_000;
    const r = ranks.get(right.eventId)?.storyOrder ?? right.order + 1_000_000;
    return l - r || left.order - right.order;
  });
  ranked.forEach((event, index) => {
    event.storyOrder = index + 1;
    event.storyTime = index + 1;
    event.isFlashback = ranks.get(event.eventId)?.isFlashback ?? event.isFlashback;
  });
  return cost;
}

async function stepWorld(context: ConsolidationContext): Promise<number> {
  const { ledger } = context;
  const principal = entitiesByMentions(ledger)
    .slice(0, 25)
    .map((entity) => `${entity.type} ${entity.canonicalName}: ${entity.profile?.role || entity.description}`);
  const { parsed, cost } = await callModel(context, "consolidate world", worldSystemPrompt, {
    synopsis: ledger.rollingSynopsis,
    chapterSummaries: ledger.chapterSummaries.map((chapter) => `${chapter.title}: ${chapter.summary}`),
    principalEntities: principal,
  });
  const data = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const world = {
    setting: asString(data.setting).trim(),
    era: asString(data.era).trim(),
    premise: asString(data.premise).trim(),
    narration: asString(data.narration).trim(),
    tone: asString(data.tone).trim(),
  };
  // An empty object means the call did not come back; leave world unset rather
  // than storing five blank fields the review screen would render as a heading.
  ledger.world = Object.values(world).some(Boolean) ? world : null;
  return cost;
}

/**
 * Whole-book pass over the ledger. Each step is idempotent and recorded in
 * `consolidationSteps`, so a resumed job skips what is already done.
 */
export async function runConsolidation(context: ConsolidationContext): Promise<void> {
  const { ledger, paragraphs } = context;
  const storyCount = paragraphs.filter((paragraph) => paragraph.isStory).length;
  const steps: { name: string; run: () => Promise<number> }[] = [
    {
      // Counting mentions before the merge review gives it the one signal that
      // reliably says which of two duplicate entries is the canonical one.
      name: "prescan",
      run: async () => {
        scanMentions(ledger, paragraphs);
        return 0;
      },
    },
    { name: "merge", run: () => stepMerge(context) },
    {
      name: "scan",
      run: async () => {
        scanMentions(ledger, paragraphs);
        assignImportance(ledger, storyCount);
        inheritLocations(ledger, paragraphs);
        enrichAnnotations(ledger);
        return 0;
      },
    },
    { name: "profiles", run: () => stepProfiles(context) },
    { name: "chapters", run: () => stepChapters(context) },
    { name: "chronology", run: () => stepChronology(context) },
    { name: "world", run: () => stepWorld(context) },
    {
      name: "scenes",
      run: async () => {
        ledger.sceneRanges = buildSceneRanges(ledger, paragraphs);
        ledger.coverage = computeCoverage(ledger, paragraphs);
        return 0;
      },
    },
  ];
  const labels: Record<string, string> = {
    prescan: "Scanning entity mentions",
    merge: "Merging duplicate entities",
    scan: "Enriching annotations",
    profiles: "Writing entity profiles",
    chapters: "Summarizing chapters",
    chronology: "Ordering story chronology",
    world: "Building world overview",
    scenes: "Building scene ranges",
  };
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!;
    if (ledger.consolidationSteps.includes(step.name)) continue;
    context.log(`consolidate: ${step.name}`);
    await context.onActivity({
      label: labels[step.name] ?? step.name,
      detail: `Consolidation step ${index + 1} of ${steps.length}`,
      done: index,
      total: steps.length,
      unit: "steps",
    });
    const cost = await step.run();
    ledger.consolidationSteps.push(step.name);
    await context.onStep(step.name, cost);
  }
}
