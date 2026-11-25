import { useController, useDLE } from '@data-client/react';
import { useIsFocused } from 'expo-router';
import { type ComponentProps, use, useMemo, useState } from 'react';

import type { HeadlineProps } from '@/components/GameStatus';
import type { Header } from '@/components/Header';
import type { ScoresheetReview } from '@/components/ReviewLinks';
import type { Scoresheet } from '@/components/Scoresheet';
import type { ScoresheetOpener } from '@/components/ScoresheetPage';
import type { BoardColumn } from '@/components/Stage';
import { type Color, colorName, opposite, playMove, readPositionKey } from '@/game/replay';
import type { GameStore } from '@/game/useGame';
import { listsOpportunities, listsTopMoves, shownRows } from '@/lesson/guidance';
import type { Lesson, PositionKey, Uci, VariationId } from '@/lesson/lesson';
import {
  lessonsAfter,
  lessonsFrom,
  openingsLesson,
  sameLine,
  withOpenings,
} from '@/lesson/openings';
import {
  bandPlayers,
  type Candidate,
  candidates,
  captionName,
  opponentBand,
  pathNames,
  shareSource,
} from '@/lesson/select';
import { useLesson } from '@/lesson/useLesson';
import { ratingBand } from '@/lichess/explorer';
import { MAIA_RATINGS } from '@/maia/ratings';
import type { Cue } from '@/opportunity/cue';
import { useFinder } from '@/opportunity/useFinder';
import type { ReplySource } from '@/opportunity/walk';
import { describeOpponent, isStockfish, type Opponent } from '@/opponent/opponent';
import { getAccounts } from '@/resources/accounts';
import { getLesson, LessonIndexContext, type LessonId } from '@/resources/lesson';
import { reviewHref } from '@/review/address';
import { useSettings } from '@/settings/SettingsProvider';

