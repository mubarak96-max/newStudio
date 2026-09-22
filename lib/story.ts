'use client';

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db, ensureAnonymousAuth } from './firebase';
import type { Episode, Moment, StoryMap } from './story-types';

export type { Episode, Moment, StoryMap } from './story-types';

export type StoryPlan = {
  storyMap: StoryMap | null;
  episodes: Episode[];
};

function database() {
  if (!db) throw new Error('Firebase is not configured.');
  return db;
}

/** Only the plan of the active source is shown; plans of replaced sources stay in place but hidden. */
export async function loadStoryPlan(
  bookId: string,
  lineage: { sourceId?: string; canonicalHash?: string }
): Promise<StoryPlan> {
  const store = database();
  await ensureAnonymousAuth();
  const matches = (data: { sourceId?: string; canonicalHash?: string }) =>
    data.sourceId === lineage.sourceId && data.canonicalHash === lineage.canonicalHash;
  const [mapSnapshot, episodeSnapshot] = await Promise.all([
    getDoc(doc(store, 'books', bookId, 'derived', 'storyMap')),
    getDocs(query(collection(store, 'books', bookId, 'episodes'), orderBy('order'))),
  ]);
  const storyMap = mapSnapshot.data() as StoryMap | undefined;
  return {
    storyMap: storyMap && matches(storyMap) ? storyMap : null,
    episodes: episodeSnapshot.docs
      .map((item) => item.data() as Episode)
      .filter(matches),
  };
}

export async function loadMoments(bookId: string, episodeId: string): Promise<Moment[]> {
  const store = database();
  await ensureAnonymousAuth();
  const snapshot = await getDocs(
    query(collection(store, 'books', bookId, 'episodes', episodeId, 'moments'), orderBy('order'))
  );
  return snapshot.docs.map((item) => item.data() as Moment);
}

/** Mirrors `jobStages` in worker/job-queue.mts; each finished job queues the next. */
export const pipelineStages = {
  story: 'story_plan',
  beats: 'beats',
  visuals: 'visual_plan',
  compose: 'compose_25d',
} as const;

export type PipelineJobType = keyof typeof pipelineStages;

export async function enqueuePipelineJob(
  bookId: string,
  type: PipelineJobType,
  lineage: { sourceId: string; canonicalHash: string },
  /** Job-specific parameters, such as the Episode an assembly job is for. */
  extra: Record<string, unknown> = {}
): Promise<string> {
  const store = database();
  await ensureAnonymousAuth();
  const stage = pipelineStages[type];
  const jobRef = await addDoc(collection(store, 'books', bookId, 'jobs'), {
    ...extra,
    type,
    stage,
    status: 'queued_v3',
    sourceId: lineage.sourceId,
    canonicalHash: lineage.canonicalHash,
    progress: { done: 0, total: 0 },
    activity: null,
    checkpoint: null,
    attempts: 0,
    error: null,
    costUsd: 0,
    startedAt: null,
    finishedAt: null,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(store, 'books', bookId), {
    pipeline: {
      stage,
      stageStatus: 'pending',
      lastJobId: jobRef.id,
      updatedAt: new Date().toISOString(),
    },
    [`pipelineJobs.${stage}`]: jobRef.id,
    updatedAt: serverTimestamp(),
  });
  return jobRef.id;
}
