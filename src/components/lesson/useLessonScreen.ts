import { useController } from '@data-client/react';
import { type ComponentProps, use, useMemo } from 'react';

import type { Header } from '@/components/Header';
import type { HeadlineProps } from '@/components/GameStatus';
import type { Scoresheet } from '@/components/Scoresheet';
import type { ScoresheetOpener } from '@/components/ScoresheetPage';
import type { BoardColumn } from '@/components/Stage';
import { type Color, colorName, opposite, playMove, readPositionKey } from '@/game/replay';
import type { GameStore } from '@/game/useGame';
import { listsTopMoves } from '@/lesson/guidance';
import type { Lesson, PositionKey, Uci, VariationId } from '@/lesson/lesson';
import {
  isPicking,
  lessonsAfter,
  lessonsFrom,
  openingsLesson,
  withOpenings,
} from '@/lesson/openings';
import {
  type Candidate,
  candidates,
  captionName,
  opponentBand,
  pathNames,
  shareSource,
} from '@/lesson/select';
import { useLesson } from '@/lesson/useLesson';
import { type Cue, cueControls } from '@/opportunity/cue';
import { describeOpponent } from '@/opponent/opponent';
import { getLesson, LessonIndexContext, type LessonId } from '@/resources/lesson';
import { reviewHref } from '@/review/address';
import { useSettings } from '@/settings/SettingsProvider';

import type { CandidateList } from './CandidateList';
import type { ActsModel } from './CueActs';
import { type IdeaAside, type IdeaCard, noNotesText } from './IdeaCard';
import type { LessonControls } from './LessonControls';
import type { TrapCard } from './TrapCard';
import { describeStatus, OPENINGS_TITLE, type Status, shownEnding, whyReviewShut } from './status';

/** What the lesson screen is given: the address's lesson and the game held above it. */
export interface LessonScreenInput {
  /** The lesson the address names, none at the start. */
  readonly id?: LessonId;
  /** That lesson, loaded; none before one is picked. */
  readonly picked: Lesson | undefined;
  /** The side the learner plays, the lesson's once one is picked. */
  readonly side: Color;
  /** The learner chooses to play as the other side, from its start. */
  readonly onPlayAs: (side: Color) => void;
  readonly store: GameStore;
  /** The game has moved on to a lesson still loading: the learner can't move. */
  readonly pending: boolean;
  /** A lesson, or the next page, has been loading long enough to say so. */
  readonly loading: boolean;
}

type HeaderProps = ComponentProps<typeof Header>;
type BoardColumnProps = ComponentProps<typeof BoardColumn>;

/**
 * What the lesson screen shows, worked out once and handed to whichever
 * layout draws it: plain data, and the props of the blocks every layout
 * shares. A layout decides where each block goes, never what it says.
 */
