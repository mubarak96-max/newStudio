import { eligibleLayers } from "../compose/eligibility.mts";
import { assetTargetId, type CompositionPlan, type Lineage, type VisualAsset, type VisualProfile } from "../../lib/story-types.ts";
import { db } from "../config.mts";

export type ImageStageReport = {
  layers: number;
  approved: number;
  failedChecks: number;
  compositionsReady: number;
  compositions: number;
};

/**
 * What "images done" actually means: every scene layer of every composition has
 * an approved image. Reference sheets are inputs, not the work — the stage
 * used to report done with 74 sheets generated and no scene at all.
 */
export async function imageStageReport(bookId: string, lineage: Lineage): Promise<ImageStageReport> {
  const compositions = (await db.collection(`books/${bookId}/compositions`).get()).docs
    .map((doc) => doc.data() as CompositionPlan)
    .filter((composition) => composition.sourceId === lineage.sourceId && composition.canonicalHash === lineage.canonicalHash);
  const assets = new Map(
    (await db.collection(`books/${bookId}/visualAssets`).get()).docs.map((doc) => [doc.id, doc.data() as VisualAsset]),
  );
  const profile = (await db.doc(`books/${bookId}`).get()).data()?.visualProfile as VisualProfile | undefined;
  const report: ImageStageReport = { layers: 0, approved: 0, failedChecks: 0, compositionsReady: 0, compositions: compositions.length };
  for (const composition of compositions) {
    const eligible = profile ? eligibleLayers(composition, assets, profile) : new Map();
    let ready = composition.layers.some((layer) => layer.kind === "master" && eligible.has(layer.layerId));
    for (const layer of composition.layers) {
      report.layers += 1;
      const asset = assets.get(
        assetTargetId({ kind: "layer", entityId: null, stateId: null, compositionId: composition.compositionId, layerId: layer.layerId }),
      );
      const version = asset?.versions?.find((item) => item.versionId === asset.approvedVersionId);
      if (version && eligible.has(layer.layerId)) {
        report.approved += 1;

      } else {
        if (version) report.failedChecks += 1;
        // A master alone still plays; only a missing master blocks the composition.
        if (layer.kind === "master" || !layer.kind) ready = false;
      }
    }
    if (ready) report.compositionsReady += 1;
  }
  return report;
}
