import { ruleVersions } from './rules.ts';
import type { AssetVersion, Lineage, VisualAsset } from './story-types.ts';

export function versionIssues(asset: VisualAsset, version: AssetVersion, lineage: Lineage & { visualProfileVersion?: number }, assets: Map<string, VisualAsset>, planKey?: string, path = new Set<string>()): string[] {
  const issues: string[] = [];
  const key = `${asset.targetId}:${version.versionId}`;
  if (path.has(key)) return ['Circular image references.'];
  const nextPath = new Set(path).add(key);
  if (lineage.visualProfileVersion !== undefined && version.visualProfileVersion !== lineage.visualProfileVersion) issues.push('Image uses an obsolete visual profile.');
  if (asset.sourceId !== lineage.sourceId || asset.canonicalHash !== lineage.canonicalHash) issues.push('Asset belongs to a different source.');
  if (!version.check?.ok || !version.check.semantic || version.check.version !== ruleVersions.imageChecks) issues.push('Current image checks have not passed.');
  if (!version.planKey || (planKey && version.planKey !== planKey)) issues.push('Image was generated from an obsolete visual plan.');
  for (const pin of version.references) {
    const dependency = assets.get(pin.targetId);
    const approved = dependency?.versions?.find((item) => item.versionId === dependency.approvedVersionId);
    if (!dependency || dependency.sourceId !== lineage.sourceId || dependency.canonicalHash !== lineage.canonicalHash || approved?.versionId !== pin.versionId || !approved.check?.ok || !approved.check.semantic || approved.check.version !== ruleVersions.imageChecks) {
      issues.push(`Reference ${pin.targetId} has changed or has not passed checks.`);
    } else if (versionIssues(dependency, approved!, lineage, assets, undefined, nextPath).length) {
      issues.push(`Reference ${pin.targetId} has an invalid dependency.`);
    }
  }
  return issues;
}

export function requiredMasterIssue(version: AssetVersion, compositionId: string, masterLayerId: string): string | null {
  return version.references[0]?.targetId === `layer__${compositionId}__${masterLayerId}` ? null : 'The first reference must be this scene’s approved master.';
}
