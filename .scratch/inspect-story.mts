import { bucket, db } from "../worker/config.mts";
import { validateTiling } from "../worker/story/ranges.mts";

const bookId = process.argv[2]!;
const book = (await db.doc(`books/${bookId}`).get()).data()!;
const [buf] = await bucket.file(book.canonical.storagePath).download();
const paragraphs = JSON.parse(buf.toString("utf8")).paragraphs as { id: string; seq: number; text: string; isStory: boolean }[];
const map = (await db.doc(`books/${bookId}/derived/storyMap`).get()).data()!;
const episodes = (await db.collection(`books/${bookId}/episodes`).orderBy("order").get()).docs.map((d) => d.data());
const names = new Map((await db.collection(`books/${bookId}/entities`).get()).docs.map((d) => [d.id, d.data().canonicalName]));
const name = (id: string | null) => (id ? (names.get(id) ?? id) : "?");

console.log("=== STORY MAP ===", map.planning);
for (const act of map.acts) console.log(`ACT ${act.order} ${act.title} seq ${act.seqStart}-${act.seqEnd} events=${act.eventIds.length}\n   ${act.summary}`);
for (const arc of map.arcs) console.log(`ARC ${arc.title} [${arc.entityIds.map(name).join(", ")}] events=${arc.eventIds.length}\n   ${arc.summary}`);
console.log("episode tiling", validateTiling(episodes as any, 0, paragraphs.length - 1).ok);

let moments = 0, selections = 0, dialogue = 0, attributed = 0, commentary = 0, unverified = 0, fallback = 0;
for (const ep of episodes) {
  console.log(`\n=== ${ep.episodeId} "${ep.title}" seq ${ep.seqStart}-${ep.seqEnd} ${ep.wordCount}w moments=${ep.momentCount} ${ep.stageStatus.moments}`);
  console.log(`  ${ep.summary}\n  opening: ${ep.storyPlan?.openingState}\n  ending: ${ep.storyPlan?.endingState}\n  reveals: ${ep.storyPlan?.revealProgression.join(" | ")}`);
  if (ep.warnings.length) console.log("  WARN", ep.warnings);
  const ms = (await db.collection(`books/${bookId}/episodes/${ep.episodeId}/moments`).orderBy("order").get()).docs.map((d) => d.data());
  console.log("  moment tiling", validateTiling(ms as any, ep.seqStart, ep.seqEnd).ok);
  for (const m of ms) {
    moments += 1;
    selections += m.exactTextSelections.length;
    dialogue += m.dialogue.length;
    attributed += m.dialogue.filter((d: any) => d.speakerEntityId).length;
    commentary += m.commentary.length;
    unverified += m.commentary.filter((c: any) => !c.verified).length;
    if (m.status === "fallback") fallback += 1;
    for (const s of m.exactTextSelections) {
      const p = paragraphs.find((x) => x.id === s.paragraphId)!;
      if (p.text.slice(s.start, s.end) !== s.text) console.log("  !! selection offset mismatch", m.momentId);
    }
    console.log(`  - ${m.momentId} "${m.title}" seq ${m.seqStart}-${m.seqEnd} ${m.wordCount}w loc=${name(m.locationId)} chars=[${m.characters.map((c: any) => name(c.entityId)).join(",")}] sel=${m.exactTextSelections.length} dlg=${m.dialogue.length} com=${m.commentary.length} shots=${m.visualPlan.shots.length} ${m.status}`);
  }
}
const sample = (await db.collection(`books/${bookId}/episodes/${episodes[1]?.episodeId}/moments`).orderBy("order").limit(2).get()).docs.map((d) => d.data());
for (const m of sample) {
  console.log(`\n=== SAMPLE ${m.momentId} ===\nsummary: ${m.summary}\nstart: ${m.startState}\nend: ${m.endState}`);
  for (const s of m.exactTextSelections) console.log(`  SEL [${s.paragraphId}] ${s.text}`);
  for (const d of m.dialogue.slice(0, 8)) console.log(`  DLG ${name(d.speakerEntityId)} -> ${d.addresseeEntityId ? name(d.addresseeEntityId) : "-"}: ${d.text.slice(0, 100)}`);
  for (const c of m.commentary) console.log(`  COM ${c.kind} ${c.verified ? "" : "UNVERIFIED " + c.issues.join(" ")}: ${c.text} [${c.groundedIn.join(",")}]`);
  for (const s of m.visualPlan.shots) console.log(`  SHOT ${s.framing}/${s.timeOfDay}/${s.mood}: ${s.description} [${s.entityStates.map((e: any) => name(e.entityId)).join(",")}] key=${s.reuseKey}`);
  for (const i of m.inspectableEntities) console.log(`  INSPECT ${name(i.entityId)}: ${i.reason}`);
}
console.log(`\nTOTAL moments ${moments} selections ${selections} dialogue ${dialogue} (attributed ${attributed}) commentary ${commentary} (unverified ${unverified}) fallback ${fallback}`);
process.exit(0);
