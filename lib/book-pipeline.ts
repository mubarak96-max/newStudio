'use client';

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { ref, uploadBytesResumable } from 'firebase/storage';
import {
  COVERAGE_FAIL_RATIO,
  buildCanonicalParagraphs,
  buildChunks,
  canonicalTextOf,
  chunkDocId,
  chunkIdsForSeqRange,
  computeCoverage,
  type Coverage,
  type Paragraph,
} from './canonical';
import { db, ensureAnonymousAuth, storage } from './firebase';
import type { ExtractionResult } from './pdf-extract';

export type { Coverage, Paragraph, ParagraphKind } from './canonical';
export { buildCanonicalParagraphs } from './canonical';

export type CanonicalSource = {
  sourceId: string;
  canonicalPath: string;
  canonicalHash: string;
  /** SHA-256 of the concatenated paragraph text; the worker's integrity check. */
  textHash: string;
  paragraphCount: number;
  chunkCount: number;
  wordCount: number;
  pageCount: number;
  /** Null when rehydrated from the book document, which does not store it. */
  coverage: Coverage | null;
};

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/** Extraction annotates paragraphs, repair retries the ones it missed, consolidation runs on the ledger. */
export type JobPhase = 'extract' | 'repair' | 'consolidate' | 'done';

export type PipelineJob = {
  jobId: string;
  type: string;
  stage: string;
  status: JobStatus;
  phase: JobPhase;
  coverage: ModelCoverage | null;
  progress: { done: number; total: number };
  checkpoint: { storagePath: string; windowIndex: number } | null;
  attempts: number;
  error?: string;
  warning?: string;
  costUsd: number;
  workerVersion?: string;
  model?: string;
};

export type EntityType = 'character' | 'location' | 'object' | 'group' | 'concept';

export type BookModelEntity = {
  entityId: string;
  type: EntityType;
  canonicalName: string;
  aliases: { name: string; firstSeq: number; paragraphIds: string[] }[];
  importance: 'major' | 'supporting' | 'minor';
  firstSeq: number;
  lastSeq: number;
  description: string;
  parentLocationId: string | null;
  facts: {
    key: string;
    value: string;
    quote: string;
    certainty: 'stated' | 'claimed' | 'implied';
    claimedBy: string | null;
    firstSeq: number;
    verified: boolean;
    paragraphIds: string[];
  }[];
  fills: { key: string; value: string; reason: string }[];
  states: {
    stateId: string;
    label: string;
    validFromStoryTime: number;
    validToStoryTime: number | null;
    validFromSeq: number;
    changes: Record<string, string>;
    verified: boolean;
    paragraphIds: string[];
  }[];
  reveals: { what: string; seq: number; verified: boolean; paragraphIds: string[] }[];
  relationships: {
    toEntityId: string;
    type: string;
    validFromSeq: number;
    validToSeq: number | null;
    verified: boolean;
    paragraphIds: string[];
  }[];
  /** A sample when `mentionsTruncated` is true; `mentionCount` is always the real total. */
  mentions: { paragraphId: string; seq: number; source: 'model' | 'scan' }[];
  mentionsTruncated?: boolean;
  mentionCount: number;
  profile: { role: string; description: string; appearance: string; arc: string } | null;
  visual: {
    spec: string;
    referenceSheet: { approved: boolean };
    stateVariants: Record<string, { approved: boolean }>;
    preRevealSpec?: string;
  };
  status: 'draft' | 'reviewed' | 'locked';
};

