import type {
  AnnotationMode,
  Certainty,
  Delta,
  EntityType,
  Importance,
} from "./types.mts";

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function strings(value: unknown): string[] {
  return asArray(value).filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

export function records(value: unknown): Record<string, unknown>[] {
  return asArray(value).map(asRecord);
}

export function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function entityType(value: unknown): EntityType {
  return value === "location" ||
    value === "object" ||
    value === "group" ||
    value === "concept"
    ? value
    : "character";
}

export function importance(value: unknown): Importance {
  return value === "major" || value === "minor" ? value : "supporting";
}

export function certainty(value: unknown): Certainty {
  return value === "claimed" || value === "implied" ? value : "stated";
}

const annotationModes = new Set<AnnotationMode>([
  "narration",
  "dialogue",
  "description",
  "thought",
  "song",
  "letter",
  "list",
  "title",
  "mixed",
]);

export function annotationMode(value: unknown): AnnotationMode {
  return annotationModes.has(value as AnnotationMode)
    ? (value as AnnotationMode)
    : "narration";
}

export function safeId(value: unknown, fallbackPrefix: string): string {
  const normalized = asString(value)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return normalized || `${fallbackPrefix}_${crypto.randomUUID().slice(0, 12)}`;
}

export function stringRecord(value: unknown): Record<string, string> {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value.flatMap((item) => {
        const row = asRecord(item);
        return typeof row.key === "string" && typeof row.value === "string"
          ? [[row.key, row.value]]
          : [];
      }),
    );
  }
  return Object.fromEntries(
    Object.entries(asRecord(value)).flatMap(([key, entry]) =>
      typeof entry === "string" ? [[key, entry]] : [],
    ),
  );
}

function aliases(value: unknown) {
  return records(value)
    .map((entry) => ({
      name: asString(entry.name).trim(),
      firstSeq: asNumber(entry.firstSeq),
      paragraphIds: strings(entry.paragraphIds),
    }))
    .filter((alias) => alias.name);
}

export function normalizeDelta(value: unknown): Delta {
  const data = asRecord(value);
  return {
    entities: records(data.entities ?? data.newEntities).map((row) => ({
      entityId: safeId(row.entityId, "entity"),
      type: entityType(row.type),
      canonicalName: asString(row.canonicalName).trim(),
      aliases: aliases(row.aliases),
      importance: importance(row.importance),
      description: asString(row.description).trim(),
      parentLocationId: nullableString(row.parentLocationId),
      paragraphIds: strings(row.paragraphIds),
    })),
    facts: records(data.facts).map((row) => ({
      entityId: safeId(row.entityId, "entity"),
      key: asString(row.key).trim(),
      value: asString(row.value).trim(),
      quote: asString(row.quote),
      certainty: certainty(row.certainty),
      claimedBy: nullableString(row.claimedBy),
      paragraphIds: strings(row.paragraphIds),
    })),
    events: records(data.events).map((row) => ({
      eventId: safeId(row.eventId, "event"),
      summary: asString(row.summary).trim(),
      kind: asString(row.kind, "event").trim().toLowerCase() || "event",
      storyTimeHint: asNumber(row.storyTimeHint),
      isFlashback: asBoolean(row.isFlashback),
      participants: strings(row.participants),
      locationId: nullableString(row.locationId),
      objectIds: strings(row.objectIds),
      paragraphIds: strings(row.paragraphIds),
      evidenceQuotes: strings(row.evidenceQuotes),
    })),
    stateChanges: records(data.stateChanges).map((row) => ({
      entityId: safeId(row.entityId, "entity"),
      stateId: safeId(row.stateId, "state"),
      label: asString(row.label).trim(),
      validFromStoryTime: asNumber(row.validFromStoryTime),
      changes: stringRecord(row.changes),
      paragraphIds: strings(row.paragraphIds),
      evidenceQuotes: strings(row.evidenceQuotes),
    })),
    reveals: records(data.reveals).map((row) => ({
      entityId: safeId(row.entityId, "entity"),
      what: asString(row.what).trim(),
      paragraphIds: strings(row.paragraphIds),
      evidenceQuotes: strings(row.evidenceQuotes),
    })),
    relationshipChanges: records(data.relationshipChanges).map((row) => ({
      entityId: safeId(row.entityId, "entity"),
      toEntityId: safeId(row.toEntityId, "entity"),
      type: asString(row.type).trim().toLowerCase(),
      paragraphIds: strings(row.paragraphIds),
      evidenceQuotes: strings(row.evidenceQuotes),
    })),
    annotations: records(data.annotations).map((row) => ({
      paragraphId: asString(row.paragraphId).trim(),
      summary: asString(row.summary).trim(),
      mode: annotationMode(row.mode),
      presentEntityIds: strings(row.presentEntityIds),
      mentionedEntityIds: strings(row.mentionedEntityIds),
      speakerEntityIds: strings(row.speakerEntityIds),
      locationId: nullableString(row.locationId),
      timeMarker: nullableString(row.timeMarker),
      mood: asString(row.mood).trim(),
      visualCue: asString(row.visualCue).trim(),
      eventIds: strings(row.eventIds),
    })),
    aliasConflicts: records(data.aliasConflicts).map((row) => ({
      alias: asString(row.alias).trim(),
      entityIds: strings(row.entityIds),
      paragraphIds: strings(row.paragraphIds),
    })),
    updatedSynopsis: asString(data.updatedSynopsis).trim(),
  };
}
