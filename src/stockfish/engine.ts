import {
  type Analysis,
  type AnalysisLine,
  finalAnalysis,
  type FinalAnalysis,
  type Watcher,
} from '@/evaluation/evaluation';
import { legalMoveCount } from '@/game/replay';

import {
  addLine,
  evaluationFromScore,
  isWholeDepth,
  multiPvCommand,
  parseInfo,
  positionCommand,
  type SearchLine,
} from './uci';

/** How much each search does: how many moves it ranks (MultiPV), and how many positions it visits. */
export interface SearchBudget {
  readonly ranks: number;
  readonly nodes: number;
}

/**
 * The app's search: three moves (its lines past the guide, and every move's
 * label), and 2,000,000 positions before it settles, about depth 19 (17 to
 * 22): 3.3 s in Node, 5 to 6 s on a recent phone. A node limit, never a time
 * limit, so every device settles on the same lines. Measured on 50 lesson
 * positions against a 5,000,000-node search: the first line's score is off
 * by 0.08 pawns on average (0.12 at 1,000,000; 0.20 for the 100,000-node
 * single-line search this replaced). The bar and lines show each depth as
 * it finishes, so they read well long before this: the first line's score
 * stops moving after about 0.5 s for half the positions.
 */
export const APP_SEARCH: SearchBudget = { ranks: 3, nodes: 2_000_000 };

/**
 * Full Stockfish's search, for the opponent's move alone: one move, and
 * 1,000,000 positions. Its large network visits positions about 1.8 times
 * slower than lite's, so this takes about as long as `APP_SEARCH` (3.4 s
 * against 3.9 s in Node), and it doesn't keep the learner waiting longer
 * than the `stockfish` opponent does.
 */
export const FULL_SEARCH: SearchBudget = { ranks: 1, nodes: 1_000_000 };

/**
 * How long the engine may go without printing a line it forwards before
 * it's asked whether it's alive (`isready`): its handshake (once its host
 * has handed it its files), or the next depth of a search (each takes about
 * 1.5 times the one before, so up to about 2 s on a recent phone near the
 * app's budget, and longer on a slow one).
 */
const ANSWER_MS = 10_000;

/**
 * How long it then has to answer `readyok`, which Stockfish does at once,
 * even mid-search. One that doesn't is stuck, as when Android drops the web
 * view, and is restarted.
 */
const READY_MS = 3_000;

/**
 * How many times in a row it may answer `isready` with nothing else: a
 * minute of a depth that takes that long on a slow phone, after which it
 * most likely lost a command (`uci` or `go`) and is restarted.
 */
const QUIET_ANSWERS = 6;

/** How many engines a search is tried on before it's given up on. */
const TRIES = 2;

/** Sends one UCI command to the engine. */
type Send = (command: string) => void;

/** What an engine tells the host that started it (`useRestarts`). */
export interface Supervisor {
  /** The engine has finished its handshake. */
  ready(): void;
  /** The engine crashed or stopped answering: the host starts another. */
  failed(): void;
}

/** An engine the app is connected to. */
export interface Connection {
  /** Hands the connection a line the engine printed. */
  receive(line: string): void;
  /**
   * Disconnects. What's waiting for an answer stays queued for the next
   * engine attached.
   */
  detach(): void;
  /**
   * Disconnects an engine that crashed, and tells the host to start another
   * (`Supervisor.failed`). The search it was running waits for the next
   * engine, unless it has now been tried on `TRIES` engines.
   */
  fail(message: string): void;
}

/** A position someone is watching. */
interface Wanted {
  readonly line: readonly string[];
  readonly watchers: Set<Watcher>;
  /** The deepest whole depth any search of it has finished. */
  deepest?: Analysis;
  /** How many engines failed while searching it. */
  failures: number;
}

/** The search the engine is running. */
interface Search {
  readonly wanted: Wanted;
  /** How many lines each of its depths prints: the budget's ranks, or fewer when fewer moves are legal. */
  readonly ranks: number;
  /** The set of lines being printed (`addLine`). */
  printing: readonly SearchLine[];
  /**
   * It was told to stop, because a newer position is wanted or nobody wants
   * this one any more. What it prints until `bestmove` is ignored.
   */
  stopping: boolean;
}

/** An attached engine, and whether it has finished its handshake. */
interface Session {
  readonly send: Send;
  readonly supervisor: Supervisor;
  readonly budget: SearchBudget;
  ready: boolean;
  /** How many `readyok`s in a row it has printed while it owes an answer. */
  quietAnswers: number;
}

const analysisLine =
  (line: readonly string[]) =>
  ({ move, score }: SearchLine): AnalysisLine => ({
    ...(move && { uci: move }),
    evaluation: evaluationFromScore(score, line.length),
  });