export type BookModelEvent = {
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

/** One per story paragraph: the per-paragraph layer the 2.5D planner reads. */
export type ParagraphAnnotation = {
  paragraphId: string;
  seq: number;
  chapterId: string;
  summary: string;
  mode:
    | 'narration'
    | 'dialogue'
    | 'description'
    | 'thought'
    | 'song'
    | 'letter'
    | 'list'
    | 'title'
    | 'mixed';
  presentEntityIds: string[];
  mentionedEntityIds: string[];
  speakerEntityIds: string[];
  locationId: string | null;
  timeMarker: string | null;
  mood: string;
  visualCue: string;
  eventIds: string[];
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

export type BookWorld = {
  setting: string;
  era: string;
  premise: string;
  narration: string;
  tone: string;
};

export type ModelCoverage = {
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

export type ModelDiagnostics = {
  droppedItems: number;
  unverifiedItems: number;
  remappedEntityIds: number;
  merges: { keepEntityId: string; mergedEntityIds: string[]; reason: string }[];
  repairRoundsRun: number;
  modelCalls: number;
};

export type BookModel = {
  entities: BookModelEntity[];
  events: BookModelEvent[];
  rollingSynopsis: string;
  aliasConflicts: { alias: string; entityIds: string[]; paragraphIds: string[] }[];
  world: BookWorld | null;
  chapterSummaries: ChapterSummary[];
  sceneRanges: SceneRange[];
  coverage: ModelCoverage | null;
  diagnostics: ModelDiagnostics | null;
};

async function sha256Hex(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}


function uploadJson(path: string, value: unknown): Promise<void> {
  const target = storage;
  if (!target) throw new Error('Firebase Storage is not configured.');
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(ref(target, path), bytes, {
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'private, max-age=31536000, immutable',
    });
    task.on('state_changed', undefined, reject, () => resolve());
  });
}

export async function persistCanonicalSource(
  bookId: string,
  result: ExtractionResult,
  sourceIdHint?: string
): Promise<CanonicalSource> {
  const database = db;
  if (!database || !storage) throw new Error('Firebase is not configured.');
  await ensureAnonymousAuth();

  const paragraphs = buildCanonicalParagraphs(result);
  if (paragraphs.length === 0) throw new Error('No paragraphs were extracted.');

  const coverage = computeCoverage(result, paragraphs);
  if (Math.abs(coverage.missingChars) > coverage.sourceChars * COVERAGE_FAIL_RATIO) {
    throw new Error(
      `Extraction lost text: ${coverage.canonicalChars} of ${coverage.sourceChars} characters ` +
        `reached canonical paragraphs (${coverage.missingChars} missing). Source not saved.`
    );
  }

  const textHash = await sha256Hex(canonicalTextOf(paragraphs));
  const canonicalPayload = {
    schemaVersion: 2,
    bookId,
    pages: result.pages,
    paragraphs,
  };
  const canonicalHash = await sha256Hex(JSON.stringify(canonicalPayload));
  const sourceId = sourceIdHint || `src_${canonicalHash.slice(0, 16)}`;
  const basePath = `books/${bookId}/sources/${sourceId}`;
  const rawPath = `${basePath}/extraction/${canonicalHash}/pages.json`;
  const canonicalPath = `${basePath}/text/${canonicalHash}/canonical.json`;
  const chunks = buildChunks(paragraphs);

  await Promise.all([
    uploadJson(rawPath, {
      schemaVersion: 1,
      bookId,
      sourceId,
      pages: result.pages,
      totals: {
        pages: result.totalPages,
        characters: result.totalChars,
        words: result.totalWords,
        ocrPages: result.ocrPages,
        emptyPages: result.emptyPages,
      },
    }),
    uploadJson(canonicalPath, { ...canonicalPayload, sourceId, canonicalHash, textHash, coverage }),
  ]);

  for (let offset = 0; offset < chunks.length; offset += 200) {
    const batch = writeBatch(database);
    chunks.slice(offset, offset + 200).forEach((paragraphChunk, localIndex) => {
      const index = offset + localIndex;
      batch.set(
        doc(database, 'books', bookId, 'textChunks', chunkDocId(sourceId, canonicalHash, index)),
        {
          sourceId,
          canonicalHash,
          info: {
            index,
            startPage: paragraphChunk[0]!.page,
            endPage: paragraphChunk.at(-1)!.page,
            seqStart: paragraphChunk[0]!.seq,
            seqEnd: paragraphChunk.at(-1)!.seq,
          },
          paragraphs: paragraphChunk,
        }
      );
    });
    await batch.commit();
  }

  const structure = Array.from(new Set(paragraphs.map((paragraph) => paragraph.chapterId))).map(
    (id) => {
      const chapterParagraphs = paragraphs.filter((paragraph) => paragraph.chapterId === id);
      const heading = chapterParagraphs.find((paragraph) => paragraph.kind === 'heading');
      return {
        id,
        title: heading?.text ?? `Chapter ${Number(id.slice(-4))}`,
        seqStart: chapterParagraphs[0]!.seq,
        seqEnd: chapterParagraphs.at(-1)!.seq,
      };
    }
  );

  await setDoc(doc(database, 'books', bookId, 'sources', sourceId), {
    sourceId,
    status: 'ready',
    rawPath,
    canonicalPath,
    canonicalHash,
    textHash,
    coverage,
    pageCount: result.totalPages,
    paragraphCount: paragraphs.length,
    chunkCount: chunks.length,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(database, 'books', bookId), {
    activeSourceId: sourceId,
    canonical: { storagePath: canonicalPath, hash: canonicalHash, textHash },
    'sourceFile.pageCount': result.totalPages,
    structure: { chapters: structure },
    stats: {
      paragraphCount: paragraphs.length,
      storyParagraphCount: paragraphs.filter((paragraph) => paragraph.isStory).length,
      wordCount: result.totalWords,
      tokenEstimate: Math.ceil(result.totalChars / 4),
    },
    pipeline: {
      stage: 'extraction',
      stageStatus: 'approved',
      updatedAt: new Date().toISOString(),
    },
    updatedAt: serverTimestamp(),
  });

  return {
    sourceId,
    canonicalPath,
    canonicalHash,
    textHash,
    paragraphCount: paragraphs.length,
    chunkCount: chunks.length,
    wordCount: result.totalWords,
    pageCount: result.totalPages,
    coverage,
  };
}

/**
 * The single retrieval contract every downstream stage uses in Studio.
 *
 * Chunk IDs are computed from the seq range, so this is a handful of direct
 * document reads — no query, no composite index, no ordering to reconstruct.
 * The worker gets the identical array by slicing `canonical.json`.
 */
export async function getParagraphs(
  bookId: string,
  sourceId: string,
  canonicalHash: string,
  seqStart: number,
  seqEnd: number
): Promise<Paragraph[]> {
  if (!db) throw new Error('Firebase is not configured.');
  await ensureAnonymousAuth();
  const ids = chunkIdsForSeqRange(sourceId, canonicalHash, seqStart, seqEnd);
  const snapshots = await Promise.all(
    ids.map((id) => getDoc(doc(db!, 'books', bookId, 'textChunks', id)))
  );
  const low = Math.min(seqStart, seqEnd);
  const high = Math.max(seqStart, seqEnd);
  return snapshots
    .flatMap((snapshot) => (snapshot.data()?.paragraphs ?? []) as Paragraph[])
    .filter((paragraph) => paragraph.seq >= low && paragraph.seq <= high)
    .sort((left, right) => left.seq - right.seq);
}

export async function enqueueUnderstandingJob(
  bookId: string,
  source: CanonicalSource
): Promise<string> {
  if (!db) throw new Error('Firebase is not configured.');
  await ensureAnonymousAuth();
  const jobRef = await addDoc(collection(db, 'books', bookId, 'jobs'), {
    type: 'understand',
    stage: 'book_model',
    status: 'queued_v3',
    sourceId: source.sourceId,
    canonicalHash: source.canonicalHash,
    progress: { done: 0, total: source.paragraphCount },
    checkpoint: null,
    attempts: 0,
    error: null,
    costUsd: 0,
    startedAt: null,
    finishedAt: null,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'books', bookId), {
    pipeline: {
      stage: 'book_model',
      stageStatus: 'pending',
      lastJobId: jobRef.id,
      updatedAt: new Date().toISOString(),
    },
    updatedAt: serverTimestamp(),
  });
  return jobRef.id;
}

export function subscribePipelineJob(
  bookId: string,
  jobId: string,
  onJob: (job: PipelineJob) => void,
  onError: (error: unknown) => void
): () => void {
  if (!db) {
    onError(new Error('Firebase is not configured.'));
    return () => undefined;
  }
  return onSnapshot(
    doc(db, 'books', bookId, 'jobs', jobId),
    (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      const rawStatus = data.status;
      const status =
        rawStatus === 'queued_v3'
          ? 'queued'
          : rawStatus === 'running_v3'
            ? 'running'
            : rawStatus;
      onJob({
        jobId: snapshot.id,
        type: data.type ?? 'understand',
        stage: data.stage ?? 'book_model',
        status: status ?? 'queued',
        phase: (data.phase as JobPhase | undefined) ?? 'extract',
        coverage: (data.coverage as ModelCoverage | undefined) ?? null,
        progress: data.progress ?? { done: 0, total: 0 },
        checkpoint: data.checkpoint ?? null,
        attempts: data.attempts ?? 0,
        error: data.error ?? undefined,
        warning: data.warning ?? undefined,
        costUsd: data.costUsd ?? 0,
        workerVersion: data.workerVersion ?? undefined,
        model: data.model ?? undefined,
      });
    },
    onError
  );
}

export async function retryPipelineJob(bookId: string, jobId: string): Promise<void> {
  if (!db) throw new Error('Firebase is not configured.');
  await ensureAnonymousAuth();
  await updateDoc(doc(db, 'books', bookId, 'jobs', jobId), {
    status: 'queued_v3',
    error: null,
    finishedAt: null,
    updatedAt: serverTimestamp(),
  });
}

export async function cancelPipelineJob(bookId: string, jobId: string): Promise<void> {
  if (!db) throw new Error('Firebase is not configured.');
  await ensureAnonymousAuth();
  await updateDoc(doc(db, 'books', bookId, 'jobs', jobId), {
    status: 'cancelled',
    finishedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

function documentData<T>(data: DocumentData): T {
  return data as T;
}

export async function loadBookModel(bookId: string): Promise<BookModel> {
  const database = db;
  if (!database) throw new Error('Firebase is not configured.');
  await ensureAnonymousAuth();
  const [bookSnapshot, entitySnapshot, eventSnapshot, ledgerSnapshot] = await Promise.all([
    getDoc(doc(database, 'books', bookId)),
    getDocs(collection(database, 'books', bookId, 'entities')),
    getDocs(query(collection(database, 'books', bookId, 'events'), orderBy('order'))),
    getDoc(doc(database, 'books', bookId, 'derived', 'ledger')),
  ]);
  const sourceId = bookSnapshot.data()?.activeSourceId;
  const canonicalHash = bookSnapshot.data()?.canonical?.hash;
  const matchesActiveSource = (data: DocumentData) =>
    (!sourceId || data.sourceId === sourceId) &&
    (!canonicalHash || data.canonicalHash === canonicalHash);
  const ledger = ledgerSnapshot.data();
  const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
  return {
    entities: entitySnapshot.docs
      .filter((item) => matchesActiveSource(item.data()))
      .map((item) => documentData<BookModelEntity>(item.data())),
    events: eventSnapshot.docs
      .filter((item) => matchesActiveSource(item.data()))
      .map((item) => documentData<BookModelEvent>(item.data())),
    rollingSynopsis: ledger?.rollingSynopsis ?? '',
    aliasConflicts: list(ledger?.aliasConflicts),
    world: (ledger?.world as BookWorld | undefined) ?? null,
    chapterSummaries: list<ChapterSummary>(ledger?.chapterSummaries),
    sceneRanges: list<SceneRange>(ledger?.sceneRanges),
    coverage: (ledger?.coverage as ModelCoverage | undefined) ?? null,
    diagnostics: (ledger?.diagnostics as ModelDiagnostics | undefined) ?? null,
  };
}

/**
 * Annotations are chunked on the same seq boundaries as `textChunks`, so a
 * paragraph range resolves to document IDs without a query — the same contract
 * `getParagraphs` uses, which lets a caller fetch text and annotations together.
 */
export async function getAnnotations(
  bookId: string,
  sourceId: string,
  canonicalHash: string,
  seqStart: number,
  seqEnd: number
): Promise<ParagraphAnnotation[]> {
  const database = db;
  if (!database) throw new Error('Firebase is not configured.');
  await ensureAnonymousAuth();
  const ids = chunkIdsForSeqRange(sourceId, canonicalHash, seqStart, seqEnd);
  const snapshots = await Promise.all(
    ids.map((id) => getDoc(doc(database, 'books', bookId, 'annotationChunks', id)))
  );
  const low = Math.min(seqStart, seqEnd);
  const high = Math.max(seqStart, seqEnd);
  return snapshots
    .flatMap((snapshot) => (snapshot.data()?.annotations ?? []) as ParagraphAnnotation[])
    .filter((annotation) => annotation.seq >= low && annotation.seq <= high)
    .sort((left, right) => left.seq - right.seq);
}
