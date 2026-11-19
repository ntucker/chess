/**
 * What the lesson draws on the board: guidance's choices (./guidance.ts) as
 * the board's shapes (src/board/drawing.ts). First cut, from the thin
 * lesson slice: candidate moves and Purpose ideas. Piece D adds every other
 * idea type here.
 */
import type { Drawing } from "@/board/drawing";

import type { Idea, PositionKey } from "./lesson";
import type { Candidate } from "./select";
import type { Guidance } from "./guidance";

/**
 * The board's drawings for `guidance` while the board shows `shown`. A
 * previewed move is drawn with its ideas: a sliding preview leaves a ghost
 * where its piece stood. Otherwise the candidates are drawn alone, since
 * their arrows and an idea's would share the board's colors, and the ideas
 * only where there are no candidates. Ideas are drawn only on the position
 * they are about.
 */
export function lessonDrawings(
  guidance: Guidance,
  shown: PositionKey,
): Drawing[] {
  const { preview, candidates } = guidance;
  const ideas = guidance.ideas
    .filter(({ at }) => at === shown)
    .flatMap(({ idea }) => ideaDrawings(idea));
  if (preview?.slide) return [ghost(preview.candidate), ...ideas];
  if (preview) return [...candidateDrawings([preview.candidate]), ...ideas];
  return candidates.length ? candidateDrawings(candidates) : ideas;
}

/** The candidate to look at first: the book move, or else the most played. */
export const mainCandidate = (
  candidates: readonly Candidate[],
): Candidate | undefined =>
  candidates.find(({ move }) => move.book) ?? candidates[0];

/**
 * Each candidate's piece lit, with an arrow to where it goes: the main one
 * (`mainCandidate`) in the main tone, the rest as alternatives.
 */
export function candidateDrawings(candidates: readonly Candidate[]): Drawing[] {
  const main = mainCandidate(candidates);
  // The main move last, so its glow wins where two candidates move one piece.
  const ordered = [
    ...candidates.filter((c) => c !== main),
    ...(main ? [main] : []),
  ];
  return ordered.flatMap(({ from, to }, n): Drawing[] => {
    const tone = n === ordered.length - 1 ? "main" : "other";
    return [
      { kind: "glow", square: from, tone },
      { kind: "arrow", from, to, tone },
    ];
  });
}

/** What one idea draws. Only Purpose so far: the piece lit, an arrow to each target, each target ringed. */
export function ideaDrawings(idea: Idea): Drawing[] {
  if (idea.type !== "purpose") return [];
  return [
    { kind: "glow", square: idea.from, tone: "main" },
    ...idea.targets.flatMap((target): Drawing[] => [
      { kind: "arrow", from: idea.from, to: target, tone: "main" },
      { kind: "ring", square: target, tone: "target" },
    ]),
  ];
}

const ghost = ({ from, piece: { role, color } }: Candidate): Drawing => ({
  kind: "ghost",
  square: from,
  piece: { role, color },
});
