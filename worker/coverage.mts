import type { Annotation, CoverageReport, Ledger, Paragraph } from "./types.mts";

export function computeCoverage(ledger: Ledger, paragraphs: Paragraph[]): CoverageReport {
  const story = paragraphs.filter((paragraph) => paragraph.isStory);
  const filtered = new Set(ledger.filteredParagraphIds);
  const report: CoverageReport = {
    storyParagraphs: story.length,
    annotated: 0,
    annotatedByModel: 0,
    stubbed: 0,
    filtered: 0,
    withEvent: 0,
    withEntity: 0,
    withLocation: 0,
    missingAnnotationIds: [],
    ok: false,
  };
  for (const paragraph of story) {
    const annotation = ledger.annotations[paragraph.id];
    if (filtered.has(paragraph.id)) report.filtered += 1;
    if (!annotation) {
      if (!filtered.has(paragraph.id)) report.missingAnnotationIds.push(paragraph.id);
      continue;
    }
    report.annotated += 1;
    if (annotation.stub) report.stubbed += 1;
    else report.annotatedByModel += 1;
    if (annotation.eventIds.length > 0) report.withEvent += 1;
    if (
      annotation.presentEntityIds.length +
        annotation.mentionedEntityIds.length +
        annotation.speakerEntityIds.length >
      0
    )
      report.withEntity += 1;
    if (annotation.locationId) report.withLocation += 1;
  }
  report.ok = report.missingAnnotationIds.length === 0;
  return report;
}

function firstSentence(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  const match = compact.match(/^.{20,240}?[.!?](?=\s|$)/);
  return (match?.[0] ?? compact.slice(0, 200)).trim();
}

/**
 * Last resort after repair rounds: a story paragraph still without an
 * annotation gets a deterministic one built from its own text and the mention
 * scan, flagged `stub` so review can find it. Every story paragraph therefore
 * has an annotation record, and the coverage report says how many are real.
 */
export function stubMissingAnnotations(ledger: Ledger, paragraphs: Paragraph[]): number {
  const mentionedIn = new Map<string, string[]>();
  for (const entity of ledger.entities) {
    for (const mention of entity.mentions) {
      const list = mentionedIn.get(mention.paragraphId) ?? [];
      list.push(entity.entityId);
      mentionedIn.set(mention.paragraphId, list);
    }
  }
  let written = 0;
  let previous: Annotation | null = null;
  for (const paragraph of paragraphs) {
    if (!paragraph.isStory) continue;
    const existing = ledger.annotations[paragraph.id];
    if (existing) {
      previous = existing;
      continue;
    }
    const text = paragraph.text.trim();
    const annotation: Annotation = {
      paragraphId: paragraph.id,
      seq: paragraph.seq,
      chapterId: paragraph.chapterId,
      summary: firstSentence(text),
      mode: /^["“‘']/.test(text) ? "dialogue" : "narration",
      presentEntityIds: [],
      mentionedEntityIds: mentionedIn.get(paragraph.id) ?? [],
      speakerEntityIds: [],
      locationId: previous?.locationId ?? null,
      timeMarker: null,
      mood: "",
      visualCue: "",
      eventIds: ledger.events
        .filter((event) => event.paragraphIds.includes(paragraph.id))
        .map((event) => event.eventId),
      stub: true,
    };
    ledger.annotations[paragraph.id] = annotation;
    previous = annotation;
    written += 1;
  }
  return written;
}
