/**
 * What a commentary note may be. The reader reads every word of the book, so a
 * note earns its place only by explaining what the words leave unclear. Notes
 * that talk about the text ("the narrator is describing…"), interpret it
 * ("reflecting her disturbed mental state"), retell it, or re-introduce a
 * character the reader met long ago are kept for review but never shown.
 */

/** Talk about the book instead of the story. */
const aboutTheText =
  /\bnarrator'?s?\b|\b(?:the|this) (?:text|passage|paragraph|excerpt|book|story|author|writer)\b|\b(?:described|depicted|portrayed|characterized|characterised) as\b|\b(?:fragmented|garbled) (?:text|wording)\b|\b(?:ocr|misprint|typo)\b/i;

/** Literary analysis: the reader came for the story, not a study guide. */
const interpretation =
  /\b(?:suggest(?:s|ing)?|reflect(?:s|ing)?|highlight(?:s|ing)?|symboli[sz](?:e|es|ing|m)|emphasi[sz](?:e|es|ing)|underscor(?:e|es|ing)|foreshadow(?:s|ing)?|theme|motif)\b/i;

const commonWords = new Set([
  "that", "this", "with", "from", "have", "were", "when", "what", "which", "there", "their", "they", "them", "then",
  "than", "into", "about", "would", "could", "should", "been", "being", "very", "just", "only", "also", "some", "more",
  "most", "over", "such", "much", "does", "here", "where", "while", "after", "before", "because", "still", "even",
]);

/** Share of a note's content words the cited paragraphs already say. */
function retoldShare(text: string, cited: string): number {
  const words = Array.from(new Set(text.toLowerCase().match(/\p{L}{4,}/gu) ?? [])).filter((word) => !commonWords.has(word));
  if (words.length < 3) return 0;
  const source = cited.toLowerCase();
  // A five-letter stem lets "garden's" match "garden" and "pretending" match "pretend".
  return words.filter((word) => source.includes(word.slice(0, 5))).length / words.length;
}

export type NoteCheck = {
  text: string;
  kind: "scene" | "context" | "clarify";
  /** The text of the paragraphs the note cites. */
  citedText: string;
  /** Name patterns of entities the reader meets for the first time in this Moment. */
  newEntityNames: RegExp[];
};

/** Reasons a note must not reach the reader; empty when it may. */
export function commentaryIssues(note: NoteCheck): string[] {
  const issues: string[] = [];
  if (aboutTheText.test(note.text)) issues.push("Talks about the text instead of the story.");
  if (interpretation.test(note.text)) issues.push("Interprets the story instead of explaining it.");
  if (note.kind === "context" && !note.newEntityNames.some((pattern) => pattern.test(note.text))) {
    issues.push("Introduces no one the reader meets here for the first time.");
  }
  if (retoldShare(note.text, note.citedText) >= 0.6) issues.push("Retells words the reader is already reading.");
  return issues;
}
