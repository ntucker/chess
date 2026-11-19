/**
 * A lichess study's PGN as move trees: one chapter per PGN game, each move
 * with the positions around it and its comment as plain text.
 */
import type { Chess } from 'chessops/chess';
import { parseComment, parsePgn, startingPosition, type ChildNode, type PgnNodeData } from 'chessops/pgn';
import { parseSan } from 'chessops/san';
import { makeUci, parseUci } from 'chessops/util';

import { recordedMove } from '@/game/replay';
import type { Uci } from '@/lesson/lesson';

import { plainSan } from './text';

export interface Chapter {
  /** The chapter's name, as the study shows it. */
  readonly title: string;
  readonly start: Chess;
  /** The moves from the start; the first is the study's main line. */
  readonly moves: readonly StudyMove[];
}

export interface StudyMove {
  readonly uci: Uci;
  /** The move as the study wrote it, without check marks (see `plainSan`). */
  readonly san: string;
  /** 1 for White's first move, 2 for Black's reply, and so on. */
  readonly ply: number;
  readonly before: Chess;
  readonly after: Chess;
  readonly parent?: StudyMove;
  /** The moves that follow; the first is the study's main continuation. */
  readonly children: readonly StudyMove[];
  /** The study's comment on this move, without drawing commands; empty when none. */
  readonly comment: string;
  /** The study's annotation glyphs as PGN NAG numbers ($14 is 14; ? is 2). */
  readonly nags: readonly number[];
}

/** NAGs that mark a move as a mistake: ?, ??, ?!. */
const DUBIOUS_NAGS = new Set([2, 4, 6]);

export const isDubious = (move: StudyMove) => move.nags.some((nag) => DUBIOUS_NAGS.has(nag));

/** The chapters of `pgn` whose title `include` accepts, in study order. */
export function parseStudy(pgn: string, include: (title: string) => boolean): Chapter[] {
  return parsePgn(pgn).flatMap((game) => {
    const title = game.headers.get('ChapterName') ?? game.headers.get('Event') ?? '';
    if (!include(title)) return [];
    const start = startingPosition(game.headers).unwrap() as Chess;
    return [{ title, start, moves: readMoves(game.moves.children, start, 1) }];
  });
}

function readMoves(
  nodes: readonly ChildNode<PgnNodeData>[],
  before: Chess,
  ply: number,
  parent?: StudyMove,
): StudyMove[] {
  return nodes.map((node) => {
    const uci = sanToUci(before, node.data.san);
    if (!uci) throw new Error(`Illegal move ${node.data.san} at ply ${ply}`);
    const after = played(before, uci);
    const comments = [...(node.data.startingComments ?? []), ...(node.data.comments ?? [])];
    const children: StudyMove[] = [];
    const move: StudyMove = {
      uci,
      san: plainSan(node.data.san),
      ply,
      before,
      after,
      parent,
      children,
      comment: comments
        .map((raw) => parseComment(raw).text.trim())
        .filter(Boolean)
        .join('\n'),
      nags: node.data.nags ?? [],
    };
    children.push(...readMoves(node.children, after, ply + 1, move));
    return move;
  });
}

/** `san` in `pos` as lesson files write it (castling as the king's two-square move), if legal. */
export function sanToUci(pos: Chess, san: string): Uci | undefined {
  const move = parseSan(pos, san);
  return move && recordedMove(pos, makeUci(move));
}

/** A copy of `pos` after the legal move `uci`. */
export function played(pos: Chess, uci: Uci): Chess {
  const after = pos.clone();
  after.play(parseUci(uci)!);
  return after;
}

/** `move` and the study's main continuation after it. */
export function* mainLine(move: StudyMove | undefined): Generator<StudyMove> {
  for (let at = move; at; at = at.children[0]) yield at;
}

/** Every move of `chapter`, each before the moves that follow it. */
export function* chapterMoves(chapter: Chapter): Generator<StudyMove> {
  const stack = [...chapter.moves].reverse();
  for (let move = stack.pop(); move; move = stack.pop()) {
    yield move;
    stack.push(...[...move.children].reverse());
  }
}
