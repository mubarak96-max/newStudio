import { prepareImage } from "../worker/images/assets.mts";
const target = { kind: "variant" as const, entityId: "con_animal_farm", stateId: "st_name_change", compositionId: null, layerId: null };
try {
  const prepared = await prepareImage("xL5OYox7MFdsTHeXrZ4s", target, null);
  console.log("ok", prepared.references.length, "reference(s)", prepared.pinned);
} catch (error) {
  const e = error as Error & { cause?: unknown };
  console.log("error", e.message, "| cause:", e.cause instanceof Error ? `${e.cause.name}: ${e.cause.message} ${(e.cause as { code?: string }).code ?? ""}` : String(e.cause));
}
process.exit(0);
