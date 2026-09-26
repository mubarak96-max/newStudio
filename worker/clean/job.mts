import { looksLikeChapterHeading, type ParagraphKind } from "../../lib/canonical.ts";
import { ruleVersions } from "../../lib/rules.ts";
import { asString, nullableString } from "../coerce.mts";
import { db, storyConcurrency, unitMaxCharacters } from "../config.mts";
import type { JobDefinition } from "../job-runner.mts";
import { pool } from "../job-runner.mts";
import { loadParagraphs } from "../persist.mts";
import type { Paragraph } from "../types.mts";
import { buildCleanParagraphs, type CleanedParagraph } from "./build.mts";
import { persistCleanSource } from "./persist.mts";
import { cleanSystemPrompt } from "./prompts.mts";
import { rejoinParagraphs } from "./rejoin.mts";
import { cleanlinessOf, damagedWords, furniturePhrases, isFurniture, judgeCleaned, singleLetterWords } from "./rules.mts";

const kinds = new Set<ParagraphKind>(["body", "heading", "frontmatter", "backmatter", "note", "caption", "break"]);
const maxParagraphsPerCall = 12;
/** Enough refused changes to see a pattern on the source document without bloating it. */
const keptRefusals = 100;

type CleanState = {
  cleaned: Record<string, CleanedParagraph>;
  repairs: number;
  rejected: number;
  /** Individual changes refused inside otherwise accepted paragraphs, as "paragraphId: reason". */
  refusals: string[];
};

function windowsOf(paragraphs: Paragraph[]): Paragraph[][] {
  const windows: Paragraph[][] = [];
  let current: Paragraph[] = [];
  let characters = 0;
  for (const paragraph of paragraphs) {
    if (current.length >= maxParagraphsPerCall || (current.length > 0 && characters + paragraph.text.length > unitMaxCharacters)) {
      windows.push(current);
      current = [];
      characters = 0;
    }
    current.push(paragraph);
    characters += paragraph.text.length;
  }
  if (current.length > 0) windows.push(current);
  return windows;
}

/** What the paragraph becomes when the model is unavailable or its repair is refused. */
function keepRaw(paragraph: Paragraph, furniture: Set<string>): CleanedParagraph {
  const kind = (kinds.has(paragraph.kind as ParagraphKind) ? paragraph.kind : "body") as ParagraphKind;
  return {
    text: paragraph.text,
    kind,
    isStory: paragraph.isStory,
    chapterStart: looksLikeChapterHeading(paragraph.text),
    drop: isFurniture(paragraph, furniture),
    cleanliness: cleanlinessOf(paragraph.text, 0),
  };
}

function readLabels(item: Record<string, unknown>, fallback: CleanedParagraph): Omit<CleanedParagraph, "text" | "cleanliness"> {
  const kind = asString(item.kind) as ParagraphKind;
  return {
    kind: kinds.has(kind) ? kind : fallback.kind,
    isStory: typeof item.isStory === "boolean" ? item.isStory : fallback.isStory,
    chapterStart: typeof item.chapterStart === "boolean" ? item.chapterStart : fallback.chapterStart,
    drop: item.drop === true,
  };
}

/**
 * Repairs scan damage and deletes page furniture, then writes the result as the
 * book's active canonical source.
 *
 * Every repair is checked word by word against the raw paragraph before it is
 * kept (see rules.mts), so a model that rewrites, summarises or writes the
 * wording it remembers from another edition cannot reach the canonical text.
 */
