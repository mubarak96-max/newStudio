import { bucket, db } from "../worker/config.mts";

const bookId = process.argv[2]!;
const book = (await db.doc(`books/${bookId}`).get()).data()!;
const [buf] = await bucket.file(book.canonical.storagePath).download();
const paragraphs = new Map((JSON.parse(buf.toString("utf8")).paragraphs as { id: string; text: string }[]).map((p) => [p.id, p.text]));
const episodes = (await db.collection(`books/${bookId}/episodes`).orderBy("order").get()).docs.map((d) => d.data());

let beats = 0, offsetErrors = 0, uncovered = 0, fallback = 0, paras = 0, shown = 0, words = 0, broken = 0;
const types: Record<string, number> = {};
const moves: Record<string, number> = {};
const all: any[] = [];
for (const ep of episodes) {
  const moments = (await db.collection(`books/${bookId}/episodes/${ep.episodeId}/moments`).orderBy("order").get()).docs.map((d) => d.data());
  for (const m of moments) {
    const covered = new Set(m.readingBeats.flatMap((b: any) => b.representations.map((r: any) => r.paragraphId)));
    uncovered += m.sourceParagraphIds.filter((id: string) => !covered.has(id)).length;
    fallback += m.beatCoverage?.representedByFallback.length ?? 0;
    paras += m.sourceParagraphIds.length;
    shown += m.beatCoverage?.wordsShownVerbatim ?? 0;
    words += m.wordCount;
    for (const b of m.readingBeats) {
      beats += 1;
      all.push(b);
      types[b.type] = (types[b.type] ?? 0) + 1;
      moves[b.camera.move] = (moves[b.camera.move] ?? 0) + 1;
      const q = b.text.quote;
      if (q && paragraphs.get(q.paragraphId)!.slice(q.start, q.end) !== q.text) offsetErrors += 1;
      for (const d of b.text.dialogue ?? []) if (paragraphs.get(d.paragraphId)!.slice(d.start, d.end) !== d.text) offsetErrors += 1;
    }
  }
}
for (let i = 0; i < all.length; i += 1) {
  if (all[i].previousBeatId !== (all[i - 1]?.id ?? null) || all[i].nextBeatId !== (all[i + 1]?.id ?? null)) broken += 1;
}
console.log(`BEATS ${beats} types ${JSON.stringify(types)} moves ${JSON.stringify(moves)}`);
console.log(`paragraphs ${paras} uncovered ${uncovered} fallback-attached ${fallback} | words shown verbatim ${shown}/${words} | offset errors ${offsetErrors} | broken links ${broken}`);
for (const b of all.slice(10, 16)) {
  console.log(`\n-- ${b.id} ${b.type} ${b.camera.move}${b.camera.focusEntityId ? "@" + b.camera.focusEntityId : ""} ${b.transitionIn.type} comp=${b.compositionId}`);
  if (b.text.quote) console.log(`   Q: ${b.text.quote.text}`);
  for (const d of b.text.dialogue ?? []) console.log(`   D ${d.speakerDisplayName}: ${d.text}`);
  for (const c of b.text.commentary ?? []) console.log(`   C: ${c.text}`);
  console.log(`   cam: ${b.camera.rationale}`);
  for (const r of b.representations) console.log(`   R ${r.paragraphId} ${r.modality}: ${r.description}`);
}

const plan = (await db.doc(`books/${bookId}/derived/visualPlan`).get()).data();
if (plan) {
  console.log("\n=== VISUAL PROFILE ===", JSON.stringify(plan.visualProfile, null, 1));
  console.log("FORECAST", JSON.stringify(plan.forecast));
  const ents = (await db.collection(`books/${bookId}/entities`).get()).docs.map((d) => d.data()).filter((e) => e.visual?.spec);
  console.log(`entities with visual spec: ${ents.length}`);
  for (const e of ents.slice(0, 4)) {
    console.log(`\n-- ${e.canonicalName} (${e.type}) spec: ${e.visual.spec}`);
    console.log(`   facts: ${e.visual.sourceFacts.map((f: any) => `${f.key}=${f.value}`).join(" | ")}`);
    console.log(`   fills: ${(e.fills ?? []).map((f: any) => `${f.key}=${f.value} (${f.reason})`).join(" | ")}`);
    console.log(`   variants: ${Object.values(e.visual.stateVariants).map((v: any) => `${v.label}: ${v.spec}`).join(" | ")}`);
    if (e.visual.layout) console.log(`   layout: ${e.visual.layout}`);
  }
  const comps = (await db.collection(`books/${bookId}/compositions`).get()).docs.map((d) => d.data());
  const top = comps.sort((a, b) => b.usedIn.length - a.usedIn.length)[0];
  console.log(`\ncompositions ${comps.length}; most reused (${top.usedIn.length} beats):\n${top.prompt}\nLAYERS: ${top.layers.map((l: any) => l.layerId).join(", ")}`);
}
process.exit(0);
