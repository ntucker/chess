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
import type { Color } from 'chessops/types';
import { makeSan } from 'chessops/san';
import { parseUci } from 'chessops/util';

import { positionKey, sanToUci } from '@/game/replay';
import type { Uci } from '@/lesson/lesson';

import { letterCastling, namedMoves, plainSan } from './text';

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
  /**
   * The side the chapter was written for, when it is not the lesson's (a
   * London study read for the anti-London): its "you" is the learner's
   * opponent, and it recommends none of the learner's moves.
   */
  readonly writtenFor?: Color;
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
  /**
   * Its comment is only the introduction of the line it begins, moved there
   * (`withLineIntros`): about the line, not the move, so another guide's note
   * on the move still has room beside it.
   */
  readonly intro?: true;
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
  // The positions earlier chapters reach, for `withLineIntros`.
  const known = new Set<string>();
  const add = (chapter: Chapter) => {
    chapters.push(chapter);
    for (const move of chapterMoves(chapter)) known.add(positionKey(move.after));
  };
  for (const game of parsePgn(pgn)) {
    const title = game.headers.get('ChapterName') ?? game.headers.get('Event') ?? '';
    if (!include(title)) continue;
    const start = startingPosition(game.headers).unwrap() as Chess;
    const namedFrom = Number(game.headers.get('NamedFrom')) || undefined;
    const lead = leadTo(chapters, start);
    if (!lead) {
      const moves = withLineIntros(readMoves(game.moves.children, start, 1), known);
      add({ title, start, moves, ...(namedFrom && { namedFrom, cut: true }) });
      continue;
    }
    const first = copyLead(lead, (last) =>
      readMoves(game.moves.children, last.after, last.ply + 1, last),
    );
    add({ title, start: chapters[0].start, moves: withLineIntros([first], known) });
  }
  return chapters;
}

/**
 * `moves` with each side line's introduction on the move it introduces. A
 * comment opening a side line on a move that earlier chapters already play
 * (`known` holds the positions they reach), which names the move where that
 * line first goes somewhere new, introduces the line: "Before the Nf6 c5
 * line, its little brother" on 1...d5 belongs on 1...d5 2.Bf4 c5's c5.
 */
function withLineIntros(moves: readonly StudyMove[], known: ReadonlySet<string>): StudyMove[] {
  const edits = new Map<StudyMove, Edit>();
  const stack = [...moves];
  for (let move = stack.pop(); move; move = stack.pop()) {
    stack.push(...move.children);
    const siblings = move.parent?.children ?? moves;
    if (!move.comment || siblings[0] === move || !known.has(positionKey(move.after))) continue;
    let target = move;
    while (target.children.length === 1 && known.has(positionKey(target.after)))
      target = target.children[0];
    if (target === move || known.has(positionKey(target.after))) continue;
    const named = namedMoves(move.comment).some(
      ({ san, side, ply }) =>
        san === target.san &&
        (!side || side === target.before.turn) &&
        // Study move numbers are often off by one or two: two numbers are four plies.
        (!ply || Math.abs(ply - target.ply) <= 4),
    );
    if (!named) continue;
    edits.set(move, { comment: '' });
    // Joined to the move's own comment, the whole note explains the move. No two intros share a
    // target: one on a move inside another's single-move chain would be its parent's only child.
    edits.set(
      target,
      target.comment
        ? { comment: `${move.comment}\n${target.comment}` }
        : { comment: move.comment, intro: true },
    );
  }
  return edits.size > 0 ? rebuilt(moves, edits) : [...moves];
}

/**
 * `chapters` with the moves `replies` names after each line, by the line's
 * moves in SAN from the start (`d4 d5 Bf4 Nf6 Nf3 c5 dxc5`): replies a study
 * names only in words where its line stops ("you play e6 and win the pawn
 * back"), read as its own moves. Throws for a line no chapter plays to its
 * end, so a changed study can't drop a reply unseen.
 */
export function withReplies(
  chapters: readonly Chapter[],
  replies: Readonly<Record<string, string>>,
): Chapter[] {
  const added = new Map<StudyMove, string>();
  for (const [line, reply] of Object.entries(replies)) {
    const sans = line.split(' ');
    const last = chapters
      .map((chapter) =>
        sans.reduce<StudyMove | undefined>(
          (at, san, i) =>
            (i === 0 ? chapter.moves : at?.children)?.find((move) => move.san === san),
          undefined,
        ),
      )
      .find(Boolean);
    if (!last) throw new Error(`No chapter plays ${line}, where a reply was named`);
    if (!sanToUci(last.after, reply)) throw new Error(`${reply} is not legal after ${line}`);
    added.set(last, reply);
  }
  return chapters.map((chapter) => ({
    ...chapter,
    moves: rebuilt(chapter.moves, new Map(), added),
  }));
}

/** What `rebuilt` changes on a move. */
type Edit = Pick<StudyMove, 'comment'> & Partial<Pick<StudyMove, 'intro'>>;

/**
 * Copies of `moves` and the moves after them, each with its `edits` applied,
 * and after it the reply (SAN) `replies` names for it.
 */
function rebuilt(
  moves: readonly StudyMove[],
  edits: ReadonlyMap<StudyMove, Edit>,
  replies: ReadonlyMap<StudyMove, string> = new Map(),
  parent?: StudyMove,
): StudyMove[] {
  return moves.map((move) => {
    const children: StudyMove[] = [];
    const copy: StudyMove = { ...move, ...edits.get(move), parent, children };
    children.push(...rebuilt(move.children, edits, replies, copy));
    const reply = replies.get(move);
    const uci = reply && sanToUci(move.after, reply);
    if (uci && !children.some((child) => child.uci === uci)) children.push(readReply(copy, uci));
    return copy;
  });
}

/** `uci` after `move`, a move without comment or glyphs. */
const readReply = (move: StudyMove, uci: Uci): StudyMove => ({
  uci,
  san: plainSan(makeSan(move.after, parseUci(uci)!)),
  ply: move.ply + 1,
  before: move.after,
  after: played(move.after, uci),
  parent: move,
  children: [],
  comment: '',
  nags: [],
});

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
      // Castling is lettered here, once, so every later reader of the comment sees one spelling.
      comment: comments
        .map((raw) => letterCastling(parseComment(raw).text.trim()))
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
