/**
 * The comments the model converts, each with the facts about its position
 * that the model needs to draw only what is true there.
 */
import { createHash } from 'node:crypto';

import type { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import { SquareSet } from 'chessops/squareSet';
import { COLORS, ROLES, type Color } from 'chessops/types';
import { makeSquare, roleToChar } from 'chessops/util';

import { numberedLine } from '@/game/replay';
import type { Idea } from '@/lesson/lesson';

import type { ChapterNotes, MoveNote } from '../extract';
import type { StudyMove } from '../study';
import { SAN } from '../text';

/** One comment as the model reads it. */
export interface Comment {
  /** Stable across imports and chapters: the same comment on the same move is converted once. */
  readonly id: string;
  readonly line: string;
  readonly move: string;
  readonly moved: Color;
  readonly toMove: Color;
  readonly check: boolean;
  readonly fenBefore: string;
  readonly fenAfter: string;
  readonly piecesAfter: Readonly<Record<Color, string>>;
  readonly legalAfter: readonly string[];
  readonly next: readonly string[];
  /** The study's words, with a fragment that starts with "..." joined to the comment before it. */
  readonly comment: string;
  readonly previousComment: string;
  readonly chapterSummary?: true;
  /** Ideas the importer already read from this comment without AI. */
  readonly extracted: readonly Idea[];
}

/** A comment continuing the one before it ("...and the position stays level"), not a move like "...Nd7". */
const FRAGMENT = new RegExp(String.raw`^\.\.\.(?!\s*${SAN})`);

/** The comment behind `moveNote`, or undefined for a note with no comment (an evaluation glyph alone). */
export function noteComment(moveNote: MoveNote, chapter: ChapterNotes): Comment | undefined {
  const { move, source, note } = moveNote;
  if (!source.comment) return undefined;
  // extract.ts moves a chapter's summary comment to where its main line ends, so the
  // note sits on another move than its comment; the comment before it is from elsewhere.
  const summary = move !== source;
  const previous = summary ? '' : previousComment(source);
  const fragment = FRAGMENT.test(source.comment) && previous;
  const comment = fragment ? `${previous} ${source.comment}` : source.comment;
  const extracted = [
    ...(note.ideas ?? []),
    ...chapter.positionNotes
      .filter((other) => other.source === source)
      .flatMap((other) => other.note.ideas ?? []),
  ];
  const fenBefore = makeFen(move.before.toSetup());
  return {
    id: hash(`${fenBefore} ${move.uci} ${summary} ${comment}`),
    line: lineTo(move),
    move: move.san,
    moved: move.before.turn,
    toMove: move.after.turn,
    check: move.after.isCheck(),
    fenBefore,
    fenAfter: makeFen(move.after.toSetup()),
    piecesAfter: pieces(move.after),
    legalAfter: legalMoves(move.after),
    next: move.children.map((child) => child.san),
    comment,
    previousComment: fragment ? '' : previous,
    ...(summary && { chapterSummary: true as const }),
    extracted,
  };
}

const hash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);

/** The nearest earlier comment on `move`'s line. */
function previousComment(move: StudyMove): string {
  for (let at = move.parent; at; at = at.parent) if (at.comment) return at.comment;
  return '';
}

/** The moves up to `move`, numbered: `1.e4 c6 2.d4`. */
function lineTo(move: StudyMove): string {
  const moves: StudyMove[] = [];
  for (let at: StudyMove | undefined = move; at; at = at.parent) moves.unshift(at);
  return numberedLine(
    moves.map((at) => at.san),
    moves[0].ply,
  );
}

/** Each side's pieces by square, like `Ke1 Qd1 Pe4`. */
function pieces(pos: Chess): Record<Color, string> {
  const list = (color: Color) =>
    ROLES.toReversed()
      .flatMap((role) =>
        [...pos.board.pieces(color, role)].map(
          (sq) => `${roleToChar(role).toUpperCase()}${makeSquare(sq)}`,
        ),
      )
      .join(' ');
  return Object.fromEntries(COLORS.map((color) => [color, list(color)])) as Record<Color, string>;
}

/** Every legal move in `pos`, in SAN. */
function legalMoves(pos: Chess): string[] {
  const sans = new Set<string>();
  for (const [from, dests] of pos.allDests()) {
    for (const to of dests) {
      const promotes = pos.board.pawn.has(from) && SquareSet.backranks().has(to);
      sans.add(makeSan(pos, { from, to, ...(promotes && { promotion: 'queen' as const }) }));
    }
  }
  return [...sans];
}
