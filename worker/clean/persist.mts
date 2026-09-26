import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { buildChunks, canonicalTextOf, chunkDocId } from "../../lib/canonical.ts";
import { bucket, db } from "../config.mts";
import { chaptersOf, countWords, type Chapter, type CleanParagraph } from "./build.mts";

export type CleanSource = {
  sourceId: string;
  canonicalHash: string;
  textHash: string;
  canonicalPath: string;
  paragraphCount: number;
  storyParagraphCount: number;
  wordCount: number;
  chunkCount: number;
  chapters: Chapter[];
};

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Writes the cleaned canonical file, its Firestore chunk mirror and the source
 * document, then points the book at it. Downstream work is addressed by
 * `sourceId` and `canonicalHash`, so nothing built on the raw source is
 * disturbed: it simply stops being the active source.
 */
export async function persistCleanSource(
  bookId: string,
  rawSourceId: string,
  paragraphs: CleanParagraph[],
  provenance: {
    rawCanonicalHash: string;
    cleanVersion: string;
    repairs: number;
    rejected: number;
    dropped: number;
    joined: number;
    refusals: string[];
    damagedParagraphIds: string[];
  },
): Promise<CleanSource> {
  const textHash = sha256Hex(canonicalTextOf(paragraphs));
  const payload = { schemaVersion: 3, bookId, cleanedFrom: rawSourceId, paragraphs };
  const canonicalHash = sha256Hex(JSON.stringify(payload));
  const sourceId = `src_clean_${canonicalHash.slice(0, 16)}`;
  const canonicalPath = `books/${bookId}/sources/${sourceId}/text/${canonicalHash}/canonical.json`;
  await bucket.file(canonicalPath).save(JSON.stringify({ ...payload, sourceId, canonicalHash, textHash }), {
    contentType: "application/json; charset=utf-8",
    metadata: { cacheControl: "private, max-age=31536000, immutable" },
    resumable: false,
  });

  const chunks = buildChunks(paragraphs);
  for (let offset = 0; offset < chunks.length; offset += 300) {
    const batch = db.batch();
    chunks.slice(offset, offset + 300).forEach((chunk, localIndex) => {
      const index = offset + localIndex;
      batch.set(db.doc(`books/${bookId}/textChunks/${chunkDocId(sourceId, canonicalHash, index)}`), {
        sourceId,
        canonicalHash,
        info: {
          index,
          startPage: chunk[0]!.page,
          endPage: chunk.at(-1)!.page,
          seqStart: chunk[0]!.seq,
          seqEnd: chunk.at(-1)!.seq,
        },
        paragraphs: chunk,
      });
    });
    await batch.commit();
  }

  const chapters = chaptersOf(paragraphs);
  const storyParagraphCount = paragraphs.filter((paragraph) => paragraph.isStory).length;
  const wordCount = countWords(paragraphs);
  const characters = paragraphs.reduce((total, paragraph) => total + paragraph.text.length, 0);

  await db.doc(`books/${bookId}/sources/${sourceId}`).set({
    sourceId,
    status: "ready",
    origin: "cleaned",
    cleanedFrom: { sourceId: rawSourceId, canonicalHash: provenance.rawCanonicalHash },
    cleanVersion: provenance.cleanVersion,
    repairs: provenance.repairs,
    rejectedRepairs: provenance.rejected,
    droppedParagraphs: provenance.dropped,
    joinedParagraphs: provenance.joined,
    refusedChanges: provenance.refusals,
    damagedParagraphCount: provenance.damagedParagraphIds.length,
    damagedParagraphIds: provenance.damagedParagraphIds.slice(0, 200),
    canonicalPath,
    canonicalHash,
    textHash,
    paragraphCount: paragraphs.length,
    chunkCount: chunks.length,
    createdAt: FieldValue.serverTimestamp(),
  });

  await db.doc(`books/${bookId}`).update({
    activeSourceId: sourceId,
    canonical: { storagePath: canonicalPath, hash: canonicalHash, textHash },
    structure: { chapters },
    stats: {
      paragraphCount: paragraphs.length,
      storyParagraphCount,
      wordCount,
      tokenEstimate: Math.ceil(characters / 4),
    },
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    sourceId,
    canonicalHash,
    textHash,
    canonicalPath,
    paragraphCount: paragraphs.length,
    storyParagraphCount,
    wordCount,
    chunkCount: chunks.length,
    chapters,
  };
}
