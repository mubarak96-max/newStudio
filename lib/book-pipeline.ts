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
import { db, ensureAnonymousAuth, storage } from './firebase';
import type { ExtractionResult } from './pdf-extract';

export type ParagraphKind =
  | 'body'
  | 'heading'
  | 'frontmatter'
  | 'backmatter'
  | 'note'
  | 'caption';

export type Paragraph = {
  id: string;
  seq: number;
  page: number;
  chapterId: string;
  text: string;
  hash: string;
  kind: ParagraphKind;
  isStory: boolean;
};

export type CanonicalSource = {
  sourceId: string;
  canonicalPath: string;
  canonicalHash: string;
  paragraphCount: number;
  chunkCount: number;
  wordCount: number;
  pageCount: number;
};

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type PipelineJob = {
  jobId: string;
  type: string;
  stage: string;
  status: JobStatus;
  progress: { done: number; total: number };
  checkpoint: { storagePath: string; windowIndex: number } | null;
  attempts: number;
  error?: string;
  costUsd: number;
  workerVersion?: string;
  model?: string;
};

export type BookModelEntity = {
  entityId: string;
  type: 'character' | 'location' | 'object' | 'group';
  canonicalName: string;
  aliases: { name: string; firstSeq: number; paragraphIds: string[] }[];
  importance: 'major' | 'supporting' | 'minor';
  firstSeq: number;
  lastSeq: number;
  facts: { key: string; value: string; quote: string; paragraphIds: string[] }[];
  fills: { key: string; value: string; reason: string }[];
  states: {
    stateId: string;
    label: string;
    validFromStoryTime: number;
    validToStoryTime: number | null;
    validFromSeq: number;
    changes: Record<string, string>;
    paragraphIds: string[];
  }[];
  reveals: { what: string; seq: number; paragraphIds: string[] }[];
  relationships: {
    toEntityId: string;
    type: string;
    validFromSeq: number;
    validToSeq: number | null;
    paragraphIds: string[];
  }[];
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
  storyTime: number;
  participants: string[];
  locationId: string | null;
  objectIds: string[];
  kind: string;
  paragraphIds: string[];
};

const PARAGRAPHS_PER_CHUNK = 20;
const MAX_CHUNK_BYTES = 650_000;
const MAX_PARAGRAPH_CHARS = 40_000;

function stableTextHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

