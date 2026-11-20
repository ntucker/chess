import {
  actionTypes,
  type Controller,
  type Manager,
  type Middleware,
  useQuery,
  useSubscription,
} from '@data-client/react';
import { Endpoint, Entity } from '@data-client/rest';

import {
  type Analysis,
  type AnalysisLine,
  type EvaluationEngine,
  finalAnalysis,
  isFinal,
  resultEvaluation,
  settledAnalysis,
  type Watcher,
} from '@/evaluation/evaluation';
import { lastPosition } from '@/game/replay';
import { maiaEvaluation } from '@/maia/engine';
import { JUDGE_RATING } from '@/maia/maia';
import { watchStockfish } from '@/stockfish/engine';

/**
 * How `engine` judges the position after `moves` (UCI, space-separated): one
 * record per engine and position, whichever screen asks. Stockfish's deepens
 * while its search runs; once `final`, it never changes.
 */
export class PositionAnalysis extends Entity implements Analysis {
  readonly engine: EvaluationEngine = 'stockfish';
  readonly moves: string = '';
  readonly lines: readonly AnalysisLine[] = [];
  readonly depth: number = 0;
  readonly final: boolean = false;

  pk() {
    return `${this.engine} ${this.moves}`;
  }

  static key = 'PositionAnalysis';

  /** A record only deepens: a final one is kept, and so is one deeper than what arrives. */
  static shouldUpdate(
    _existingMeta: unknown,
    _incomingMeta: unknown,
    existing: Analysis,
    incoming: Analysis,
  ) {
    return !existing.final && (incoming.final || incoming.depth > existing.depth);
  }
}

/** Which `PositionAnalysis` holds `engine`'s analysis of the position after `line`. */
export const analysisKey = (engine: EvaluationEngine, line: readonly string[]) => ({
  engine,
  moves: line.join(' '),
});

/**
 * Tells `watcher` how `engine` judges the position after `line`: each deeper
 * depth of Stockfish's search, then its final one (`watchStockfish`). Maia
 * and a finished game (scored by its result: 1, 0.5 or 0) answer final at
 * once. Returns a function that stops watching.
 */
function watchAnalysis(
  engine: EvaluationEngine,
  line: readonly string[],
  watcher: Watcher,
): () => void {
  const { result } = lastPosition(line);
  if (engine === 'stockfish' && !result) return watchStockfish(line, watcher);
  let watching = true;
  (result ? Promise.resolve(resultEvaluation(result)) : maiaEvaluation(JUDGE_RATING, line)).then(
    (evaluation) => {
      if (watching) watcher.update(settledAnalysis(evaluation));
    },
    (error: Error) => {
      if (watching) watcher.fail(error);
    },
  );
  return () => {
    watching = false;
  };
}

/**
 * How `engine` judges the position after `line` (UCI moves from the starting
 * position), once its analysis is final: its best moves, best first, each
 * with how the position stands after it (`Analysis`). Both engines run on
 * the device, off the main thread. A finished game is scored by its result
 * instead (1, 0.5 or 0). Kept for as long as the app runs.
 *
 * - `stockfish`: Stockfish 19 lite (src/stockfish), its three best moves
 *   from one search of the app's budget (`APP_SEARCH`). It needs
 *   StockfishHost mounted.
 * - `maia`: Maia 1900's value head, how players of that rating tend to score
 *   from here (src/maia). One line, with no move.
 *
 * Screens that show an analysis as it deepens read it with `useAnalysis`;
 * this is for what needs the final one, like the Stockfish opponent's move.
 *
 * ```ts
 * const { lines } = await ctrl.fetchIfStale(getAnalysis, 'stockfish', ['e2e4']);
 * ```
 */
export const getAnalysis = new Endpoint(
  async (engine: EvaluationEngine, line: readonly string[]) => ({
    ...analysisKey(engine, line),
    ...(await finalAnalysis((watcher) => watchAnalysis(engine, line, watcher))),
  }),
  { schema: PositionAnalysis, name: 'getAnalysis', dataExpiryLength: Infinity },
);

/**
 * How `engine` judges the position after `line`, as far as it has got: for
 * Stockfish, the deepest depth its search has finished, which updates as it
 * goes deeper until it's `final`. Undefined until the first depth arrives,
 * and while `line` is null, which asks for nothing (a screen that isn't
 * focused, or the first render, which the web export pre-renders and so
 * must not start an engine; asking starts only after rendering).
 *
 * ```ts
 * const analysis = useAnalysis('stockfish', focused ? line : null);
 * const best = analysis?.lines[0].uci;
 * ```
 */
export function useAnalysis(
  engine: EvaluationEngine,
  line: readonly string[] | null,
): Analysis | undefined {
  useSubscription(getAnalysis, ...(line ? ([engine, line] as const) : ([null] as const)));
  return useQuery(PositionAnalysis, ...(line ? [analysisKey(engine, line)] : [null]));
}

/** A position some screen shows (`useAnalysis`), and its search's watch, while it runs. */
interface Shown {
  readonly engine: EvaluationEngine;
  readonly line: readonly string[];
  /** How many screens show it. */
  count: number;
  /** Stops watching Stockfish's search. */
  release?: () => void;
}

/**
 * Runs the analysis of each position a screen shows (`useAnalysis`, through
 * `useSubscription`): it's watched while any screen shows the position, and
 * each deeper depth goes into the store as it arrives, so every screen
 * showing that position updates. The final analysis settles `getAnalysis`
 * too, for anything waiting on it. A position no screen shows any more
 * stops being searched (`watchStockfish`).
 */
export class AnalysisManager implements Manager {
  protected controller!: Controller;
  protected shown = new Map<string, Shown>();
  protected paused = false;

  middleware: Middleware = (controller) => {
    this.controller = controller;
    return (next) => async (action) => {
      if (
        (action.type === actionTypes.SUBSCRIBE || action.type === actionTypes.UNSUBSCRIBE) &&
        action.endpoint === getAnalysis
      ) {
        const [engine, line] = action.args as [EvaluationEngine, readonly string[]];
        if (action.type === actionTypes.SUBSCRIBE) this.show(action.key, engine, line);
        else this.hide(action.key);
        return;
      }
      return next(action);
    };
  };

  init() {
    this.paused = false;
    for (const shown of this.shown.values()) if (!shown.release) this.run(shown);
  }

  cleanup() {
    this.paused = true;
    for (const shown of this.shown.values()) {
      shown.release?.();
      shown.release = undefined;
    }
  }

  protected show(key: string, engine: EvaluationEngine, line: readonly string[]) {
    const shown = this.shown.get(key) ?? { engine, line, count: 0 };
    this.shown.set(key, shown);
    if (++shown.count === 1 && !this.paused) this.run(shown);
  }

  protected hide(key: string) {
    const shown = this.shown.get(key);
    if (!shown || --shown.count > 0) return;
    shown.release?.();
    this.shown.delete(key);
  }

  /** Starts `shown`'s analysis, unless the store has its final one. */
  protected run(shown: Shown) {
    const { controller: ctrl } = this;
    const { engine, line } = shown;
    const key = analysisKey(engine, line);
    if (isFinal(ctrl.get(PositionAnalysis, key, ctrl.getState()))) return;
    shown.release = watchAnalysis(engine, line, {
      update(analysis) {
        const record = { ...key, ...analysis };
        if (analysis.final) ctrl.setResponse(getAnalysis, engine, line, record);
        else ctrl.set(PositionAnalysis, key, record);
      },
      // The screen keeps the last depth it showed; a later visit asks again.
      fail(error) {
        console.error(error);
      },
    });
  }
}
