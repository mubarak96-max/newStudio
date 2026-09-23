import { FieldValue } from "firebase-admin/firestore";
import { ruleVersions } from "../../lib/rules.ts";
import type { CompositionPlan } from "../../lib/story-types.ts";
import { nullableString } from "../coerce.mts";
import { db } from "../config.mts";
import type { JobDefinition } from "../job-runner.mts";
import { loadEpisodes, loadMoments, updateEpisode, writeMoments } from "../story/persist.mts";
import { approvedLayers, assembleComposition, fingerprintOf, fitBeat } from "./assemble.mts";

/**
 * Assembles one Episode (or every Episode) into playable 2.5D: every
 * composition its Beats use, including ones first made for an earlier
 * Episode. Compositions whose approved images have not changed are skipped.
 */
export const composeJob: JobDefinition<Record<string, never>> = {
  type: "compose",
  version: "compose-v1",
  initialState: () => ({}),
  run: async (context) => {
    const { bookId, jobId } = context;
    const job = (await db.doc(`books/${bookId}/jobs/${jobId}`).get()).data() ?? {};
    const only = nullableString(job.episodeId);
    const lineage = { sourceId: context.sourceId, canonicalHash: context.canonicalHash };
    const episodes = (await loadEpisodes(bookId, lineage)).filter((episode) => !only || episode.episodeId === only);
    if (episodes.length === 0) throw new Error(`Episode ${only} does not exist for the active source.`);

    const episodeIds = new Set(episodes.map((episode) => episode.episodeId));
    const compositions = (await db.collection(`books/${bookId}/compositions`).get()).docs
      .map((doc) => doc.data() as CompositionPlan)
      .filter(
        (composition) =>
          composition.sourceId === lineage.sourceId &&
          composition.canonicalHash === lineage.canonicalHash &&
          composition.usedIn.some((usage) => episodeIds.has(usage.episodeId)),
      );

    const assemblies = new Map<string, CompositionPlan["assembly"]>();
    let built = 0;
    let withIssues = 0;
    for (const [index, composition] of compositions.entries()) {
      if (await context.cancelled()) return null;
      await context.onActivity({
        label: "Assembling 2.5D compositions",
        detail: composition.shotSnapshot.description.slice(0, 80),
        done: index,
        total: compositions.length,
        unit: "compositions",
      });
      const approved = await approvedLayers(bookId, composition);
      if (composition.assembly && composition.assembly.fingerprint === fingerprintOf(approved)) {
        assemblies.set(composition.compositionId, composition.assembly);
        if (composition.assembly.status === "issues") withIssues += 1;
        continue;
      }
      const assembly = await assembleComposition(bookId, composition, approved, composition.assembly);
      await db
        .doc(`books/${bookId}/compositions/${composition.compositionId}`)
        .update({ assembly, updatedAt: FieldValue.serverTimestamp() });
      assemblies.set(composition.compositionId, assembly);
      built += 1;
      if (assembly.status === "issues") withIssues += 1;
    }

    let clamped = 0;
    let beats = 0;
    for (const episode of episodes) {
      const moments = await loadMoments(bookId, episode.episodeId);
      const fitted = moments.map((moment) => ({
        ...moment,
        readingBeats: moment.readingBeats.map((beat) => {
          beats += 1;
          const result = fitBeat(beat, beat.compositionId ? assemblies.get(beat.compositionId) : undefined);
          if (result.clamped) clamped += 1;
          return result.beat;
        }),
      }));
      await writeMoments(bookId, episode.episodeId, fitted);
      const missing = [...new Set(fitted.flatMap((moment) => moment.readingBeats.map((beat) => beat.compositionId)))].filter(
        (id) => id && assemblies.get(id)?.status !== "composed",
      ).length;
      await updateEpisode(bookId, episode.episodeId, {
        "stageStatus.composed": missing === 0 ? "done" : "failed",
        composeIssues: missing,
      });
    }
    await db.doc(`books/${bookId}`).update({ "ruleVersions.composition": ruleVersions.composition });
    return `${compositions.length} compositions (${built} rebuilt, ${withIssues} with issues), ${beats} beats fitted, ${clamped} cameras clamped`;
  },
  /**
   * The book is only composed when every Episode is. A run for one Episode
   * used to mark the whole book done, which is how an Episode with nothing
   * assembled sat behind a green tick.
   */
  bookStatus: async (context) => {
    const lineage = { sourceId: context.sourceId, canonicalHash: context.canonicalHash };
    const episodes = await loadEpisodes(context.bookId, lineage);
    const outstanding = episodes.filter((episode) => episode.stageStatus?.composed !== "done");
    if (outstanding.length > 0) {
      context.log(`${outstanding.length} of ${episodes.length} Episodes are not composed; the book stays incomplete.`);
    }
    return outstanding.length === 0 ? "done" : "failed";
  },
};
