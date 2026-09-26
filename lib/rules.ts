/**
 * The version of every rule set that decides what a book becomes.
 *
 * A prompt or a check changed after a book was built is invisible otherwise:
 * the narrator rule landed the day after both production books were processed,
 * and nothing said they had been built without it. Each stage records the
 * version it ran under; Studio compares and marks the book, and nothing is
 * ever re-run on its own — that stays the owner's call.
 */

export const ruleVersions = {
  /** Line rejoining, per-change scan repair, page furniture, section breaks. */
  cleaning: 'clean-v2',
  /** Narrator, author, place types, duplicates, grounding. */
  bookModel: 'integrity-v2',
  /** Chapter-aligned episodes, every word read as Beat text, commentary that only explains. */
  story: 'story-rules-v3',
  /** Shot location, cast agreement, shot grammar. */
  shots: 'shot-rules-v2',
  /** Written image prompts and the contract they must satisfy. */
  prompts: 'prompt-author-v2',
  /** Master-first compositions and the layers derived from them. */
  composition: 'master-first-v2',
  /** Automatic checks on generated images. */
  imageChecks: 'image-checks-v2',
  /** The public package contract. */
  publication: 'manifest-v3',
} as const;

export type RuleStage = keyof typeof ruleVersions;

export type BookRuleVersions = Partial<Record<RuleStage, string>>;

/** Stages whose rules have moved on since this book was built. */
export function staleRuleStages(recorded: BookRuleVersions | undefined): RuleStage[] {
  const stages = Object.keys(ruleVersions) as RuleStage[];
  return stages.filter((stage) => recorded?.[stage] && recorded[stage] !== ruleVersions[stage]);
}

/** Stages this book has never run under any recorded rules. */
export function unrecordedRuleStages(recorded: BookRuleVersions | undefined): RuleStage[] {
  const stages = Object.keys(ruleVersions) as RuleStage[];
  return stages.filter((stage) => !recorded?.[stage]);
}