export interface LessonScreenModel {
  /** The tab's title. */
  readonly title: string;
  readonly header: Pick<HeaderProps, 'place' | 'placeLink' | 'onRestart'>;
  readonly board: Pick<BoardColumnProps, 'game' | 'board' | 'onSwap'> & {
    readonly rival: Pick<BoardColumnProps['rival'], 'name' | 'detail' | 'detailWideOnly'>;
  };
  /** The move on the board, for the stepper's middle; `started` once the game has a move. */
  readonly stepper: Pick<ComponentProps<typeof ScoresheetOpener>, 'san' | 'ply'> & {
    readonly started: boolean;
  };
  readonly headline: Pick<
    HeadlineProps,
    'eyebrow' | 'title' | 'titleTip' | 'detail' | 'failure' | 'eyebrowLink'
  >;
  /**
   * What the status says beyond the headline: how much of it a phone draws,
   * and why Stockfish's moves stand in for the guide's. The phone's layout
   * reads them with `headlineNews`, which also needs what it shows around
   * the headline.
   */
  readonly status: Pick<Status, 'news' | 'pastGuide'>;
  /**
   * The game's review: its address, why it is shut (none when open), and
   * whether the headline offers it: once the game ends, if it is open.
   */
  readonly review: {
    readonly href: ReturnType<typeof reviewHref>;
    readonly shut?: string;
    readonly offered: boolean;
  };
  /**
   * Past the guide, where Stockfish's moves stand in for the guide's and no
   * idea card shows, why: the headline's title and detail again, for a
   * narrow page to show in the idea pane's place.
   */
  readonly aside: ComponentProps<typeof IdeaAside> | null;
  /** The moves the learner can point at: the guide's, else past it Stockfish's. */
  readonly moves: Omit<ComponentProps<typeof CandidateList>, 'density'> | null;
  /** The notes of the position, or of the candidate pointed at. */
  readonly idea: Omit<ComponentProps<typeof IdeaCard>, 'density'> | null;
  readonly trap: ComponentProps<typeof TrapCard> | null;
  /**
   * The acts of the cue the board is in (Explore only), which take the trap
   * card's place for the other side's mistake.
   */
  readonly acts: ActsModel | null;
  /** The game's moves. */
  readonly scoresheet: Omit<ComponentProps<typeof Scoresheet>, 'fill'>;
  readonly settings: Pick<ComponentProps<typeof LessonControls>, 'mode' | 'onMode'>;
  /** The side the learner plays (the lesson's once one is picked). */
  readonly learner: Color;
  readonly sources: Lesson['sources'];
  /** The learner leaves the moves and the idea: the preview ends. */
  readonly onLeave: () => void;
}

/**
 * The lesson `picked`, played on the board in Explore or Practice, or before
 * one is picked the openings of `side` alone: everything the screen shows.
 */