/**
 * One Stockfish engine as the app sees it: the host that runs it attaches it,
 * and screens watch positions on it. The app has two (`liteStockfish` and
 * `fullStockfish`), each with its own host, queue and search.
 */
export interface Stockfish {
  /**
   * Connects the engine that `send` talks to. The host that runs the engine
   * (StockfishHost) calls this once the engine has started, hands every line
   * it prints to the returned connection, detaches it when the engine is
   * stopped, and fails it when the engine crashes. An engine that doesn't
   * answer in time fails too. Positions watched while no engine is connected
   * wait for one. Every search on it does `budget`: the one this engine was
   * made with (`createStockfish`), unless a tool that searches many
   * positions, like the lesson importer's engine check, needs less.
   */
  attach(send: Send, supervisor: Supervisor, budget?: SearchBudget): Connection;
  /**
   * Has Stockfish analyse the position after `line` (UCI moves from the
   * starting position) and tell `watcher` each deeper depth it finishes, then
   * the final one, once it has visited the connected engine's budget of
   * positions (`attach`). Stockfish works on one position at a time: the
   * newest one asked for. When a newer one is asked for, or nobody watches
   * the running one any more, the running search stops; a position still
   * watched starts again later from the beginning. Each search starts fresh
   * (`ucinewgame`) and is limited only by nodes, so it finishes the same
   * depths with the same lines every time: one that started again repeats
   * what it found before, and `watcher` hears only about depths deeper than
   * any it was told. Returns a function that stops watching.
   */
  watch(line: readonly string[], watcher: Watcher): () => void;
  /** The final analysis of the position after `line` (`watch`). */
  analysis(line: readonly string[]): Promise<FinalAnalysis>;
  /**
   * The host can't start an engine, and trying again won't help, as when the
   * site serves another build's files: fails every position watched, and each
   * one watched from now until an engine attaches, with `error`.
   */
  unavailable(error: Error): void;
}

