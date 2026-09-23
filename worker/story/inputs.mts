import { db } from "../config.mts";
import { loadParagraphs } from "../persist.mts";
import type {
  Annotation,
  Chapter,
  ChapterSummary,
  Entity,
  Event,
  Paragraph,
  World,
} from "../types.mts";
import { chaptersOf } from "../understand-job.mts";

export type StoryInputs = {
  sourceId: string;
  canonicalHash: string;
  paragraphs: Paragraph[];
  paragraphById: Map<string, Paragraph>;
  chapters: Chapter[];
  entities: Entity[];
  entityById: Map<string, Entity>;
  /** Source order. */
  events: Event[];
  annotations: Map<string, Annotation>;
  chapterSummaries: ChapterSummary[];
  world: World | null;
  synopsis: string;
  /** The narrator of a first-person book, as the integrity gate identified them. */
  narratorEntityId: string | null;
};

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Reads the promoted Book Model rather than the understanding checkpoint: it
 * is what Studio shows, and it only exists once understanding finished.
 */
export async function loadStoryInputs(
  bookId: string,
  sourceId: string,
  canonicalHash: string,
): Promise<StoryInputs> {
  const bookData = (await db.doc(`books/${bookId}`).get()).data();
  if (bookData?.activeSourceId !== sourceId || bookData?.canonical?.hash !== canonicalHash) {
    throw new Error("Story job source is no longer the active canonical source.");
  }
  const sameSource = (data: Record<string, unknown>) =>
    data.sourceId === sourceId && data.canonicalHash === canonicalHash;
  const [paragraphs, ledgerSnapshot, entitySnapshot, eventSnapshot, chunkSnapshot] = await Promise.all([
    loadParagraphs(
      bookId,
      sourceId,
      canonicalHash,
      String(bookData?.canonical?.storagePath ?? ""),
      String(bookData?.canonical?.textHash ?? ""),
    ),
    db.doc(`books/${bookId}/derived/ledger`).get(),
    db.collection(`books/${bookId}/entities`).get(),
    db.collection(`books/${bookId}/events`).get(),
    db.collection(`books/${bookId}/annotationChunks`).get(),
  ]);
  const ledger = ledgerSnapshot.data();
  if (!ledger || !sameSource(ledger) || ledger.phase !== "done") {
    throw new Error("No finished Book Model exists for the active source. Run whole-book processing first.");
  }
  const entities = entitySnapshot.docs.map((doc) => doc.data()).filter(sameSource) as Entity[];
  const events = (eventSnapshot.docs.map((doc) => doc.data()).filter(sameSource) as Event[]).sort(
    (left, right) => left.seqStart - right.seqStart || left.order - right.order,
  );
  const annotations = new Map<string, Annotation>();
  for (const chunk of chunkSnapshot.docs.map((doc) => doc.data()).filter(sameSource)) {
    for (const annotation of (chunk.annotations ?? []) as Annotation[]) {
      annotations.set(annotation.paragraphId, annotation);
    }
  }
  if (annotations.size === 0) throw new Error("The Book Model has no paragraph annotations.");
  return {
    sourceId,
    canonicalHash,
    paragraphs,
    paragraphById: new Map(paragraphs.map((paragraph) => [paragraph.id, paragraph])),
    chapters: chaptersOf(paragraphs, bookData?.structure?.chapters),
    entities,
    entityById: new Map(entities.map((entity) => [entity.entityId, entity])),
    events,
    annotations,
    chapterSummaries: (ledger.chapterSummaries ?? []) as ChapterSummary[],
    world: (ledger.world ?? null) as World | null,
    synopsis: String(ledger.rollingSynopsis ?? ""),
    narratorEntityId: (bookData?.model?.narratorEntityId as string | undefined) ?? null,
  };
}
