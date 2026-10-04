import { requiredMasterIssue, versionIssues } from "../../lib/asset-validation.ts";
import { assetTargetId, type AssetVersion, type CompositionPlan, type VisualAsset, type VisualProfile } from "../../lib/story-types.ts";
import { imagePlanKey, planImage } from "../images/request.mts";

export function eligibleLayers(composition: CompositionPlan, assets: Map<string, VisualAsset>, profile: VisualProfile): Map<string, AssetVersion> {
  const approved = new Map<string, AssetVersion>();
  if (!composition.shotSnapshot.direction || profile.version !== composition.visualProfileVersion) return approved;
  for (const layer of composition.layers) {
    const target = { kind: "layer" as const, entityId: null, stateId: null, compositionId: composition.compositionId, layerId: layer.layerId };
    const asset = assets.get(assetTargetId(target));
    const version = asset?.versions?.find((version) => version.versionId === asset.approvedVersionId);
    const planned = planImage(target, { profile, entity: null, composition, note: null });
    if (!asset || !version || versionIssues(asset, version, composition, assets, imagePlanKey(planned, profile.version)).length) continue;
    if (planned.referenceTargets.some((group, index) => !group.includes(version.references[index]?.targetId ?? ""))) continue;
    if (!layer.kind || (layer.derivedFrom && requiredMasterIssue(version, composition.compositionId, layer.derivedFrom))) continue;
    approved.set(layer.layerId, version);
  }
  const master = composition.layers.find((layer) => layer.kind === "master");
  if (!master || !approved.has(master.layerId)) return new Map();
  return approved;
}
