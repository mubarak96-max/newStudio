import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { chunkDocId, chunkIndexForSeq } from "../lib/canonical.ts";
import { bucket, db, workerVersion } from "./config.mts";
import { saveJsonCheckpoint } from "./checkpoint-store.mts";
import type { Annotation, Ledger, Paragraph } from "./types.mts";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Canonical text is read from Storage, never from `textChunks`.
 *
 * `canonical.json` is one immutable, hash-verifiable object: a single GET, no
 * Firestore read units, and the paragraph order is the file's order rather than
 * something reassembled from hundreds of documents. The `textChunks` mirror
 * exists for Studio's paginated UI reads.
 */
export async function loadParagraphs(
  bookId: string,
  sourceId: string,
  canonicalHash: string,
  canonicalPath: string,
  expectedTextHash: string,
): Promise<Paragraph[]> {
  const storagePath =
    canonicalPath ||
    `books/${bookId}/sources/${sourceId}/text/${canonicalHash}/canonical.json`;
  const [buffer] = await bucket.file(storagePath).download();
  const payload = JSON.parse(buffer.toString("utf8")) as {
    canonicalHash?: string;
    textHash?: string;
    paragraphs?: Paragraph[];
  };
  if (payload.canonicalHash && payload.canonicalHash !== canonicalHash) {
    throw new Error(
      `Canonical file at ${storagePath} is hash ${payload.canonicalHash}, expected ${canonicalHash}.`,
    );
  }
  const paragraphs = Array.isArray(payload.paragraphs) ? payload.paragraphs : [];
  if (paragraphs.length === 0) throw new Error(`No canonical paragraphs in ${storagePath}.`);
  paragraphs.forEach((paragraph, index) => {
    if (paragraph.seq !== index || paragraph.id !== `p${String(index).padStart(6, "0")}`) {
      throw new Error(`Canonical paragraph sequence breaks at index ${index}.`);
    }
  });
  const textHash = payload.textHash ?? expectedTextHash;
  if (textHash) {
    const actual = sha256Hex(paragraphs.map((paragraph) => paragraph.text).join("\n"));
    if (actual !== textHash) {
      throw new Error(
        `Canonical text hash mismatch at ${storagePath}: got ${actual}, expected ${textHash}.`,
      );
    }
  } else {
    console.warn(
      `[${workerVersion}] ${storagePath} predates textHash; integrity unverified. Re-extract to restore the check.`,
    );
  }
  return paragraphs;
}

/**
 * Checkpoint names carry a running counter so the newest one sorts last
 * whatever phase wrote it; `loadLatestValidCheckpoint` picks by name.
 */
export async function saveCheckpoint(
  bookId: string,
  jobId: string,
  ledger: Ledger,
  label: string,
  counter: number,
): Promise<string> {
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]+/g, "_");
  const storagePath = `books/${bookId}/sources/${ledger.sourceId}/ledger/${jobId}/${String(counter).padStart(6, "0")}-${safeLabel}.json`;
  await saveJsonCheckpoint(bucket, storagePath, ledger);
  return storagePath;
}

/**
 * Documents from an earlier run of the same source are not overwritten by this
 * run's `set` calls: every run coins its own IDs, so Studio would read several
 * runs merged together. Anything the promoted ledger no longer contains is removed.
 */
async function pruneRunLeftovers(
  bookId: string,
  collectionName: "entities" | "events" | "annotationChunks",
  keepIds: Set<string>,
  ledger: Ledger,
): Promise<number> {
  const snapshot = await db.collection(`books/${bookId}/${collectionName}`).get();
  const stale = snapshot.docs.filter(
    (doc) =>
      !keepIds.has(doc.id) &&
      doc.data().sourceId === ledger.sourceId &&
      doc.data().canonicalHash === ledger.canonicalHash,
  );
  for (let offset = 0; offset < stale.length; offset += 300) {
    const batch = db.batch();
    for (const doc of stale.slice(offset, offset + 300)) batch.delete(doc.ref);
    await batch.commit();
  }
  return stale.length;
}

async function writeRecords(records: { path: string; value: unknown }[]): Promise<void> {
  for (let offset = 0; offset < records.length; offset += 300) {
    const batch = db.batch();
    for (const record of records.slice(offset, offset + 300)) {
      batch.set(db.doc(record.path), record.value as Record<string, unknown>);
    }
    await batch.commit();
  }
}

/**
 * The summary document is a dashboard, not a store: the complete ledger lives
 * in the Storage checkpoint. Long lists are capped so a long book cannot push
 * this document towards Firestore's 1MB ceiling; every count stays exact.
 */
const summaryListCap = 500;

