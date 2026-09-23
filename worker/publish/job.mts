import { createHash } from "node:crypto";
import { ruleVersions } from "../../lib/rules.ts";
import { FieldValue } from "firebase-admin/firestore";
import type { CompositionPlan } from "../../lib/story-types.ts";
import { nullableString } from "../coerce.mts";
import { db } from "../config.mts";
import type { JobDefinition } from "../job-runner.mts";
import { loadEpisodes, loadMoments } from "../story/persist.mts";
import { putObject, publicUrl, s3Config } from "../storage/s3.mts";
import { buildEpisodeManifest, manifestSchemaVersion, type PublishIssue } from "./manifest.mts";

/**
 * Publishes Episodes as immutable packages and points the book's index at
 * them. Nothing is edited in place: a correction is a new version, and
 * rollback is a pointer move, so a reading app can cache a package forever.
 */
export const publishJob: JobDefinition<Record<string, never>> = {
  type: "publish",
  version: "publish-v1",
  initialState: () => ({}),
  run: async (context) => {
    const { bookId, jobId } = context;
    const job = (await db.doc(`books/${bookId}/jobs/${jobId}`).get()).data() ?? {};
    const only = nullableString(job.episodeId);
    const lineage = { sourceId: context.sourceId, canonicalHash: context.canonicalHash };
    const book = (await db.doc(`books/${bookId}`).get()).data() ?? {};
    const candidates = (await loadEpisodes(bookId, lineage)).filter((episode) => !only || episode.episodeId === only);
    if (candidates.length === 0) throw new Error("No Episodes exist for the active source.");
    // An Episode publishes only once its scenes are assembled. Forcing is for
    // the owner who wants a text-first package on purpose.
    const force = job.force === true;
    const blocked = candidates.filter((episode) => episode.stageStatus?.composed !== "done");
    const episodes = force ? candidates : candidates.filter((episode) => episode.stageStatus?.composed === "done");
    if (episodes.length === 0) {
      throw new Error(
        `${blocked.length} Episode(s) are not assembled yet: ${blocked.map((episode) => episode.title).slice(0, 5).join(", ")}. ` +
          "Assemble them first, or publish with force to ship what exists.",
      );
    }

    const compositions = new Map(
      (await db.collection(`books/${bookId}/compositions`).get()).docs
        .map((doc) => doc.data() as CompositionPlan)
        .filter((composition) => composition.sourceId === lineage.sourceId && composition.canonicalHash === lineage.canonicalHash)
        .map((composition) => [composition.compositionId, composition]),
    );
    const names = new Map(
      (await db.collection(`books/${bookId}/entities`).get()).docs.map((doc) => [doc.id, String(doc.data().canonicalName ?? doc.id)]),
    );

    const s3 = s3Config();
    const published: { episodeId: string; version: string; url: string; beats: number; scenes: number }[] = [];
    const allIssues: PublishIssue[] = [];
    for (const [index, episode] of episodes.entries()) {
      if (await context.cancelled()) return null;
      await context.onActivity({
        label: "Publishing Episodes",
        detail: episode.title,
        done: index,
        total: episodes.length,
        unit: "episodes",
      });
      const moments = await loadMoments(bookId, episode.episodeId);
      const draft = buildEpisodeManifest(bookId, episode, moments, compositions, (id) => names.get(id) ?? id, "pending");
      const version = createHash("sha256")
        .update(JSON.stringify({ ...draft.manifest, version: "", publishedAt: "" }))
        .digest("hex")
        .slice(0, 16);
      const manifest = { ...draft.manifest, version };
      allIssues.push(...draft.issues);
      if (manifest.beats.length === 0) {
        allIssues.push({ episodeId: episode.episodeId, beatId: null, reason: "no publishable Beats" });
        continue;
      }
      const key = `books/${bookId}/published/${episode.episodeId}/${version}/manifest.json`;
      await putObject(s3, key, Buffer.from(JSON.stringify(manifest)), "application/json; charset=utf-8");
      await db.doc(`books/${bookId}/publishedEpisodes/${episode.episodeId}__${version}`).set({
        ...lineage,
        episodeId: episode.episodeId,
        order: episode.order,
        title: episode.title,
        version,
        schemaVersion: manifestSchemaVersion,
        manifestKey: key,
        manifestUrl: publicUrl(s3, key),
        beats: manifest.beats.length,
        scenes: manifest.scenes.length,
        abridgement: manifest.abridgement,
        issues: draft.issues,
        publishedAt: FieldValue.serverTimestamp(),
      });
      published.push({
        episodeId: episode.episodeId,
        version,
        url: publicUrl(s3, key),
        beats: manifest.beats.length,
        scenes: manifest.scenes.length,
      });
    }

    // The book index names the active version of every Episode; rollback is a
    // change to this one document and never touches a published package.
    const active = { ...((book.publication?.episodes ?? {}) as Record<string, unknown>) };
    for (const item of published) active[item.episodeId] = { version: item.version, url: item.url, beats: item.beats };
    await db.doc(`books/${bookId}`).update({
      publication: {
        schemaVersion: manifestSchemaVersion,
        ...lineage,
        episodes: active,
        updatedAt: new Date().toISOString(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });

    await db.doc(`books/${bookId}`).update({ "ruleVersions.publication": ruleVersions.publication });
    return (
      `${published.length} episode package(s) published` +
      `${blocked.length > 0 ? `, ${blocked.length} skipped as unassembled` : ""}` +
      `${allIssues.length > 0 ? `, ${allIssues.length} beat(s) with issues` : ""}`
    );
  },
};