/** An engine whose searches each do `defaultBudget` unless `attach` says otherwise. */
export function createStockfish(defaultBudget: SearchBudget): Stockfish {
  let connected: Session | undefined;
  let running: Search | undefined;
  /** Fails the connected engine if it goes quiet for too long. */
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  /** The positions being watched, by their moves, the one asked for last at the end: it runs first. */
  const wanted = new Map<string, Wanted>();
  /** A decision on what to search is queued (`decideSoon`). */
  let deciding = false;
  /** Why no engine can start (`unavailable`), until one attaches. */
  let unavailableError: Error | undefined;

  function attach(send: Send, supervisor: Supervisor, budget = defaultBudget): Connection {
    disconnect();
    unavailableError = undefined;
    const session: Session = { send, supervisor, budget, ready: false, quietAnswers: 0 };
    connected = session;
    send('uci');
    awaitAnswer(session);
    return {
      receive(line) {
        if (connected === session) handleLine(session, line);
      },
      detach() {
        if (connected === session) disconnect();
      },
      fail(message) {
        fail(session, message);
      },
    };
  }

  function watch(line: readonly string[], watcher: Watcher): () => void {
    const key = line.join(' ');
    const position = wanted.get(key) ?? { line, watchers: new Set(), failures: 0 };
    // To the end, as the newest.
    wanted.delete(key);
    wanted.set(key, position);
    position.watchers.add(watcher);
    decideSoon();
    return () => {
      // Dropped at the next decision unless watched again by then, as when a
      // screen's render swaps one request for another of the same position.
      if (position.watchers.delete(watcher)) decideSoon();
    };
  }

  /**
   * Decides what to search once the current task is done, so that the
   * requests of one render (a new position, and the one before it for a move's
   * label) lead to one decision.
   */
  function decideSoon() {
    if (deciding) return;
    deciding = true;
    queueMicrotask(() => {
      deciding = false;
      decide();
    });
  }

  /**
   * Drops the positions nobody watches any more (or fails them all while no
   * engine can start), then starts the newest position's search, or stops the
   * running one if it isn't that (its `bestmove` then starts the next).
   */
  function decide() {
    for (const position of wanted.values()) {
      if (unavailableError) giveUp(position, unavailableError);
      else if (!position.watchers.size) remove(position);
    }
    const next = [...wanted.values()].at(-1);
    if (running) {
      if (!running.stopping && running.wanted !== next) {
        running.stopping = true;
        connected?.send('stop');
      }
      return;
    }
    if (!next || !connected?.ready) return;
    running = {
      wanted: next,
      // A finished game still gets one line: its score, with no move.
      ranks: Math.max(1, Math.min(connected.budget.ranks, legalMoveCount(next.line))),
      printing: [],
      stopping: false,
    };
    // A fresh start for every search, so a position always gets the same
    // lines whatever came before it.
    connected.send('ucinewgame');
    connected.send(positionCommand(next.line));
    connected.send(`go nodes ${connected.budget.nodes}`);
    awaitAnswer(connected);
  }

  function handleLine(session: Session, line: string) {
    const owesAnswer = !session.ready || running;
    if (line === 'readyok') {
      // Alive, but not getting on with what it owes: keep the count going.
      if (!owesAnswer) return;
      if (++session.quietAnswers < QUIET_ANSWERS) armWatchdog(session);
      else fail(session, 'it answers isready but nothing else');
      return;
    }
    // Any other line shows the engine is getting on while it owes an answer.
    if (owesAnswer) awaitAnswer(session);
    if (line === 'uciok') {
      clearTimeout(watchdog);
      session.ready = true;
      session.supervisor.ready();
      // Set once: every search ranks the same number of moves.
      session.send(multiPvCommand(session.budget.ranks));
      decide();
      return;
    }
    if (!running) return;
    const info = parseInfo(line);
    if (info) {
      if (!running.stopping) finishDepth(running, info, session.budget.nodes);
    } else if (line.startsWith('bestmove')) finishSearch();
  }

  /** Takes in a line `search` printed, and tells its watchers when it finishes a deeper depth. */
  function finishDepth(search: Search, info: SearchLine, nodes: number) {
    search.printing = addLine(search.printing, info, info.rank);
    const { printing, wanted: position } = search;
    if (!isWholeDepth(printing, search.ranks, nodes)) return;
    if (position.deepest && printing[0].depth <= position.deepest.depth) return;
    position.deepest = {
      lines: printing.map(analysisLine(position.line)),
      depth: printing[0].depth,
      final: false,
    };
    for (const watcher of position.watchers) watcher.update(position.deepest);
  }

  /**
   * The running search ended. One that wasn't stopped reached its budget: its
   * deepest whole depth is final.
   */
  function finishSearch() {
    const search = running!;
    running = undefined;
    clearTimeout(watchdog);
    const { wanted: position } = search;
    if (!search.stopping) {
      remove(position);
      if (position.deepest) {
        const final = { ...position.deepest, final: true };
        for (const watcher of position.watchers) watcher.update(final);
      } else giveUp(position, new Error('Stockfish finished without a score'));
    }
    decide();
  }

  /** Stops watching `position`: it's final, or failed. */
  function remove(position: Wanted) {
    const key = position.line.join(' ');
    if (wanted.get(key) === position) wanted.delete(key);
  }

  /** Stops watching `position`, and tells its watchers it failed with `error`. */
  function giveUp(position: Wanted, error: Error) {
    remove(position);
    for (const watcher of position.watchers) watcher.fail(error);
  }

  /** Watches `session` afresh (`armWatchdog`), from a line that shows it's getting on. */
  function awaitAnswer(session: Session) {
    session.quietAnswers = 0;
    armWatchdog(session);
  }

  /**
   * Asks `session` whether it's alive unless it prints within `ANSWER_MS`, and
   * fails it unless it then answers within `READY_MS`.
   */
  function armWatchdog(session: Session) {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      session.send('isready');
      watchdog = setTimeout(() => fail(session, 'it stopped answering'), READY_MS);
    }, ANSWER_MS);
  }

  /**
   * Disconnects the connected engine, if any. The search it was running will
   * never finish there: the next engine starts it again, if it's still wanted.
   */
  function disconnect() {
    clearTimeout(watchdog);
    connected = undefined;
    running = undefined;
  }

  /**
   * `session`'s engine crashed or got stuck: if it's still connected,
   * disconnects it, counting it against its search, and has its host start
   * another.
   */
  function fail(session: Session, message: string) {
    if (connected !== session) return;
    console.error(`Stockfish stopped: ${message}`);
    const position = running && !running.stopping ? running.wanted : undefined;
    if (position && ++position.failures >= TRIES) {
      // Most likely this position crashes Stockfish: give up on it rather
      // than restart engines forever, and let the positions behind it run.
      giveUp(position, new Error(`Stockfish stopped ${TRIES} times on this position: ${message}`));
    }
    disconnect();
    session.supervisor.failed();
  }

  function unavailable(error: Error) {
    disconnect();
    unavailableError = error;
    decide();
  }

  return {
    attach,
    watch,
    analysis: (line) => finalAnalysis((watcher) => watch(line, watcher)),
    unavailable,
  };
}

/**
 * Stockfish 19 lite: the evaluation bar, the best-move arrow, the lines past
 * a lesson's guide, every move label, and the `stockfish` opponent, all at the
 * app's budget (`APP_SEARCH`).
 */
export const liteStockfish = createStockfish(APP_SEARCH);

/** Full Stockfish 19, its large network: only the `stockfish-full` opponent (`FULL_SEARCH`). */
export const fullStockfish = createStockfish(FULL_SEARCH);
