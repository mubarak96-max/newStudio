/**
 * The public Episode package: what consumer apps read.
 *
 * Production records (prompts, jobs, checks, model names, costs) never leave
 * the Studio. A package carries resolved values only — camera poses already
 * clamped, layer scale and parallax already computed — so an app plays what
 * the build validated instead of re-deriving the camera model and drifting
 * away from it.
 */

import type { Beat, CompositionAssembly, CompositionPlan, Episode, Moment } from "../../lib/story-types.ts";

export const manifestSchemaVersion = 3;

export type PublishedLayer = {
  layerId: string;
  url: string;
  width: number;
  height: number;
  zOrder: number;
  scale: number;
  parallax: number;
};

export type PublishedScene = {
  sceneId: string;
  /** 'layered' plays with parallax; 'flat' is the approved master alone. */
  mode: "layered" | "flat";
  layers: PublishedLayer[];
  /** The whole scene in one image: the fallback every scene must have. */
  flatImageUrl: string;
  safeCamera: { maxPanX: number; maxPanY: number; maxZoom: number; maxTilt: number };
  focalPoint: [number, number];
  aspect: string;
  altText: string;
};

export type PublishedBeat = {
  beatId: string;
  order: number;
  momentId: string;
  momentTitle: string;
  sceneId: string | null;
  text: Beat["text"];
  camera: { move: Beat["camera"]["move"]; from: Beat["camera"]["from"]; to: Beat["camera"]["to"]; durationMs: number; easing: string };
  transitionIn: Beat["transitionIn"];
  /** How long to hold before advancing on its own, from the reading length. */
  dwellMs: number;
  hotspots: { entityId: string; name: string; box: { x: number; y: number; w: number; h: number } }[];
};

export type EpisodeManifest = {
  schemaVersion: number;
  bookId: string;
  episodeId: string;
  order: number;
  title: string;
  summary: string;
  version: string;
  publishedAt: string;
  beats: PublishedBeat[];
  scenes: PublishedScene[];
  /** Everything the reader is not shown in the book's own words. */
  abridgement: { storyParagraphs: number; shownAsText: number; visualOnly: number };
};

function wordsOf(beat: Beat): number {
  return [beat.text.quote?.text ?? "", ...(beat.text.dialogue ?? []).map((line) => line.text), ...(beat.text.commentary ?? []).map((note) => note.text)]
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Long enough to read the subtitles, and never shorter than the camera move. */
export function dwellFor(beat: Beat): number {
  return Math.round(Math.max(beat.camera.durationMs, (wordsOf(beat) / 200) * 60_000 + 1_500, 3_000));
}

export type PublishIssue = { episodeId: string; beatId: string | null; reason: string };

/**
 * The degradation ladder, checked per Beat: layered with parallax, layered
 * flat, the master still image with camera movement, and the words alone. A
 * Beat that cannot reach the third rung is not published, because a reader
 * would meet an empty frame.
 */
function sceneFrom(composition: CompositionPlan, assembly: CompositionAssembly): PublishedScene | null {
  if (assembly.status !== "composed" || !assembly.masterUrl) return null;
  const layers = assembly.layers.filter((layer) => layer.url);
  if (layers.length === 0) return null;
  return {
    sceneId: composition.compositionId,
    mode: assembly.mode ?? (layers.length > 1 ? "layered" : "flat"),
    layers: layers.map((layer) => ({
      layerId: layer.layerId,
      url: layer.url,
      width: layer.width,
      height: layer.height,
      zOrder: layer.zOrder,
      scale: layer.scale,
      parallax: layer.parallax,
    })),
    flatImageUrl: assembly.masterUrl,
    safeCamera: assembly.safeCamera,
    focalPoint: composition.responsive?.focalPoint ?? [0.5, 0.45],
    aspect: composition.responsive?.aspect ?? "9:16",
    altText: composition.shotSnapshot.description,
  };
}

export function buildEpisodeManifest(
  bookId: string,
  episode: Episode,
  moments: Moment[],
  compositions: Map<string, CompositionPlan>,
  nameOf: (entityId: string) => string,
  version: string,
): { manifest: EpisodeManifest; issues: PublishIssue[] } {
  const issues: PublishIssue[] = [];
  const scenes = new Map<string, PublishedScene>();
  const beats: PublishedBeat[] = [];

  for (const moment of moments) {
    for (const beat of moment.readingBeats) {
      const composition = beat.compositionId ? compositions.get(beat.compositionId) : undefined;
      const assembly = composition?.assembly;
      const scene = composition && assembly ? sceneFrom(composition, assembly) : null;
      if (scene && !scenes.has(scene.sceneId)) scenes.set(scene.sceneId, scene);
      const hasText = Boolean(beat.text.quote || beat.text.dialogue?.length || beat.text.commentary?.length);
      if (!scene && !hasText) {
        issues.push({ episodeId: episode.episodeId, beatId: beat.id, reason: "no picture and no words" });
        continue;
      }
      if (!scene) {
        issues.push({ episodeId: episode.episodeId, beatId: beat.id, reason: "no assembled scene; published as text only" });
      }
      beats.push({
        beatId: beat.id,
        order: beats.length + 1,
        momentId: moment.momentId,
        momentTitle: moment.title,
        sceneId: scene?.sceneId ?? null,
        text: beat.text,
        camera: { move: beat.camera.move, from: beat.camera.from, to: beat.camera.to, durationMs: beat.camera.durationMs, easing: beat.camera.easing },
        transitionIn: beat.transitionIn,
        dwellMs: dwellFor(beat),
        hotspots: beat.inspectables
          .filter((item) => item.hotspot)
          .map((item) => ({ entityId: item.entityId, name: nameOf(item.entityId), box: item.hotspot! })),
      });
    }
  }

  const coverage = moments.reduce(
    (totals, moment) => ({
      storyParagraphs: totals.storyParagraphs + (moment.beatCoverage?.storyParagraphs ?? moment.sourceParagraphIds.length),
      shownAsText: totals.shownAsText + (moment.beatCoverage?.shownAsText ?? 0),
      visualOnly: totals.visualOnly + (moment.beatCoverage?.visualOnly ?? 0),
    }),
    { storyParagraphs: 0, shownAsText: 0, visualOnly: 0 },
  );

  return {
    manifest: {
      schemaVersion: manifestSchemaVersion,
      bookId,
      episodeId: episode.episodeId,
      order: episode.order,
      title: episode.title,
      summary: episode.summary,
      version,
      publishedAt: new Date().toISOString(),
      beats,
      scenes: [...scenes.values()],
      abridgement: coverage,
    },
    issues,
  };
}