async function sha256Hex(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function splitLongBlock(text: string): string[] {
  if (text.length <= MAX_PARAGRAPH_CHARS) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > MAX_PARAGRAPH_CHARS) {
    const candidate = rest.slice(0, MAX_PARAGRAPH_CHARS);
    const splitAt = Math.max(candidate.lastIndexOf('\n'), candidate.lastIndexOf(' '));
    const end = splitAt > MAX_PARAGRAPH_CHARS * 0.6 ? splitAt : MAX_PARAGRAPH_CHARS;
    parts.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  if (rest) parts.push(rest);
  return parts;
}

function looksLikeHeading(text: string): boolean {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact || compact.length > 120) return false;
  if (/^(chapter|part|book)\s+([\divxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(compact)) {
    return true;
  }
  const letters = compact.replace(/[^a-z]/gi, '');
  return letters.length >= 3 && compact === compact.toUpperCase() && !/[.!?]$/.test(compact);
}

export function buildCanonicalParagraphs(result: ExtractionResult): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let chapterNumber = 1;
  let chapterId = `chapter_${String(chapterNumber).padStart(4, '0')}`;

  for (const page of result.pages) {
    if (!page.text.trim()) continue;
    const pageBlocks = page.text.split(/\n\s*\n+/).flatMap((block) => splitLongBlock(block));
    for (const rawBlock of pageBlocks) {
      const text = rawBlock.trim();
      if (!text) continue;
      const heading = looksLikeHeading(text);
      if (heading && paragraphs.length > 0) {
        chapterNumber += 1;
        chapterId = `chapter_${String(chapterNumber).padStart(4, '0')}`;
      }
      const seq = paragraphs.length;
      paragraphs.push({
        id: `p${String(seq).padStart(6, '0')}`,
        seq,
        page: page.pageNumber,
        chapterId,
        text,
        hash: stableTextHash(text),
        kind: heading ? 'heading' : 'body',
        isStory: !heading,
      });
    }
  }
  return paragraphs;
}

function makeChunks(paragraphs: Paragraph[]): Paragraph[][] {
  const chunks: Paragraph[][] = [];
  let current: Paragraph[] = [];
  let currentBytes = 0;

  for (const paragraph of paragraphs) {
    const paragraphBytes = new TextEncoder().encode(JSON.stringify(paragraph)).byteLength;
    if (
      current.length > 0 &&
      (current.length >= PARAGRAPHS_PER_CHUNK || currentBytes + paragraphBytes > MAX_CHUNK_BYTES)
    ) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(paragraph);
    currentBytes += paragraphBytes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function uploadJson(path: string, value: unknown): Promise<void> {
  if (!storage) throw new Error('Firebase Storage is not configured.');
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, path), bytes, {
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
  if (!db || !storage) throw new Error('Firebase is not configured.');
  await ensureAnonymousAuth();

  const paragraphs = buildCanonicalParagraphs(result);
  if (paragraphs.length === 0) throw new Error('No paragraphs were extracted.');

  const canonicalPayload = {
    schemaVersion: 1,
    bookId,
    pages: result.pages,
    paragraphs,
  };
  const canonicalJson = JSON.stringify(canonicalPayload);
  const canonicalHash = await sha256Hex(canonicalJson);
  const sourceId = sourceIdHint || `src_${canonicalHash.slice(0, 16)}`;
  const basePath = `books/${bookId}/sources/${sourceId}`;
  const rawPath = `${basePath}/extraction/${canonicalHash}/pages.json`;
  const canonicalPath = `${basePath}/text/${canonicalHash}/canonical.json`;
  const chunks = makeChunks(paragraphs);

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
    uploadJson(canonicalPath, { ...canonicalPayload, sourceId, canonicalHash }),
  ]);

  for (let offset = 0; offset < chunks.length; offset += 200) {
    const batch = writeBatch(db);
    chunks.slice(offset, offset + 200).forEach((paragraphChunk, localIndex) => {
      const index = offset + localIndex;
      const chunkId = `c${String(index + 1).padStart(4, '0')}`;
      batch.set(
        doc(db, 'books', bookId, 'textChunks', `${sourceId}__${canonicalHash.slice(0, 12)}__${chunkId}`),
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

  await setDoc(doc(db, 'books', bookId, 'sources', sourceId), {
    sourceId,
    status: 'ready',
    rawPath,
    canonicalPath,
    canonicalHash,
    pageCount: result.totalPages,
    paragraphCount: paragraphs.length,
    chunkCount: chunks.length,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'books', bookId), {
    activeSourceId: sourceId,
    canonical: { storagePath: canonicalPath, hash: canonicalHash },
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
    paragraphCount: paragraphs.length,
    chunkCount: chunks.length,
    wordCount: result.totalWords,
    pageCount: result.totalPages,
  };
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
        progress: data.progress ?? { done: 0, total: 0 },
        checkpoint: data.checkpoint ?? null,
        attempts: data.attempts ?? 0,
        error: data.error ?? undefined,
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

export async function loadBookModel(bookId: string): Promise<{
  entities: BookModelEntity[];
  events: BookModelEvent[];
  rollingSynopsis: string;
  aliasConflicts: { alias: string; entityIds: string[]; paragraphIds: string[] }[];
}> {
  if (!db) throw new Error('Firebase is not configured.');
  await ensureAnonymousAuth();
  const [bookSnapshot, entitySnapshot, eventSnapshot, ledgerSnapshot] = await Promise.all([
    getDoc(doc(db, 'books', bookId)),
    getDocs(collection(db, 'books', bookId, 'entities')),
    getDocs(query(collection(db, 'books', bookId, 'events'), orderBy('order'))),
    getDoc(doc(db, 'books', bookId, 'derived', 'ledger')),
  ]);
  const sourceId = bookSnapshot.data()?.activeSourceId;
  const canonicalHash = bookSnapshot.data()?.canonical?.hash;
  const matchesActiveSource = (data: DocumentData) =>
    (!sourceId || data.sourceId === sourceId) &&
    (!canonicalHash || data.canonicalHash === canonicalHash);
  return {
    entities: entitySnapshot.docs
      .filter((item) => matchesActiveSource(item.data()))
      .map((item) => documentData<BookModelEntity>(item.data())),
    events: eventSnapshot.docs
      .filter((item) => matchesActiveSource(item.data()))
      .map((item) => documentData<BookModelEvent>(item.data())),
    rollingSynopsis: ledgerSnapshot.data()?.rollingSynopsis ?? '',
    aliasConflicts: Array.isArray(ledgerSnapshot.data()?.aliasConflicts)
      ? ledgerSnapshot.data()!.aliasConflicts
      : [],
  };
}
