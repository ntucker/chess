/**
 * A lichess study's PGN as move trees: one chapter per PGN game, each move
 * with the positions around it and its comment as plain text.
 */
import type { Chess } from 'chessops/chess';
import {
  parseComment,
  parsePgn,
  startingPosition,
  type ChildNode,
  type PgnNodeData,
} from 'chessops/pgn';
import { parseUci } from 'chessops/util';

import { positionKey, sanToUci } from '@/game/replay';
import type { Uci } from '@/lesson/lesson';

import { plainSan } from './text';

export interface Chapter {
  /** The chapter's name, as the study shows it. */
  readonly title: string;
  readonly start: Chess;
  /** The moves from the start; the first is the study's main line. */
  readonly moves: readonly StudyMove[];
  /**
   * The lesson source it comes from, as its index in the lesson's sources (0
   * when left out): where sources overlap, the earlier one's moves win.
   */
  readonly source?: number;
  /**
   * The ply of the move into the position the chapter's name starts at: its
   * name covers only the positions from there on. Before it, the chapter's
   * main line is its parent variation's (`withTitleMoves`: "Early ...Bf5" is
   * the London System until ...Bf5), or other chapters' when `cut`.
   */
  readonly namedFrom?: number;
  /**
   * Whether the chapter was cut out of a longer line at `namedFrom` (a
   * Wikibooks page's): the moves before belong to the chapters it was cut from.
   */
  readonly cut?: boolean;
  /**
   * Moves the chapter's name gives that it plays only on a side line ("Bayonet
   * Attack (4.g4)"): the lines from them are the chapter's own, like its main
   * line, where no main line goes (`withTitleMoves`).
   */
  readonly claims?: readonly StudyMove[];
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

/**
 * The chapters of `pgn` whose title `include` accepts, in study order. A
 * chapter set up from a position an earlier chapter's moves reach (studies
 * that go on where the last chapter stopped) starts where that one does,
 * through those moves, which keep no comment: the earlier chapter says it.
 */
export function parseStudy(pgn: string, include: (title: string) => boolean): Chapter[] {
  const chapters: Chapter[] = [];
  for (const game of parsePgn(pgn)) {
    const title = game.headers.get('ChapterName') ?? game.headers.get('Event') ?? '';
    if (!include(title)) continue;
    const start = startingPosition(game.headers).unwrap() as Chess;
    const namedFrom = Number(game.headers.get('NamedFrom')) || undefined;
    const lead = leadTo(chapters, start);
    if (!lead) {
      const moves = readMoves(game.moves.children, start, 1);
      chapters.push({ title, start, moves, ...(namedFrom && { namedFrom, cut: true }) });
      continue;
    }
    const first = copyLead(lead, (last) =>
      readMoves(game.moves.children, last.after, last.ply + 1, last),
    );
    chapters.push({ title, start: chapters[0].start, moves: [first] });
  }
  return chapters;
}

/** Copies of `lead` without comments (a dubious move stays dubious), the last followed by the moves `rest` reads after it. */
function copyLead(
  lead: readonly StudyMove[],
  rest: (last: StudyMove) => StudyMove[],
  parent?: StudyMove,
): StudyMove {
  const [move, ...after] = lead;
  const children: StudyMove[] = [];
  const copy: StudyMove = { ...move, parent, children, comment: '' };
  children.push(...(after.length > 0 ? [copyLead(after, rest, copy)] : rest(copy)));
  return copy;
}

/** The moves from the first chapter's start to `pos` in an earlier chapter; none for that start itself or a position none reaches. */
function leadTo(chapters: readonly Chapter[], pos: Chess): StudyMove[] | undefined {
  const key = positionKey(pos);
  if (chapters.length === 0 || positionKey(chapters[0].start) === key) return undefined;
  const start = positionKey(chapters[0].start);
  for (const chapter of chapters) {
    if (positionKey(chapter.start) !== start) continue;
    for (const move of chapterMoves(chapter)) {
      if (positionKey(move.after) !== key) continue;
      const lead: StudyMove[] = [];
      for (let at: StudyMove | undefined = move; at; at = at.parent) lead.unshift(at);
      return lead;
    }
  }
  return undefined;
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
