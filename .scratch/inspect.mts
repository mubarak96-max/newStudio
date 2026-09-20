import { db, bucket } from "../worker/config.mts";

const bookId = process.argv[2]!;
const book = (await db.doc(`books/${bookId}`).get()).data()!;
const ledger = (await db.doc(`books/${bookId}/derived/ledger`).get()).data() ?? {};
const entities = (await db.collection(`books/${bookId}/entities`).get()).docs.map((d) => d.data());
const events = (await db.collection(`books/${bookId}/events`).get()).docs.map((d) => d.data());
const chunks = (await db.collection(`books/${bookId}/annotationChunks`).get()).docs.map((d) => d.data());
const annotations = chunks.flatMap((c: any) => c.annotations).sort((a: any, b: any) => a.seq - b.seq);
const [buf] = await bucket.file(book.canonical.storagePath).download();
const paragraphs = JSON.parse(buf.toString("utf8")).paragraphs as any[];
const story = paragraphs.filter((p) => p.isStory);

console.log("=== COVERAGE ===");
console.log(JSON.stringify(ledger.coverage, null, 1));
console.log("=== DIAGNOSTICS ===");
console.log(JSON.stringify(ledger.diagnostics, null, 1));
console.log("=== WORLD ===");
console.log(JSON.stringify(ledger.world, null, 1));
console.log(`\n=== TOTALS === entities ${entities.length} | events ${events.length} | annotations ${annotations.length}/${story.length} story paras | scenes ${(ledger.sceneRanges ?? []).length} | chapters ${(ledger.chapterSummaries ?? []).length}`);

const byType: Record<string, number> = {};
for (const e of entities) byType[e.type] = (byType[e.type] ?? 0) + 1;
const byImp: Record<string, number> = {};
for (const e of entities) byImp[e.importance] = (byImp[e.importance] ?? 0) + 1;
console.log("types", JSON.stringify(byType), "importance", JSON.stringify(byImp));

console.log("\n=== ENTITIES (by mentions) ===");
for (const e of [...entities].sort((a, b) => b.mentionCount - a.mentionCount)) {
  console.log(
    `${String(e.mentionCount).padStart(4)}m ${e.type.padEnd(9)} ${e.importance.padEnd(10)} ${e.entityId.padEnd(26)} ${e.canonicalName} | aliases=[${e.aliases.map((a: any) => a.name).join("|")}] facts=${e.facts.length} states=${e.states.length} reveals=${e.reveals.length} rels=${e.relationships.length} seq=${e.firstSeq}-${e.lastSeq}${e.parentLocationId ? ` in=${e.parentLocationId}` : ""}`,
  );
}

console.log("\n=== SAMPLE PROFILES ===");
for (const e of [...entities].sort((a, b) => b.mentionCount - a.mentionCount).slice(0, 5)) {
  console.log(`--- ${e.canonicalName} (${e.type})`);
  console.log(`  role: ${e.profile?.role}`);
  console.log(`  desc: ${e.profile?.description}`);
  console.log(`  appearance: ${e.profile?.appearance}`);
  console.log(`  arc: ${e.profile?.arc}`);
  console.log(`  facts: ${e.facts.slice(0, 8).map((f: any) => `${f.key}=${f.value}${f.verified ? "" : "[UNVERIFIED]"}`).join(" | ")}`);
}

console.log("\n=== EVENTS ===");
for (const ev of [...events].sort((a, b) => a.order - b.order)) {
  console.log(
    `${String(ev.order).padStart(3)} so=${String(ev.storyOrder).padStart(3)}${ev.isFlashback ? "F" : " "} seq=${ev.seqStart}-${ev.seqEnd} [${ev.kind}] loc=${ev.locationId ?? "-"} p=[${ev.participants.join(",")}] ${ev.verified ? "" : "UNVERIFIED "}:: ${ev.summary.slice(0, 120)}`,
  );
}

console.log("\n=== CHAPTER SUMMARIES ===");
for (const c of ledger.chapterSummaries ?? []) {
  console.log(`--- ${c.title} (seq ${c.seqStart}-${c.seqEnd})`);
  console.log(`  ${c.summary}`);
}

console.log("\n=== ANNOTATION SAMPLE (every 25th) ===");
for (const a of annotations.filter((_: any, i: number) => i % 25 === 0)) {
  console.log(
    `[${a.paragraphId} seq=${a.seq}]${a.stub ? " STUB" : ""} ${a.mode} loc=${a.locationId ?? "-"} time=${a.timeMarker ?? "-"} mood=${a.mood}\n   sum: ${a.summary}\n   vis: ${a.visualCue}\n   present=[${a.presentEntityIds.join(",")}] speakers=[${a.speakerEntityIds.join(",")}] events=[${a.eventIds.join(",")}]`,
  );
}

const stubs = annotations.filter((a: any) => a.stub);
console.log(`\n=== STUBS (${stubs.length}) ===`);
for (const a of stubs.slice(0, 20)) console.log(`  ${a.paragraphId} seq=${a.seq} :: ${a.summary.slice(0, 100)}`);

console.log("\n=== SCENES ===");
for (const s of (ledger.sceneRanges ?? []).slice(0, 40)) {
  console.log(`  ${s.sceneId} ch=${s.chapterId} seq=${s.seqStart}-${s.seqEnd} loc=${s.locationId ?? "-"} entities=[${s.entityIds.join(",")}] :: ${s.summary.slice(0, 80)}`);
}

const noEvent = annotations.filter((a: any) => a.eventIds.length === 0).length;
const noEntity = annotations.filter((a: any) => a.presentEntityIds.length + a.mentionedEntityIds.length + a.speakerEntityIds.length === 0).length;
console.log(`\nannotations without event: ${noEvent} | without any entity: ${noEntity}`);
process.exit(0);
