'use client';

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, ensureAnonymousAuth } from './firebase';
import { assetTargetId, type AssetTarget, type ImageBatch, type VisualAsset } from './story-types';

export type { AssetTarget, AssetVersion, ImageBatch, VisualAsset } from './story-types';
export { assetTargetId } from './story-types';

type Lineage = { sourceId: string; canonicalHash: string };

function database() {
  if (!db) throw new Error('Firebase is not configured.');
  return db;
}

/** Live map of every generated asset of the active source, keyed by target ID. */
export function subscribeVisualAssets(
  bookId: string,
  lineage: Partial<Lineage>,
  onAssets: (assets: Map<string, VisualAsset>) => void,
  onError: (error: unknown) => void
): () => void {
  const store = database();
  return onSnapshot(
    collection(store, 'books', bookId, 'visualAssets'),
    (snapshot) => {
      const assets = new Map<string, VisualAsset>();
      for (const item of snapshot.docs) {
        const asset = item.data() as VisualAsset;
        if (asset.sourceId === lineage.sourceId && asset.canonicalHash === lineage.canonicalHash) {
          assets.set(item.id, { ...asset, versions: asset.versions ?? [] });
        }
      }
      onAssets(assets);
    },
    onError
  );
}

/** Queues one image. Regenerating adds a version; the approved one stays until another is approved. */
export async function requestImage(
  bookId: string,
  target: AssetTarget,
  lineage: Lineage,
  note: string | null
): Promise<string> {
  const store = database();
  await ensureAnonymousAuth();
  const jobRef = await addDoc(collection(store, 'books', bookId, 'jobs'), {
    type: 'image',
    stage: 'images',
    status: 'queued_v3',
    target,
    note: note?.trim() || null,
    sourceId: lineage.sourceId,
    canonicalHash: lineage.canonicalHash,
    progress: { done: 0, total: 1 },
    activity: null,
    checkpoint: null,
    attempts: 0,
    error: null,
    costUsd: 0,
    startedAt: null,
    finishedAt: null,
    createdAt: serverTimestamp(),
  });
  const targetId = assetTargetId(target);
  await setDoc(
    doc(store, 'books', bookId, 'visualAssets', targetId),
    { ...lineage, ...target, targetId, status: 'generating', error: null, lastJobId: jobRef.id },
    { merge: true }
  );
  return jobRef.id;
}

/**
 * Queues many images as Gemini batches at half price. Results arrive when
 * Gemini finishes (usually within hours, at most 24h); the worker saves them
 * as new versions to review like any other.
 */
export async function requestImageBatch(
  bookId: string,
  items: { target: AssetTarget; note: string | null }[],
  lineage: Lineage
): Promise<string> {
  const store = database();
  await ensureAnonymousAuth();
  const jobRef = await addDoc(collection(store, 'books', bookId, 'jobs'), {
    type: 'imageBatch',
    stage: 'images',
    status: 'queued_v3',
    items: items.map((item) => ({ target: item.target, note: item.note?.trim() || null })),
    sourceId: lineage.sourceId,
    canonicalHash: lineage.canonicalHash,
    progress: { done: 0, total: items.length },
    activity: null,
    checkpoint: null,
    attempts: 0,
    error: null,
    costUsd: 0,
    startedAt: null,
    finishedAt: null,
    createdAt: serverTimestamp(),
  });
  await Promise.all(
    items.map((item) =>
      setDoc(
        doc(store, 'books', bookId, 'visualAssets', assetTargetId(item.target)),
        { ...lineage, ...item.target, targetId: assetTargetId(item.target), status: 'batched', error: null, lastJobId: jobRef.id },
        { merge: true }
      )
    )
  );
  return jobRef.id;
}

export function subscribeImageBatches(
  bookId: string,
  lineage: Partial<Lineage>,
  onBatches: (batches: ImageBatch[]) => void,
  onError: (error: unknown) => void
): () => void {
  const store = database();
  return onSnapshot(
    collection(store, 'books', bookId, 'imageBatches'),
    (snapshot) =>
      onBatches(
        snapshot.docs
          .map((item) => item.data() as ImageBatch)
          .filter((batch) => batch.sourceId === lineage.sourceId && batch.canonicalHash === lineage.canonicalHash)
          .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))
      ),
    onError
  );
}

export async function approveVersion(bookId: string, targetId: string, versionId: string): Promise<void> {
  const store = database();
  await ensureAnonymousAuth();
  await updateDoc(doc(store, 'books', bookId, 'visualAssets', targetId), {
    approvedVersionId: versionId,
    status: 'approved',
    updatedAt: serverTimestamp(),
  });
}