function capped<T>(values: T[]): T[] {
  return values.length > summaryListCap ? values.slice(0, summaryListCap) : values;
}

export function ledgerSummary(ledger: Ledger, extra: Record<string, unknown> = {}) {
  return {
    sourceId: ledger.sourceId,
    canonicalHash: ledger.canonicalHash,
    workerVersion,
    phase: ledger.phase,
    processedThroughSeq: ledger.processedThroughSeq,
    paragraphCount: ledger.coveredParagraphIds.length,
    entityCount: ledger.entities.length,
    eventCount: ledger.events.length,
    annotationCount: Object.keys(ledger.annotations).length,
    sceneCount: ledger.sceneRanges.length,
    aliasConflicts: capped(ledger.aliasConflicts),
    filteredParagraphCount: ledger.filteredParagraphIds.length,
    filteredParagraphIds: capped(ledger.filteredParagraphIds),
    rollingSynopsis: ledger.rollingSynopsis,
    coverage: ledger.coverage
      ? { ...ledger.coverage, missingAnnotationIds: capped(ledger.coverage.missingAnnotationIds) }
      : null,
    diagnostics: { ...ledger.diagnostics, merges: capped(ledger.diagnostics.merges) },
    world: ledger.world,
    chapterSummaries: ledger.chapterSummaries,
    sceneRanges: capped(ledger.sceneRanges),
    sceneRangesTruncated: ledger.sceneRanges.length > summaryListCap,
    updatedAt: FieldValue.serverTimestamp(),
    ...extra,
  };
}

/** Annotations are chunked exactly like textChunks so one seq range resolves to the same document IDs. */
function annotationChunks(ledger: Ledger, paragraphs: Paragraph[]): Map<number, Annotation[]> {
  const chunks = new Map<number, Annotation[]>();
  for (const paragraph of paragraphs) {
    const annotation = ledger.annotations[paragraph.id];
    if (!annotation) continue;
    const index = chunkIndexForSeq(paragraph.seq);
    const chunk = chunks.get(index) ?? [];
    chunk.push(annotation);
    chunks.set(index, chunk);
  }
  return chunks;
}

export async function persistBookModel(
  bookId: string,
  ledger: Ledger,
  paragraphs: Paragraph[],
): Promise<void> {
  const lineage = { sourceId: ledger.sourceId, canonicalHash: ledger.canonicalHash };
  /**
   * A protagonist in a long novel is mentioned thousands of times, which would
   * push one entity document towards Firestore's 1MB ceiling. The full list
   * stays in the ledger checkpoint, and the same information is recoverable
   * from `annotationChunks`, so the document keeps a sample plus the count.
   */
  const mentionSampleSize = 400;
  const entityRecords = ledger.entities.map((entity) => ({
    path: `books/${bookId}/entities/${entity.entityId}`,
    value: {
      ...entity,
      ...lineage,
      mentions: entity.mentions.slice(0, mentionSampleSize),
      mentionsTruncated: entity.mentions.length > mentionSampleSize,
      visual: { spec: "", referenceSheet: { approved: false }, stateVariants: {} },
      status: "draft",
    },
  }));
  const eventRecords = ledger.events.map((event) => ({
    path: `books/${bookId}/events/${event.eventId}`,
    value: { ...event, ...lineage },
  }));
  const chunkIds = new Set<string>();
  const chunkRecords = Array.from(annotationChunks(ledger, paragraphs)).map(([index, annotations]) => {
    const id = chunkDocId(ledger.sourceId, ledger.canonicalHash, index);
    chunkIds.add(id);
    return {
      path: `books/${bookId}/annotationChunks/${id}`,
      value: {
        ...lineage,
        info: {
          index,
          seqStart: annotations[0]!.seq,
          seqEnd: annotations.at(-1)!.seq,
          count: annotations.length,
        },
        annotations,
      },
    };
  });
  await writeRecords([...entityRecords, ...eventRecords, ...chunkRecords]);

  const [staleEntities, staleEvents, staleChunks] = await Promise.all([
    pruneRunLeftovers(bookId, "entities", new Set(ledger.entities.map((entity) => entity.entityId)), ledger),
    pruneRunLeftovers(bookId, "events", new Set(ledger.events.map((event) => event.eventId)), ledger),
    pruneRunLeftovers(bookId, "annotationChunks", chunkIds, ledger),
  ]);
  if (staleEntities || staleEvents || staleChunks) {
    console.log(
      `[${workerVersion}] pruned ${staleEntities} entity, ${staleEvents} event and ${staleChunks} annotation documents left by earlier runs.`,
    );
  }
  await db.doc(`books/${bookId}/derived/ledger`).set(ledgerSummary(ledger));
}
