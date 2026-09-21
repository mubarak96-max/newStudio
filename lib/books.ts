import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type UploadTaskSnapshot,
} from 'firebase/storage';
import { db, ensureAnonymousAuth, isFirebaseConfigured, storage } from './firebase';

/**
 * Firestore shape: books/{bookId} — one doc per book.
 *   { metaData: { title, author, genres[], description, coverPhotoUrl, storagePath } }
 * Plus server timestamps (createdAt/updatedAt) for ordering.
 * metaData.storagePath is the Storage object path of the source PDF.
 */
export type Book = {
  id: string;
  title: string;
  author: string;
  genres: string[];
  description: string;
  coverPhotoUrl: string;
  storagePath: string;
  sourceFile?: {
    sourceId: string;
    storagePath: string;
    originalFileName: string;
    sizeBytes: number;
    pageCount: number | null;
    checksum: string;
  };
  activeSourceId?: string;
  canonical?: { storagePath: string; hash: string; textHash?: string };
  stats?: {
    paragraphCount: number;
    storyParagraphCount: number;
    wordCount: number;
    tokenEstimate: number;
  };
  pipeline?: {
    stage: string;
    stageStatus: string;
    lastJobId?: string;
    updatedAt: string;
  };
  /** Latest job per pipeline stage, so a page can follow its stage after the pipeline moves on. */
  pipelineJobs?: Record<string, string>;
  createdAt?: Date | null;
};

export type NewBookInput = {
  title: string;
  author: string;
  genres: string[];
  description: string;
  pdfFile: File;
  coverFile?: File | null;
};

const BOOKS_COLLECTION = 'books';

function snapToBook(snap: QueryDocumentSnapshot<DocumentData>): Book {
  const data = snap.data();
  const createdAt = data.createdAt?.toDate?.() ?? null;
  const meta: DocumentData =
    data.metaData && typeof data.metaData === 'object' ? data.metaData : data;
  const genres = meta.genres ?? data.genres;
  return {
    id: snap.id,
    // Fall back to legacy top-level `title`/`name` so older docs still list.
    title: meta.title ?? data.title ?? data.name ?? 'Untitled',
    author: meta.author ?? data.author ?? 'Unknown',
    genres: Array.isArray(genres) ? genres : [],
    description: meta.description ?? data.description ?? '',
    coverPhotoUrl: meta.coverPhotoUrl ?? data.coverPhotoUrl ?? '',
    storagePath: data.sourceFile?.storagePath ?? meta.storagePath ?? data.storagePath ?? '',
    sourceFile: data.sourceFile,
    activeSourceId: data.activeSourceId,
    canonical: data.canonical,
    stats: data.stats,
    pipeline: data.pipeline,
    pipelineJobs: data.pipelineJobs,
    createdAt,
  };
}

export function subscribeBooks(
  onBooks: (books: Book[]) => void,
  onError: (err: unknown) => void
): () => void {
  if (!db || !isFirebaseConfigured) {
    onError(new Error('Firebase is not configured. Set NEXT_PUBLIC_FIREBASE_* in .env.'));
    return () => undefined;
  }
  const q = query(collection(db, BOOKS_COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => onBooks(snapshot.docs.map(snapToBook)),
    (err) => onError(err)
  );
}

export async function getBook(id: string): Promise<Book | null> {
  if (!db) throw new Error('Firebase is not configured.');
  await ensureAnonymousAuth();
  const snap = await getDoc(doc(db, BOOKS_COLLECTION, id));
  if (!snap.exists()) return null;
  return snapToBook(snap as QueryDocumentSnapshot<DocumentData>);
}

/** Resolve a Storage object path (book.storagePath) to a download URL for the PDF. */
export async function getPdfDownloadUrl(storagePath: string): Promise<string> {
  if (!storage) throw new Error('Firebase is not configured.');
  await ensureAnonymousAuth();
  if (!storagePath) throw new Error('This book has no PDF attached.');
  // Legacy docs stored a full download URL in storagePath/pdfUrl — pass it through.
  if (/^https?:\/\//.test(storagePath)) return storagePath;
  return getDownloadURL(ref(storage, storagePath));
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
}

async function sha256File(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function uploadWithProgress(
  path: string,
  file: File,
  contentType: string,
  onProgress?: (fraction: number) => void
): Promise<void> {
  if (!storage) throw new Error('Firebase is not configured.');
  const storageRef = ref(storage, path);
  return new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, { contentType });
    task.on(
      'state_changed',
      (snapshot: UploadTaskSnapshot) => {
        if (snapshot.totalBytes > 0) {
          onProgress?.(snapshot.bytesTransferred / snapshot.totalBytes);
        }
      },
      (err) => reject(err),
      () => resolve()
    );
  });
}

