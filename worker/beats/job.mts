import type { Moment } from "../../lib/story-types.ts";
import { ruleVersions } from "../../lib/rules.ts";
import { db, storyConcurrency } from "../config.mts";
import { pool, type JobDefinition } from "../job-runner.mts";
import type { StoryContext } from "../story/context.mts";
import { loadStoryInputs } from "../story/inputs.mts";
import { loadEpisodes, loadMoments, updateEpisode, writeMoments } from "../story/persist.mts";
import { buildMomentBeats } from "./build.mts";

type BeatsState = {
  phase: "beats" | "link" | "done";
  /** Beat IDs in reading order, per Episode; enough to link neighbours without holding every Beat. */
  beatIds: Record<string, string[]>;
  totals: { beats: number; paragraphs: number; fallbackParagraphs: number; wordsShown: number; words: number };
};

export const beatsJob: JobDefinition<BeatsState> = {
  type: "beats",
  version: "beats-v1",
  next: "visuals",
  initialState: () => ({
    phase: "beats",
    beatIds: {},
    totals: { beats: 0, paragraphs: 0, fallbackParagraphs: 0, wordsShown: 0, words: 0 },
  }),
  run: async (jobContext, state, checkpoint) => {
    const { bookId } = jobContext;
    const inputs = await loadStoryInputs(bookId, jobContext.sourceId, jobContext.canonicalHash);
    const context: StoryContext = { ...jobContext, inputs };
    const episodes = await loadEpisodes(bookId, inputs);
    const totalMoments = episodes.reduce((sum, episode) => sum + episode.momentCount, 0);

    if (state.phase === "beats") {
      let done = episodes
        .filter((episode) => state.beatIds[episode.episodeId])
        .reduce((sum, episode) => sum + episode.momentCount, 0);
      for (const episode of episodes) {
        if (state.beatIds[episode.episodeId]) continue;
        if (await context.cancelled()) return null;
        const moments = await loadMoments(bookId, episode.episodeId);
        const built: Moment[] = await pool(moments, storyConcurrency, async (moment, index) => {
          const { beats, coverage } = await buildMomentBeats(context, moment, moments[index - 1] ?? null);
          done += 1;
          await context.onActivity({
            label: `Building Beats: ${episode.title}`,
            detail: `Episode ${episode.order} of ${episodes.length}`,
            done,
            total: totalMoments,
            unit: "moments",
          });
          return {
            ...moment,
            readingBeats: beats,
            beatCoverage: coverage,
            compositionIds: Array.from(new Set(beats.flatMap((beat) => (beat.compositionId ? [beat.compositionId] : [])))),
          };
        });
        await writeMoments(bookId, episode.episodeId, built);
        const beatCount = built.reduce((sum, moment) => sum + moment.readingBeats.length, 0);
        await updateEpisode(bookId, episode.episodeId, { "stageStatus.beats": "done", beatCount });
        state.beatIds[episode.episodeId] = built.flatMap((moment) => moment.readingBeats.map((beat) => beat.id));
        for (const moment of built) {
          state.totals.beats += moment.readingBeats.length;
          state.totals.paragraphs += moment.beatCoverage?.storyParagraphs ?? 0;
          state.totals.fallbackParagraphs += moment.beatCoverage?.representedByFallback.length ?? 0;
          state.totals.wordsShown += moment.beatCoverage?.wordsShownVerbatim ?? 0;
          state.totals.words += moment.wordCount;
        }
        await checkpoint(`beats-${episode.episodeId}`);
      }
      state.phase = "link";
      await checkpoint("beats");
    }

    if (state.phase === "link") {
      // Next and Previous run through Moment and Episode boundaries in reading order.
      const order = episodes.flatMap((episode) => state.beatIds[episode.episodeId] ?? []);
      const position = new Map(order.map((id, index) => [id, index]));
      for (const [index, episode] of episodes.entries()) {
        await context.onActivity({ label: "Linking Beats in reading order", detail: episode.title, done: index, total: episodes.length, unit: "episodes" });
        const moments = await loadMoments(bookId, episode.episodeId);
        for (const moment of moments) {
          for (const beat of moment.readingBeats) {
            const at = position.get(beat.id) ?? -1;
            beat.previousBeatId = at > 0 ? order[at - 1]! : null;
            beat.nextBeatId = at >= 0 && at + 1 < order.length ? order[at + 1]! : null;
          }
        }
        await writeMoments(bookId, episode.episodeId, moments);
      }
      state.phase = "done";
      await checkpoint("done");
    }

    const { totals } = state;
    await db.doc(`books/${bookId}`).update({ "ruleVersions.story": ruleVersions.story });
    return `${totals.beats} beats over ${totalMoments} moments; ${totals.paragraphs - totals.fallbackParagraphs}/${totals.paragraphs} paragraphs represented by the model, ${totals.wordsShown}/${totals.words} words shown verbatim`;
  },
};
