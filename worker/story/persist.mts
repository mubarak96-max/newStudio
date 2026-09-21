import { FieldValue } from "firebase-admin/firestore";
import type { Episode, Lineage, Moment, StoryMap } from "../../lib/story-types.ts";
import { db } from "../config.mts";

export async function loadEpisodes(bookId: string, lineage: Lineage): Promise<Episode[]> {
  const snapshot = await db.collection(`books/${bookId}/episodes`).orderBy("order").get();
  const episodes = snapshot.docs
    .map((doc) => doc.data() as Episode)
    .filter((episode) => episode.sourceId === lineage.sourceId && episode.canonicalHash === lineage.canonicalHash);
  if (episodes.length === 0) throw new Error("No story plan exists for the active source. Run story planning first.");
  return episodes;
}

export async function loadMoments(bookId: string, episodeId: string): Promise<Moment[]> {
  const snapshot = await db.collection(`books/${bookId}/episodes/${episodeId}/moments`).orderBy("order").get();
  return snapshot.docs.map((doc) => doc.data() as Moment);
}

export async function updateEpisode(bookId: string, episodeId: string, fields: Record<string, unknown>): Promise<void> {
  await db.doc(`books/${bookId}/episodes/${episodeId}`).update({ ...fields, updatedAt: FieldValue.serverTimestamp() });
}

export async function writeStoryMap(bookId: string, storyMap: StoryMap): Promise<void> {
  await db.doc(`books/${bookId}/derived/storyMap`).set({ ...storyMap, updatedAt: FieldValue.serverTimestamp() });
}

export async function writeEpisode(bookId: string, episode: Episode): Promise<void> {
  await db.doc(`books/${bookId}/episodes/${episode.episodeId}`).set({ ...episode, updatedAt: FieldValue.serverTimestamp() });
}

/**
 * A re-plan coins the same IDs for the same positions, but a shorter plan
 * would leave the old tail behind; anything of this source the new plan does
 * not contain is removed with its Moments. Other sources' plans are untouched.
 */
export async function pruneEpisodes(
  bookId: string,
  keepIds: Set<string>,
  lineage: { sourceId: string; canonicalHash: string },
): Promise<number> {
  const snapshot = await db.collection(`books/${bookId}/episodes`).get();
  const stale = snapshot.docs.filter(
    (doc) =>
      !keepIds.has(doc.id) &&
      doc.data().sourceId === lineage.sourceId &&
      doc.data().canonicalHash === lineage.canonicalHash,
  );
  for (const doc of stale) await db.recursiveDelete(doc.ref);
  return stale.length;
}

export async function writeMoments(bookId: string, episodeId: string, moments: Moment[]): Promise<void> {
  const collection = db.collection(`books/${bookId}/episodes/${episodeId}/moments`);
  const existing = await collection.get();
  const keep = new Set(moments.map((moment) => moment.momentId));
  const writes = [
    ...moments.map((moment) => ({ kind: "set" as const, moment })),
    ...existing.docs.filter((doc) => !keep.has(doc.id)).map((doc) => ({ kind: "delete" as const, id: doc.id })),
  ];
  for (let offset = 0; offset < writes.length; offset += 200) {
    const batch = db.batch();
    for (const write of writes.slice(offset, offset + 200)) {
      if (write.kind === "set") {
        batch.set(collection.doc(write.moment.momentId), { ...write.moment, updatedAt: FieldValue.serverTimestamp() });
      } else {
        batch.delete(collection.doc(write.id));
      }
    }
    await batch.commit();
  }
}