export async function uploadBook(
  input: NewBookInput,
  onProgress?: (pct: number) => void
): Promise<Book> {
  if (!db || !storage) throw new Error('Firebase is not configured.');
  await ensureAnonymousAuth();

  const title = input.title.trim();
  const author = input.author.trim();
  const description = input.description.trim();
  if (!title) throw new Error('Book title is required.');
  if (!author) throw new Error('Author is required.');
  if (!input.pdfFile) throw new Error('A PDF file is required.');
  if (
    input.pdfFile.type !== 'application/pdf' &&
    !input.pdfFile.name.toLowerCase().endsWith('.pdf')
  ) {
    throw new Error('Only PDF files are allowed.');
  }
  if (input.coverFile && !input.coverFile.type.startsWith('image/')) {
    throw new Error('The cover must be an image file.');
  }

  const checksum = await sha256File(input.pdfFile);
  const sourceId = `src_${checksum.slice(0, 16)}`;

  // 1. Create books/{bookId} with the metaData shape.
  const docRef = await addDoc(collection(db, BOOKS_COLLECTION), {
    schemaVersion: 1,
    bookId: '',
    title,
    author,
    genres: input.genres,
    description,
    coverPhotoUrl: '',
    metaData: {
      title,
      author,
      genres: input.genres,
      description,
      coverPhotoUrl: '',
      storagePath: '',
    },
    sourceFile: {
      sourceId,
      storagePath: '',
      originalFileName: input.pdfFile.name,
      sizeBytes: input.pdfFile.size,
      pageCount: null,
      checksum,
    },
    structure: { chapters: [] },
    stats: { paragraphCount: 0, storyParagraphCount: 0, wordCount: 0, tokenEstimate: 0 },
    pipeline: {
      stage: 'upload',
      stageStatus: 'running',
      updatedAt: new Date().toISOString(),
    },
    publishing: { publishedEpisodeIds: [], latestVersion: 0 },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 2. Upload the source PDF to Storage.
  const pdfPath = `books/${docRef.id}/sources/${sourceId}/original/${sanitizeFileName(input.pdfFile.name)}`;
  await uploadWithProgress(pdfPath, input.pdfFile, 'application/pdf', (f) => {
    // PDF is the bulk of the work; reserve the tail for the cover.
    onProgress?.(Math.round(f * (input.coverFile ? 85 : 100)));
  });

  // 3. Upload the cover photo (if any) and resolve its download URL.
  let coverPhotoUrl = '';
  if (input.coverFile) {
    const coverPath = `books/${docRef.id}/cover-${Date.now()}-${sanitizeFileName(input.coverFile.name)}`;
    await uploadWithProgress(
      coverPath,
      input.coverFile,
      input.coverFile.type || 'image/jpeg',
      (f) => onProgress?.(Math.round(85 + f * 15))
    );
    coverPhotoUrl = await getDownloadURL(ref(storage, coverPath));
  }

  // 4. Point the doc at both Storage objects.
  await updateDoc(docRef, {
    bookId: docRef.id,
    coverPhotoUrl,
    'metaData.storagePath': pdfPath,
    'metaData.coverPhotoUrl': coverPhotoUrl,
    'sourceFile.storagePath': pdfPath,
    pipeline: {
      stage: 'upload',
      stageStatus: 'approved',
      updatedAt: new Date().toISOString(),
    },
    updatedAt: serverTimestamp(),
  });

  const created = await getDoc(docRef);
  return snapToBook(created as QueryDocumentSnapshot<DocumentData>);
}

export async function deleteBook(book: Book): Promise<void> {
  if (!db || !storage) throw new Error('Firebase is not configured.');
  await ensureAnonymousAuth();
  if (book.storagePath && !/^https?:\/\//.test(book.storagePath)) {
    try {
      await deleteObject(ref(storage, book.storagePath));
    } catch {
      // Storage object may already be gone; still delete the Firestore doc.
    }
  }
  if (book.coverPhotoUrl) {
    try {
      await deleteObject(ref(storage, book.coverPhotoUrl));
    } catch {
      // Cover may already be gone or be an external URL — ignore.
    }
  }
  await deleteDoc(doc(db, BOOKS_COLLECTION, book.id));
}

export function parseGenres(raw: string): string[] {
  return raw
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean)
    .slice(0, 10);
}