export const cleanJob: JobDefinition<CleanState> = {
  type: "clean",
  version: "clean-v2",
  initialState: () => ({ cleaned: {}, repairs: 0, rejected: 0, refusals: [] }),
  run: async (context, state, checkpoint) => {
    const { bookId, sourceId, canonicalHash } = context;
    const [bookSnapshot, sourceSnapshot] = await Promise.all([
      db.doc(`books/${bookId}`).get(),
      db.doc(`books/${bookId}/sources/${sourceId}`).get(),
    ]);
    const book = bookSnapshot.data() ?? {};
    // Read the job's own source, not the book's active one: after a first clean
    // the book points at the cleaned source, and a rebuild still cleans the raw text.
    const jobSource = sourceSnapshot.data() ?? {};
    const scanned = await loadParagraphs(
      bookId,
      sourceId,
      canonicalHash,
      String(jobSource.canonicalPath ?? ""),
      String(jobSource.textHash ?? ""),
    );
    const title = nullableString(book.metaData?.title) ?? nullableString(book.title) ?? "";
    const author = nullableString(book.metaData?.author) ?? "";
    const furniture = furniturePhrases(scanned, title, author);
    const singleLetters = singleLetterWords(scanned);
    const raw = rejoinParagraphs(scanned, (paragraph) => paragraph.kind === "note" || isFurniture(paragraph, furniture));

    const pending = windowsOf(raw).filter((window) => window.some((paragraph) => !state.cleaned[paragraph.id]));
    let done = raw.length - pending.reduce((total, window) => total + window.length, 0);

    for (let offset = 0; offset < pending.length; offset += storyConcurrency * 4) {
      if (await context.cancelled()) return null;
      const batch = pending.slice(offset, offset + storyConcurrency * 4);
      await pool(batch, storyConcurrency, async (window) => {
        const reply = await context.callModel(
          `clean ${window[0]!.id}-${window.at(-1)!.id}`,
          cleanSystemPrompt,
          { paragraphs: window.map((paragraph) => ({ id: paragraph.id, page: paragraph.page, text: paragraph.text })) },
        );
        const items = Array.isArray(reply?.paragraphs) ? (reply.paragraphs as Record<string, unknown>[]) : [];
        const byId = new Map(items.map((item) => [asString(item.id), item]));
        for (const paragraph of window) {
          const fallback = keepRaw(paragraph, furniture);
          const item = byId.get(paragraph.id);
          if (!item) {
            state.cleaned[paragraph.id] = fallback;
            continue;
          }
          const labels = readLabels(item, fallback);
          // A deletion is honoured only for text this worker also recognises as
          // furniture; the model may not delete the book.
          const drop = labels.drop && isFurniture(paragraph, furniture);
          const verdict = judgeCleaned(paragraph.text, asString(item.text) || paragraph.text, furniture, singleLetters);
          if (!verdict.accepted) {
            state.rejected += 1;
            context.log(`kept raw ${paragraph.id}: ${verdict.reason}`);
            if (state.refusals.length < keptRefusals) state.refusals.push(`${paragraph.id}: ${verdict.reason}`);
            state.cleaned[paragraph.id] = { ...fallback, ...labels, drop };
            continue;
          }
          for (const reason of verdict.refused) {
            context.log(`kept raw words in ${paragraph.id}: ${reason}`);
            if (state.refusals.length < keptRefusals) state.refusals.push(`${paragraph.id}: ${reason}`);
          }
          if (verdict.changedWords > 0 || verdict.removedWords > 0) state.repairs += 1;
          state.cleaned[paragraph.id] = {
            ...labels,
            drop,
            text: verdict.text,
            cleanliness: cleanlinessOf(verdict.text, verdict.changedWords),
          };
        }
        done += window.length;
      });
      await context.onActivity({
        label: "Cleaning scanned text",
        detail: `${state.repairs} paragraphs repaired, ${state.rejected} repairs refused`,
        done,
        total: raw.length,
        unit: "paragraphs",
      });
      await checkpoint("clean");
    }

    const cleaned = new Map(Object.entries(state.cleaned));
    for (const paragraph of raw) {
      if (!cleaned.has(paragraph.id)) cleaned.set(paragraph.id, keepRaw(paragraph, furniture));
    }
    const paragraphs = buildCleanParagraphs(raw, cleaned);
    if (paragraphs.length === 0) throw new Error("Cleaning removed every paragraph; the raw source is unchanged.");
    const dropped = raw.length - paragraphs.length;
    const joined = scanned.length - raw.length;
    // Damage the repairs could not reach is reported, not hidden: every later
    // stage reads these words to the reader.
    const damaged = paragraphs.filter((paragraph) => paragraph.isStory && damagedWords(paragraph.text) > 0);
    const source = await persistCleanSource(bookId, sourceId, paragraphs, {
      rawCanonicalHash: canonicalHash,
      cleanVersion: cleanJob.version,
      repairs: state.repairs,
      rejected: state.rejected,
      dropped,
      joined,
      refusals: state.refusals,
      damagedParagraphIds: damaged.map((paragraph) => paragraph.id),
    });
    await db.doc(`books/${bookId}`).update({ "ruleVersions.cleaning": ruleVersions.cleaning });
    // Understanding must run on the cleaned text, not the source this job read.
    context.chainSource(source.sourceId, source.canonicalHash);
    return (
      `${paragraphs.length} paragraphs (${dropped} furniture removed, ${joined} broken lines rejoined), ` +
      `${state.repairs} repaired, ${state.rejected} refused, ${source.chapters.length} chapters` +
      (damaged.length > 0 ? `; ${damaged.length} story paragraph(s) still show scan damage` : "")
    );
  },
  next: "understand",
};
