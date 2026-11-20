import { SAN } from '@/game/replay';

import { chapterMoves, type Chapter, type StudyMove } from './study';

/** A move a name writes ("4.g4", "...Bf5", "5...Nh5"): its number, whether it is Black's, and its SAN. */
const NAMED_MOVE = new RegExp(
  String.raw`(?<![\w.])(?:(\d+)\s?\.(\.\.)?\s?|(\.\.\.))?(${SAN})`,
  'g',
);

/**
 * `chapter` with what its variation's `name` says about where it starts: a
 * chapter named after a move its main line plays ("Early ...Bf5", "Tal
 * Variation (4.h4)") names no position before that move (`namedFrom`), and a
 * move it plays only on a side line leaving before then ("Bayonet Attack
 * (4.g4)" in a 4.h4 chapter, or 2...c6 3.e3 Qb6 4.b3 Bf5 in an Early ...Bf5
 * one) starts a line it claims (`claims`). A chapter already cut out at a
 * named position keeps its own start. A named move is found by its SAN and
 * side, at its number where the name gives one; study numbers are often off,
 * so moves at other numbers count when none is at the right one.
 */
export function withTitleMoves(chapter: Chapter, name: string): Chapter {
  if (chapter.namedFrom) return chapter;
  const main = new Set<StudyMove>();
  for (let move = chapter.moves[0]; move; move = move.children[0]) main.add(move);
  const moves = [...chapterMoves(chapter)];
  /** The last named move, where the next can be its reply. */
  let last: { at: number; ply: number; moves: StudyMove[] } | undefined;
  const found = [...name.matchAll(NAMED_MOVE)].flatMap((match) => {
    const [text, number, numberedBlack, black, san] = match;
    // A bare move right after a numbered one is its reply ("3.Nc3 d4" is 3...d4).
    const reply =
      !number && !black && last && /^\s+$/.test(name.slice(last.at, match.index))
        ? last
        : undefined;
    const ply = number ? 2 * Number(number) - (numberedBlack ? 0 : 1) : reply && reply.ply + 1;
    const side = black ? 1 : ply !== undefined ? (ply + 1) % 2 : undefined;
    const fits = moves.filter(
      (move) =>
        move.san === san.replace(/[+#]$/, '') &&
        (side === undefined || (move.ply + 1) % 2 === side) &&
        (!reply || reply.moves.includes(move.parent!)),
    );
    const atPly = fits.filter((move) => move.ply === ply);
    const named = atPly.length > 0 ? atPly : fits;
    last = ply !== undefined ? { at: match.index + text.length, ply, moves: named } : undefined;
    return named;
  });
  const onMain = found.filter((move) => main.has(move));
  const namedFrom = onMain.length > 0 ? Math.min(...onMain.map(({ ply }) => ply)) : undefined;
  // A side line leaving after the named position, or after another named move, is the chapter's already.
  const claims = found.filter((move) => {
    if (main.has(move)) return false;
    for (let at = move.parent; at; at = at.parent) {
      if (found.includes(at)) return false;
      if (main.has(at)) return namedFrom === undefined || at.ply < namedFrom;
    }
    return true;
  });
  if (namedFrom === undefined && claims.length === 0) return chapter;
  return {
    ...chapter,
    ...(namedFrom && { namedFrom }),
    ...(claims.length > 0 && { claims }),
  };
}
