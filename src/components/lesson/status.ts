import type { MoveQuality } from '@/analysis/quality';
import type { HeadlineProps } from '@/components/GameStatus';
import type { LessonView } from '@/lesson/view';
import { qualityLooks } from '@/theme/moveQuality';

/** The name of the screen where the openings are picked. */
export const OPENINGS_TITLE = 'Openings';

/** The titles of the headlines telling that the guide has no moves here, also the heading of what they tell (`pastGuide`). */
const OFF_GUIDE = 'Off the guide';
const LINE_END = 'End of this line';

/** The headline while a lesson loads. */
export const LOADING = { title: 'Setting the stage…', detail: 'Loading the lesson.' } as const;

interface StatusInput {
  /** Whether the board shows where the openings are picked (`isPicking`). */
  readonly picking: boolean;
  /** The game has moved on to a lesson that has been loading long enough to say so. */
  readonly loading: boolean;
  /** The lesson's title, for a position before any variation. */
  readonly title: string;
  /** The names along the board's variation (`pathNames`). */
  readonly names: readonly string[];
  /** The opponent's side, as shown: "White". */
  readonly rival: string;
  /** Who plays past the guide: "Maia". */
  readonly engine: string;
  /** The opponent is replying to the position shown (`Game.replying`). */
  readonly replying: boolean;
  /** The board shows an earlier move than the latest. */
  readonly viewing: boolean;
  /** Auto play: the opponent plays on by itself past the guide. */
  readonly auto: boolean;
  /** The learner may play the side to move's move now: on the opponent's turn, they pick it. */
  readonly canPlay: boolean;
  /** The headline tells of a guide line's end (`Guidance.lineEnded`). */
  readonly lineEnded: boolean;
  /**
   * No move of the learner's comes before the board's position: the learner
   * has yet to move, and a move there starts a Practice run, so it's no
   * take-back (`beforeSideMoves`).
   */
  readonly startsRun: boolean;
  /** In Practice: whether the run is clean, and the label of the move the board shows. */
  readonly practice?: { readonly clean: boolean; readonly verdict?: MoveQuality };
}

/** The panel's headline, as `describeStatus` gives it. */
type Status = Pick<HeadlineProps, 'eyebrow' | 'title' | 'detail' | 'news'> & {
  /**
   * Where the headline tells that the guide has no moves here (off it, or at
   * a line's end), its title as a heading for the detail told apart from it.
   */
  readonly pastGuide?: string;
};

/**
 * The panel's headline: where the lesson stands and whose move it is. In
 * Practice, right after the learner's move, it judges that move first.
 * `news` says what of it is news, where the title only says whose move it
 * is (`detail`), or the detail is also how to use the screen, once the
 * learner has moved and so has seen how (`none`); left out, all of it is
 * news. See `StatusHeadline`.
 */
export function describeStatus(
  view: Pick<LessonView, 'place' | 'learnerToMove' | 'ply'>,
  {
    picking,
    loading,
    title,
    names,
    rival,
    engine,
    replying,
    viewing,
    auto,
    canPlay,
    lineEnded,
    startsRun,
    practice,
  }: StatusInput,
): Status {
  if (loading) return { eyebrow: picking ? OPENINGS_TITLE : title, ...LOADING };
  if (picking)
    return {
      eyebrow: OPENINGS_TITLE,
      title: 'Pick an opening.',
      detail:
        'Each move here leads to the lesson named beside it. Play one on the board or in the list.',
    };
  const eyebrow = names.join(' · ') || title;
  // Beyond the guide with auto play off, nobody replies: the learner moves both sides.
  const playOn = auto ? `play on against ${engine}` : 'play on, moving both sides';
  if (lineEnded && practice?.clean)
    return {
      eyebrow,
      title: 'Line complete.',
      detail: 'A clean run: each of your moves from the book, and nothing taken back.',
    };
  if (lineEnded)
    return {
      eyebrow,
      title: `${LINE_END}.`,
      detail: practice
        ? 'This run wasn’t clean: a slip, a take-back, or Practice chosen after your first move. Go back to your first move and play it through.'
        : `The guide stops here. Step back to try another branch, or ${playOn}.`,
      pastGuide: LINE_END,
    };
  // An `end` place is always a line end the headline tells (see above).
  if (view.place === 'beyond')
    return {
      eyebrow,
      title: `${OFF_GUIDE}.`,
      detail: `This position isn't in the lesson. Step back to return to the guide, or ${playOn}.`,
      pastGuide: OFF_GUIDE,
    };
  if (view.learnerToMove)
    return {
      eyebrow,
      title: 'Your move.',
      // Only Explore's detail at the latest move is how-to; the others say what a move here does.
      news: !startsRun && !practice && !viewing ? 'none' : 'detail',
      detail:
        practice && startsRun && viewing
          ? YOUR_MOVE.practice.restart
          : YOUR_MOVE[practice ? 'practice' : 'explore'][viewing ? 'viewing' : 'latest'],
    };
  const reply = canPlay
    ? `Choose ${rival}'s reply.`
    : replying
      ? `${rival} is choosing…`
      : `${rival}'s move.`;
  if (practice && view.ply > 0)
    return {
      eyebrow,
      title: practice.verdict ? `${qualityLooks[practice.verdict].name}.` : 'Checking your move…',
      detail: reply,
    };
  return {
    eyebrow,
    title: reply,
    news: startsRun ? 'detail' : 'none',
    detail: canPlay
      ? 'Point at a reply to see what it aims for, then play it.'
      : 'Point at a reply to see what it aims for.',
  };
}

/**
 * The detail under "Your move.", by mode and whether an earlier move is
 * shown; `restart` is Practice's when a move there starts a run.
 */
const YOUR_MOVE = {
  explore: {
    latest: 'Point at a candidate or a note to see it on the board, then play any move you like.',
    viewing: 'Play a move here to try another branch.',
  },
  practice: {
    latest: 'No hints in Practice. Play the move you would choose.',
    viewing: 'Playing here takes a move back, which ends a clean run.',
    restart: 'Playing here starts a new run from your first move.',
  },
} as const;
