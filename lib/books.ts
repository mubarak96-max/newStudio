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

export type Book = {
  id: string;
  name: string;
  author: string;
  genres: string[];
  pdfUrl: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  createdAt?: Date | null;
};

export type NewBookInput = {
  name: string;
  author: string;
  genres: string[];
  file: File;
};

const BOOKS_COLLECTION = 'books';

function snapToBook(snap: QueryDocumentSnapshot<DocumentData>): Book {
  const data = snap.data();
  const createdAt = data.createdAt?.toDate?.() ?? null;
  return {
    id: snap.id,
    name: data.name ?? 'Untitled',
    author: data.author ?? 'Unknown',
    genres: Array.isArray(data.genres) ? data.genres : [],
    pdfUrl: data.pdfUrl ?? '',
    storagePath: data.storagePath ?? '',
    fileName: data.fileName ?? '',
    fileSize: data.fileSize ?? 0,
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

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'book.pdf';
}

export async function uploadBook(
  input: NewBookInput,
  onProgress?: (pct: number) => void
): Promise<Book> {
  if (!db || !storage) throw new Error('Firebase is not configured.');
  await ensureAnonymousAuth();

  const name = input.name.trim();
  const author = input.author.trim();
  if (!name) throw new Error('Book name is required.');
  if (!author) throw new Error('Author is required.');
  if (!input.file) throw new Error('A PDF file is required.');
  if (input.file.type !== 'application/pdf' && !input.file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Only PDF files are allowed.');
  }

  const docRef = await addDoc(collection(db, BOOKS_COLLECTION), {
    name,
    author,
    genres: input.genres,
    pdfUrl: '',
    storagePath: '',
    fileName: input.file.name,
    fileSize: input.file.size,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const storagePath = `books/${docRef.id}/${Date.now()}-${sanitizeFileName(input.file.name)}`;
  const storageRef = ref(storage, storagePath);

  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, input.file, {
      contentType: 'application/pdf',
    });
    task.on(
      'state_changed',
      (snapshot: UploadTaskSnapshot) => {
        if (snapshot.totalBytes > 0) {
          onProgress?.(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
        }
      },
      (err) => reject(err),
      () => resolve()
    );
  });

  const pdfUrl = await getDownloadURL(storageRef);
  await updateDoc(docRef, { pdfUrl, storagePath, updatedAt: serverTimestamp() });

  const created = await getDoc(docRef);
  return snapToBook(created as QueryDocumentSnapshot<DocumentData>);
}

export async function deleteBook(book: Book): Promise<void> {
  if (!db || !storage) throw new Error('Firebase is not configured.');
  await ensureAnonymousAuth();
  if (book.storagePath) {
    try {
      await deleteObject(ref(storage, book.storagePath));
    } catch {
      // Storage object may already be gone; still delete the Firestore doc.
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