export function useLessonScreen({
  id,
  picked,
  side,
  onPlayAs,
  store,
  pending,
  loading,
}: LessonScreenInput): LessonScreenModel {
  const ctrl = useController();
  const index = use(LessonIndexContext);
  // Before one is picked, the openings of `side` alone.
  const lesson = useMemo(
    () => (picked ? withOpenings(picked, index) : openingsLesson(index, side)),
    [picked, index, side],
  );
  const {
    game,
    opponent,
    picking,
    shownLine,
    view,
    guidance,
    board,
    playback,
    canPlay,
    play,
    pointedNote,
    marks,
    rareShown,
    showRare,
    pointRow,
    reachCard,
    pointNote,
    leaveNote,
    leave,
    modeState,
    startsRun,
    chooseMode,
    acts,
    retryCue,
    showCue,
    skipCue,
  } = useLesson(lesson, store, { pending });
  const { mode } = modeState;
  const { auto } = useSettings();
  const learner = lesson.side;
  const rival = opposite(learner);
  const described = describeOpponent(opponent);
  const preview = guidance.preview?.candidate;
  const trap = guidance.trapIn === 'card' ? guidance.trap : undefined;
  const controls = acts && cueControls(acts.found);
  const cueFacts = useCueFacts(lesson, acts?.cue, opponentBand(lesson, opponent));
  const cue = acts &&
    cueFacts && {
      found: acts.found,
      payoff: acts.payoff,
      ...cueFacts,
      tried: game.plies[acts.cue.ply + 1]?.move?.san,
    };
  // The card is for notes, or for the notes of a candidate pointed at.
  // Stockfish's moves have none of their own.
  const ideaCard =
    guidance.notes.length > 0 || (guidance.choices && guidance.candidates.length > 0);
  const names = pathNames(view.variation);
  const { result } = game.latest;
  const ending = shownEnding(
    { result, atLatest: game.atLatest, playing: !!playback.playing },
    learner,
  );
  // The whole game, not the move on the board: stepping back into the
  // openings' first moves doesn't close the review of a game played past them.
  const gamePicking = isPicking(index, learner, game.moves);
  const reviewShut = whyReviewShut({
    picking: gamePicking,
    ended: !!result,
    practice: mode === 'practice',
    leftGuide: view.guideMoves.includes(undefined),
  });
  const { pastGuide, news, ...headline } = describeStatus(view, {
    picking,
    loading,
    title: lesson.title,
    names,
    rival: colorName(rival),
    engine: described.name,
    replying: game.replying,
    viewing: !game.atLatest,
    auto,
    canPlay,
    lineEnded: guidance.lineEnded,
    startsRun,
    practice:
      modeState.mode === 'practice' ? { clean: modeState.clean, verdict: game.quality } : undefined,
    ending,
    cue,
  });
  // Where Stockfish's moves stand in for the guide's, a narrow page tells why
  // in the idea pane's place. A failure keeps the headline's.
  const aside =
    pastGuide && listsTopMoves(view, mode) && !ideaCard && !game.error
      ? { title: pastGuide, detail: headline.detail }
      : null;

  // What the list of the rival's moves holds.
  const rivalMoves = !picking ? 'likely replies' : view.ply ? 'next move' : 'first move';
  /** Where the openings are picked, the lessons a move leads to. */
  const openings = (uci: Uci) => (picking ? lessonsAfter(index, learner, [...shownLine, uci]) : []);
  const line = view.variation.at(-1);
  // While picking, the header names no line, so a caption keeps its groups.
  const shortName = (variation: VariationId) =>
    captionName(lesson.variations[variation].name, picking ? [] : view.variation);
  const leadsTo = (candidate: Candidate) => {
    const into = openings(candidate.move.uci);
    if (into.length) return into.map((lessonId) => index[lessonId].title).join(' or ');
    if (candidate.variation === undefined) return 'Leaves the guide';
    return candidate.variation === line?.id ? undefined : shortName(candidate.variation);
  };
  // What the guide's candidate rows and Stockfish's top moves' rows share.
  const rowProps = {
    position: view.key,
    pointed: preview?.move.uci,
    marks,
    playable: canPlay,
    onPlay: play,
    onTabOut: leave,
  };
  // Past the guide, a move of Stockfish's can lead back into it.
  const rejoins = ({ variation }: Candidate) =>
    variation === undefined ? undefined : `Rejoins ${shortName(variation)}`;
  // Pointing at an opening, or picking up a piece that plays one, starts
  // loading its lesson, so playing it needn't wait. A failure shows once the
  // opening is picked.
  const load = (lessonId: LessonId) => {
    ctrl.fetchIfStale(getLesson, lessonId);
  };
  const pointCandidate = (uci: Uci, time?: number) => {
    openings(uci).forEach(load);
    pointRow(uci, time);
  };
  const onDrag: typeof board.onDrag = (drag) => {
    // Each report repeats the request, which fetchIfStale makes free.
    if (picking && drag) lessonsFrom(index, learner, shownLine, drag.from).forEach(load);
    board.onDrag?.(drag);
  };

  // The opening's name opens the list of every opening, which marks where the board is.
  // From the line's id, which the React Compiler sees unchanged from move to move.
  const lineId = line?.id;
  const listLink = {
    href: {
      pathname: '/openings',
      params: id === undefined ? {} : { lesson: id, ...(lineId && { variation: lineId }) },
    },
    label: 'Every opening',
  } as const;

  // The guide's moves, with any of Stockfish's after them, or past the
  // guide's moves Stockfish's alone.
  const moves: LessonScreenModel['moves'] = guidance.candidates.length
    ? {
        ...rowProps,
        heading: view.learnerToMove ? 'Your candidates' : rivalMoves,
        shareTip: shareSource(lesson, opponent),
        owner: view.learnerToMove ? undefined : colorName(rival),
        // At the start each move's opening is the point; later the idea card names it.
        leadsAlways: picking,
        leadsTo,
        candidates: guidance.candidates,
        // Inside the guide, Stockfish's rows are at most its best (`listedEngineMoves`).
        engineBest: guidance.top.at(0),
        verdicts: guidance.verdicts,
        rare: guidance.rare,
        rareShown,
        onShowRare: showRare,
        main: guidance.main,
        onPoint: pointCandidate,
      }
    : guidance.top.length
      ? {
          ...rowProps,
          heading: 'top moves',
          owner: 'Stockfish',
          // No idea card names where the row pointed at leads.
          leadsAlways: true,
          leadsTo: rejoins,
          candidates: guidance.top,
          rare: [],
          rareShown: false,
          onShowRare: showRare,
          main: guidance.top[0],
          onPoint: pointRow,
        }
      : null;

  return {
    title: `${lesson.title} · Opening Night`,
    header: {
      // Only the latest line's name and its parent's, since the path won't fit a narrow page.
      place: picking
        ? { name: OPENINGS_TITLE }
        : { name: names.at(-1) ?? lesson.title, parent: names.at(-2) },
      placeLink: listLink,
      // Back to the start position, from the side the learner plays, in the same mode.
      onRestart: game.newGame,
    },
    board: {
      game,
      rival: {
        name: colorName(rival),
        detail: `The guide's moves, then ${described.lead.toLowerCase()}`,
        // A phone's bar has room for the strength alone: its control says how it plays.
        detailWideOnly: true,
      },
      board: { ...board, onDrag },
      // The side is the lesson's once one is picked.
      onSwap: picking ? () => onPlayAs(rival) : undefined,
    },
    stepper: { san: game.plies[game.ply].move?.san, ply: game.ply, started: game.moves.length > 0 },
    headline: {
      ...headline,
      failure: game.error && { who: described.name, error: game.error, onRetry: game.retry },
      eyebrowLink: listLink,
    },
    status: { news, pastGuide },
    review: {
      href: reviewHref(game.moves, learner, id),
      shut: reviewShut,
      offered: !!ending && !reviewShut,
    },
    aside,
    moves,
    idea: ideaCard
      ? {
          lesson,
          title: preview ? `If ${preview.san}` : 'The idea',
          leadsTo: preview && leadsTo(preview),
          empty: preview && noNotesText(preview.san, guidance.verdicts?.get(preview.move.uci)),
          notes: guidance.notes,
          learner,
          playback,
          pointable: guidance.pointable,
          pointed: pointedNote,
          onPoint: pointNote,
          onLeave: leaveNote,
          onReach: reachCard,
        }
      : null,
    acts:
      acts && controls
        ? {
            found: acts.found,
            payoff: acts.payoff,
            line: headline.detail,
            asking: acts.asking,
            onRetry: controls.retry ? retryCue : undefined,
            onShow: controls.show ? showCue : undefined,
            onSkip: controls.skip ? skipCue : undefined,
            note:
              guidance.trapIn === 'acts' && guidance.trap
                ? { lesson, shown: guidance.trap.note, learner, playback }
                : undefined,
          }
        : null,
    trap: trap
      ? {
          lesson,
          trap,
          mistake: game.plies[trap.ply + 1].move!.san,
          fell: game.plies[trap.ply].turn,
          learner,
          playback,
          onBack: () => game.goto(trap.ply),
        }
      : null,
    scoresheet: {
      plies: game.plies,
      marks: game.qualities,
      ply: game.ply,
      // A record of the line, so it outlives the trap's card.
      trapped: view.trap && view.trap.ply + 1,
      onGoto: game.goto,
    },
    settings: { mode, onMode: chooseMode },
    learner,
    sources: lesson.sources,
    onLeave: leave,
  };
}

/**
 * What a cue's headline names that stays while the board is at it: the
 * mistake and its punishing reply as the scoresheet writes them, and how
 * often the opponent's band plays the mistake.
 */
function useCueFacts(lesson: Lesson, cue: Cue | undefined, band: number | undefined) {
  return useMemo(() => {
    if (!cue) return undefined;
    const [mistake, reply] = cue.line;
    return {
      mistake: sanAt(cue.before, mistake),
      reply: sanAt(cue.key, reply),
      share: candidates(lesson, cue.before, band).find(({ move }) => move.uci === mistake)?.share,
    };
  }, [lesson, cue, band]);
}

/** `uci` written as the scoresheet would, played at `key`: "Nxe4". */
const sanAt = (key: PositionKey, uci: Uci) => playMove(readPositionKey(key)!, uci)!.san;
