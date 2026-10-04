import { assetTargetId, type AssetTarget } from "../../lib/story-types.ts";
import type { PlannedImage } from "./request.mts";

export type ImageWork = { target: AssetTarget; note: string | null };

export function targetFromId(id: string): AssetTarget {
  const [kind, entity, detail] = id.split("__");
  if (kind === "ref") return { kind: "reference", entityId: entity!, stateId: null, compositionId: null, layerId: null };
  if (kind === "var") return { kind: "variant", entityId: entity!, stateId: detail!, compositionId: null, layerId: null };
  if (kind === "layer") return { kind: "layer", entityId: null, stateId: null, compositionId: entity!, layerId: detail! };
  throw new Error(`Invalid image dependency ${id}.`);
}

/** Resolve dependencies before spending on any child, including parents selected for regeneration. */
export async function dependencyWave(
  wanted: ImageWork[],
  plan: (target: AssetTarget) => Promise<PlannedImage>,
  eligible: (targetId: string) => Promise<boolean>,
): Promise<{ ready: ImageWork[]; pending: ImageWork[] }> {
  const work = new Map(wanted.map((item) => [assetTargetId(item.target), item]));
  const dependencies = new Map<string, string[]>();
  const visiting = new Set<string>();
  async function visit(item: ImageWork): Promise<void> {
    const id = assetTargetId(item.target);
    if (visiting.has(id)) throw new Error(`Circular image dependency ${id}.`);
    if (dependencies.has(id)) return;
    visiting.add(id);
    const parents: string[] = [];
    for (const candidates of (await plan(item.target)).referenceTargets) {
      let chosen = candidates[0]!;
      for (const candidate of candidates) {
        if (work.has(candidate) || await eligible(candidate)) { chosen = candidate; break; }
      }
      parents.push(chosen);
      if (!work.has(chosen) && !await eligible(chosen)) work.set(chosen, { target: targetFromId(chosen), note: null });
      const parent = work.get(chosen);
      if (parent) await visit(parent);
    }
    visiting.delete(id);
    dependencies.set(id, parents);
  }
  for (const item of wanted) await visit(item);
  const ready: ImageWork[] = [], pending: ImageWork[] = [];
  for (const [id, item] of work) ((dependencies.get(id) ?? []).some((parent) => work.has(parent)) ? pending : ready).push(item);
  return { ready, pending };
}