import type { CandidateList } from './CandidateList';
import type { ActsModel, OpportunityCard } from './CueActs';
import { type IdeaAside, type IdeaCard, noNotesText } from './IdeaCard';
import type { LessonControls } from './LessonControls';
import type { FinderProps, OpportunityList } from './OpportunityList';
import type { TrapCard } from './TrapCard';
import { describeStatus, OPENINGS_TITLE, type Status, shownEnding } from './status';

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
  /** The move that picked the lesson loading. */
  readonly pendingMove?: Uci;
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
   * The game's review: the scoresheet's button, which opens it at any point
   * after the first move, and whether the headline offers it: once the game
   * ends.
   */
  readonly review: {
    readonly button: ComponentProps<typeof ScoresheetReview>;
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
  /** In Practice, whether the learner's move at a cue punished the mistake. */
  readonly opportunity: ComponentProps<typeof OpportunityCard> | null;
  /**
   * The list of the lesson's opportunities and the finder's (in Explore, on
   * any lesson), as its inputs: the list works the lesson's rows out itself,
   * once it shows, since a big lesson's walk takes a moment.
   * Not `opportunity`, the Practice card after the learner's move at a cue.
   */
  readonly opportunities: Omit<ComponentProps<typeof OpportunityList>, 'density'> | null;
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
  pendingMove,
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
    progress,
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
  } = useLesson(lesson, store, { pending });
  const { mode } = modeState;
  const [, dispatchGame] = store;
  const { auto } = useSettings();
  const learner = lesson.side;
  const rival = opposite(learner);
  const described = describeOpponent(opponent);
  const focused = useIsFocused();
  const listing = !!picked && listsOpportunities(mode);
  const finder = useLessonFinder(picked, opponent, shownLine, listing && focused);
  const preview = guidance.preview?.candidate;
  const { acts, opportunity } = guidance;
  const trap = guidance.trapIn === 'card' ? guidance.trap : undefined;
  // The guide's note on the cue's mistake, once its punishment lands.
  const mistakeNote =
    guidance.trapIn === 'cue' && guidance.trap
      ? { lesson, shown: guidance.trap.note, learner, playback }
      : undefined;
  const cueFacts = useCueFacts(lesson, acts?.cue ?? opportunity, opponentBand(lesson, opponent));
  const cue = acts && cueFacts && { replied: acts.replied, payoff: acts.payoff, ...cueFacts };
  // The card is for notes, or for the notes of a candidate pointed at.
  // Stockfish's moves have none of their own.
  const ideaCard = guidance.notes.length > 0 || guidance.candidates.length > 0;
  const names = pathNames(view.variation);
  const { result } = game.latest;
  const started = game.moves.length > 0;
  const ending = shownEnding(
    { result, atLatest: game.atLatest, playing: !!playback.playing },
    learner,
  );
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
  const list = guidance.candidates.length
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
        opportunities: guidance.opportunities,
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
  // A pick's wait shows on its row, so the headline and the list stay put; a
  // wait with no row shown for it (Back or Forward, a hidden rare move) is the headline's.
  const loadingMove =
    loading && list && shownRows(list).some(({ move }) => move.uci === pendingMove)
      ? pendingMove
      : undefined;
  const moves: LessonScreenModel['moves'] = list && { ...list, loadingMove };

  const { pastGuide, news, ...headline } = describeStatus(view, {
    picking,
    loading: loading && loadingMove === undefined,
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
    stepper: { san: game.plies[game.ply].move?.san, ply: game.ply, started },
    headline: {
      ...headline,
      failure: game.error && { who: described.name, error: game.error, onRetry: game.retry },
      eyebrowLink: listLink,
    },
    status: { news, pastGuide },
    review: {
      button: {
        href: reviewHref(game.moves, learner, id),
        started,
        resigns: game.toMove,
      },
      offered: !!ending,
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
    acts: acts ? { replied: acts.replied, payoff: acts.payoff, note: mistakeNote } : null,
    opportunity:
      opportunity?.tried && cueFacts
        ? {
            found: opportunity.found,
            mistake: cueFacts.mistake,
            reply: cueFacts.reply,
            tried: sanAt(opportunity.key, opportunity.tried),
            note: mistakeNote,
          }
        : null,
    opportunities:
      picked && listing
        ? {
            // The file's own counts, which `withOpenings` drops where the openings are picked.
            lesson: picked,
            band: opponentBand(picked, opponent),
            progress,
            players: bandPlayers(picked, opponent),
            onPlay: (line) => dispatchGame({ type: 'newGame', moves: line }),
            finder,
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
 * The opportunity finder on the lesson `picked`, for its list: run from the
 * position the board showed when the learner last asked, while `active`
 * (Explore, in front). The replies it reads are lichess's games in the
 * opponent's band when the learner signed in with lichess, else Maia's at the
 * opponent's rating; against Stockfish, the top band or network. Another
 * lesson starts with none.
 */
function useLessonFinder(
  picked: Lesson | undefined,
  opponent: Opponent,
  shownLine: readonly Uci[],
  active: boolean,
): FinderProps {
  const [from, setFrom] = useState<{ readonly lesson: Lesson; readonly line: readonly Uci[] }>();
  const line = picked && from?.lesson === picked ? from.line : undefined;
  // Until the device answers, Maia's: a run starts only once the learner asks.
  const signedIn = !!useDLE(getAccounts).data?.lichess;
  const source = useMemo(
    (): ReplySource =>
      signedIn
        ? { from: 'lichess', band: ratingBand(isStockfish(opponent) ? Infinity : opponent) }
        : { from: 'maia', rating: isStockfish(opponent) ? MAIA_RATINGS.at(-1)! : opponent },
    [signedIn, opponent],
  );
  const ask = useMemo(
    () => picked && line && { line, side: picked.side, source, lesson: picked },
    [picked, line, source],
  );
  return {
    run: useFinder(active ? ask : undefined),
    from: !line ? 'none' : sameLine(line, shownLine) ? 'here' : 'elsewhere',
    source,
    onFind: () => picked && setFrom({ lesson: picked, line: shownLine }),
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
