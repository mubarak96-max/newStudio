'use client';

import { doc, getDoc } from 'firebase/firestore';
import { db, ensureAnonymousAuth } from './firebase';
import type { Beat, CompositionPlan, Moment } from './story-types';
import { loadMoments } from './story';

export type PreviewBeat = Beat & { momentId: string; momentTitle: string; momentOrder: number };

export type EpisodePreview = {
  beats: PreviewBeat[];
  moments: Moment[];
  compositions: Map<string, CompositionPlan>;
};

/** Everything the player needs for one Episode: its Beats in reading order and the compositions they show. */
export async function loadEpisodePreview(bookId: string, episodeId: string): Promise<EpisodePreview> {
  if (!db) throw new Error('Firebase is not configured.');
  await ensureAnonymousAuth();
  const store = db;
  const moments = await loadMoments(bookId, episodeId);
  const beats = moments.flatMap((moment) =>
    moment.readingBeats.map((beat) => ({ ...beat, momentId: moment.momentId, momentTitle: moment.title, momentOrder: moment.order }))
  );
  const ids = [...new Set(beats.flatMap((beat) => (beat.compositionId ? [beat.compositionId] : [])))];
  const snapshots = await Promise.all(ids.map((id) => getDoc(doc(store, 'books', bookId, 'compositions', id))));
  const compositions = new Map<string, CompositionPlan>();
  for (const snapshot of snapshots) {
    if (snapshot.exists()) compositions.set(snapshot.id, snapshot.data() as CompositionPlan);
  }
  return { beats, moments, compositions };
}
