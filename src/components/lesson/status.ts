import { type MoveQuality, percent } from '@/analysis/quality';
import type { HeadlineProps, News } from '@/components/GameStatus';
import { endingHeadline, resultVerdict, type Verdict } from '@/game/ending';
import type { Color, GameResult } from '@/game/replay';
import type { LessonView } from '@/lesson/view';
import type { Acts } from '@/opportunity/cue';
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
  /** How the game ended for the learner, while the board shows its final position. */
  readonly ending?: Verdict;
  /** The cue the board is in, in Explore (`cueHeadline`). */
  readonly cue?: CueStatus;
}

/** A cue's acts with the moves its headline names, as the scoresheet writes them. */
export interface CueStatus extends Pick<Acts, 'found' | 'payoff'> {
  /** The other side's mistake: "Bg5". */
  readonly mistake: string;
  /** The line's reply, which punishes it: "Nxe4". */
  readonly reply: string;
  /** The learner's move at the cue, while the board shows it. */
  readonly tried?: string;
  /** How often players in the opponent's band play the mistake there (0 to 1), where counted. */
  readonly share?: number;
}

/** The panel's headline, as `describeStatus` gives it. */
export type Status = Pick<HeadlineProps, 'eyebrow' | 'title' | 'titleTip' | 'detail' | 'news'> & {
  /**
   * Where the headline tells that the guide has no moves here (off it, or at
   * a line's end), its title as a heading for the detail told apart from it.
   */
  readonly pastGuide?: string;
};

/**
 * The panel's headline: where the lesson stands and whose move it is, or
 * how the game ended. In Practice, right after the learner's move, it judges
 * that move first.
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
    ending,
    cue,
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
  if (ending) return { eyebrow, ...endingHeadline(ending, rival) };
  // A phone tells it in the pane beside the acts instead.
  if (cue) return { eyebrow, ...cueHeadline(cue), news: 'none' };
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
 * How the game ended, for the headline: only while the board shows its final
 * position, not a move stepped back to or an idea played over it.
 */
export const shownEnding = (
  { result, atLatest, playing }: { result?: GameResult; atLatest: boolean; playing: boolean },
  learner: Color,
): Verdict | undefined =>
  result && atLatest && !playing ? resultVerdict(result, learner) : undefined;

/**
 * Why the scoresheet's Review button doesn't open yet, for its tip, or
 * undefined once it opens: when the game has ended, or in Practice once a
 * move left the guide. Never while picking a line.
 */
export function whyReviewShut({
  picking,
  ended,
  practice,
  leftGuide,
}: {
  readonly picking: boolean;
  readonly ended: boolean;
  readonly practice: boolean;
  readonly leftGuide: boolean;
}): string | undefined {
  if (!picking && (ended || (practice && leftGuide))) return undefined;
  return practice
    ? 'Review opens after a move off the guide, or once the game ends.'
    : 'Review opens once the game ends, or in Practice after a move off the guide.';
}

/** What a narrow page's layout around the headline shows, for `headlineNews`. */
interface Surroundings {
  /** The idea pane's place tells the past-guide headline (the model's `aside`, drawn by PhoneLesson). */
  readonly aside: boolean;
  /** The scoresheet's page shows in place of the panes, and the aside with them. */
  readonly scoresheetShown: boolean;
  /** The opponent didn't answer, so the headline draws its retry. */
  readonly failed: boolean;
}

/**
 * What a narrow page draws of the headline (`news`): nothing where the aside
 * tells it, nor where the scoresheet's page shows in place of the panes and the
 * headline only says the board is off the guide. A failure keeps it, beside
 * the retry.
 */
export function headlineNews(
  { news, pastGuide }: Pick<Status, 'news' | 'pastGuide'>,
  { aside, scoresheetShown, failed }: Surroundings,
): News {
  const untold = scoresheetShown ? pastGuide === OFF_GUIDE && !failed : aside;
  return untold ? 'none' : (news ?? 'all');
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

/**
 * The headline of a cue's acts (src/opportunity/cue.ts): the question while
 * it is open, then how the learner's try went, then the payoff. Example:
 * "Your cue." over "Bg5 is a mistake. Find the move that punishes it."
 */
export function cueHeadline({
  found,
  payoff,
  mistake,
  reply,
  tried = reply,
  share,
}: CueStatus): Pick<Status, 'title' | 'titleTip' | 'detail'> {
  switch (found) {
    case 'open':
      return {
        title: 'Your cue.',
        titleTip:
          share === undefined
            ? undefined
            : `About ${percent(share)} of players at your opponent's rating play ${mistake} here.`,
        detail: `${mistake} is a mistake. Find the move that punishes it.`,
      };
    case 'shown':
      return { title: 'Your cue.', detail: `${reply} punishes ${mistake}. Play it.` };
    case 'pending':
      return { title: 'Checking your move…', detail: `Does ${tried} punish ${mistake}?` };
    case 'failed':
      return {
        title: 'Not this one.',
        detail: `${tried} doesn't punish ${mistake}. Retry, or skip to play on.`,
      };
    case 'unchecked':
      return {
        title: 'Couldn’t check it.',
        detail: `Stockfish gave up on ${tried}. Retry, or skip to play on.`,
      };
    case 'passed':
      switch (payoff) {
        case 'done':
          return { title: 'Payoff complete.', detail: `That is what ${mistake} gave away.` };
        case 'playing':
          return { title: 'The payoff.', detail: `Play on and cash in on ${mistake}.` };
        case 'ahead':
        case 'none':
          return { title: 'Found it.', detail: `${tried} punishes ${mistake}.` };
      }
  }
}
