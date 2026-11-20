import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type * as Engine from './engine';

// The engine's start, takeover and stopping, against scripted engines whose
// every command is recorded and whose every line the test writes.
let engine: typeof Engine;

beforeEach(() => {
  // A fresh engine module, with no engine attached, for each test.
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- reloaded after resetModules
  engine = require('./engine') as typeof Engine;
});

/** A scripted engine: what it was sent, a way to make it print, and what it told its host. */
function scripted() {
  const sent: string[] = [];
  const supervisor = { ready: jest.fn(), failed: jest.fn() };
  const connection = engine.attachStockfish((command) => sent.push(command), supervisor);
  return { sent, print: (line: string) => connection.receive(line), connection, supervisor };
}

describe('the engine lifecycle', () => {
  it('runs a search again on an engine that takes over mid-search', async () => {
    const first = scripted();
    first.print('uciok');
    const evaluation = engine.stockfishEvaluation(['e2e4']);
    expect(first.sent).toContain('position startpos moves e2e4');

    // The web view reloads: a new engine is attached without detaching the old.
    const second = scripted();
    first.print('info depth 10 score cp 900'); // The old engine is ignored.
    second.print('uciok');
    expect(second.sent).toContain('position startpos moves e2e4');
    second.print('info depth 12 score cp 30');
    second.print('bestmove e7e5');
    expect((await evaluation).pawns).toBe(-0.3);
  });

  it('keeps what is waiting for the next engine when one stops', async () => {
    const first = scripted();
    first.print('uciok');
    const evaluation = engine.stockfishEvaluation(['d2d4']);
    first.print('info depth 10 score cp 900');
    first.connection.detach(); // Maia was chosen.

    const second = scripted();
    second.print('uciok');
    expect(second.sent).toContain('position startpos moves d2d4');
    // The old engine's score isn't carried over to the new one.
    second.print('bestmove d7d5');
    await expect(evaluation).rejects.toThrow('without a score');
  });

  it('runs the newest waiting search first, then the older ones', async () => {
    const older = engine.stockfishEvaluation(['e2e4']);
    const newer = engine.stockfishEvaluation(['d2d4']);
    const { print, sent } = scripted();
    print('uciok');
    expect(sent.at(-2)).toBe('position startpos moves d2d4');
    print('info depth 12 score cp -20 pv d7d5');
    print('bestmove d7d5');
    expect(await newer).toEqual({ score: expect.any(Number), pawns: 0.2, best: 'd7d5' });
    expect(sent.at(-2)).toBe('position startpos moves e2e4');
    print('info depth 12 score cp -30');
    print('bestmove e7e5');
    expect((await older).pawns).toBe(0.3);
  });

  it('searches for the top moves only once no evaluation waits, ranking three', async () => {
    const top = engine.stockfishTopMoves(['e2e4']);
    const evaluation = engine.stockfishEvaluation(['d2d4']);
    const { print, sent } = scripted();
    print('uciok');
    // The evaluation asked for later runs first, with the engine's one line.
    expect(sent.slice(-3)).toEqual([
      'ucinewgame',
      'position startpos moves d2d4',
      'go nodes 100000 movetime 1500',
    ]);
    print('info depth 12 multipv 1 score cp -20 pv d7d5');
    print('bestmove d7d5');
    await evaluation;
    // Three times the positions, to rank each as deep as an evaluation.
    expect(sent.slice(-3)).toEqual([
      'setoption name MultiPV value 3',
      'position startpos moves e2e4',
      'go nodes 300000 movetime 4500',
    ]);
    print('info depth 10 multipv 1 score cp -30 pv c7c5');
    print('info depth 10 multipv 2 score cp -20 pv e7e5');
    print('info depth 10 multipv 3 score cp -15 pv c7c6');
    print('bestmove c7c5');
    expect((await top).map(({ uci, evaluation }) => [uci, evaluation.pawns])).toEqual([
      ['c7c5', 0.3],
      ['e7e5', 0.2],
      ['c7c6', 0.15],
    ]);

    // The next evaluation sets one line again.
    const next = engine.stockfishEvaluation(['g1f3']);
    expect(sent.slice(-3, -1)).toEqual([
      'setoption name MultiPV value 1',
      'position startpos moves g1f3',
    ]);
    print('info depth 12 multipv 1 score cp 20 pv d7d5');
    print('bestmove d7d5');
    await next;
  });

  it('drops a top-moves search the screen has left, and searches the one it shows once that evaluation has', async () => {
    const older = engine.stockfishEvaluation(['e2e4']);
    const left = engine.stockfishTopMoves(['e2e4', 'e7e5']);
    const leftBehind = expect(left).rejects.toMatchObject({ name: 'AbortError' });
    const shown = engine.stockfishEvaluation(['d2d4', 'd7d5']);
    const current = engine.stockfishTopMoves(['d2d4', 'd7d5']);
    await leftBehind;
    const { print, sent } = scripted();
    print('uciok');
    // The evaluation of the position on screen runs first, so the bar moves
    // before its top moves are ranked. The search that was left never starts.
    expect(sent.join('\n')).not.toContain('e7e5');
    expect(sent).not.toContain('setoption name MultiPV value 3');
    expect(sent.slice(-3)).toEqual([
      'ucinewgame',
      'position startpos moves d2d4 d7d5',
      'go nodes 100000 movetime 1500',
    ]);
    print('info depth 12 score cp 20 pv d2d4');
    print('bestmove d2d4');
    await shown;
    expect(sent.slice(-3, -1)).toEqual([
      'setoption name MultiPV value 3',
      'position startpos moves d2d4 d7d5',
    ]);
    print('info depth 12 multipv 1 score cp 30 pv d7d5');
    print('info depth 12 multipv 2 score cp 10 pv e7e6');
    print('bestmove d7d5');
    await current;
    expect(sent.join('\n')).not.toContain('e2e4 e7e5');
    print('info depth 8 score cp 12 pv e4');
    print('bestmove e2e4');
    await older;
    expect(sent).toContain('setoption name MultiPV value 1');
  });

  it('drops a top-moves search the screen has left before the engine starts it', async () => {
    const left = engine.stockfishTopMoves(['e2e4', 'e7e5']);
    const failed = expect(left).rejects.toMatchObject({ name: 'AbortError' });
    const evaluation = engine.stockfishEvaluation(['d2d4']);
    const current = engine.stockfishTopMoves(['d2d4']);
    await failed;
    const { print, sent } = scripted();
    print('uciok');
    expect(sent.join('\n')).not.toContain('e7e5');
    expect(sent.at(-2)).toBe('position startpos moves d2d4');
    print('info depth 8 score cp 12 pv d4');
    print('bestmove d2d4');
    await evaluation;
    expect(sent).toContain('setoption name MultiPV value 3');
    print('info depth 10 multipv 1 score cp 20 pv d7d5');
    print('bestmove d7d5');
    await current;
  });

  it('stops a top-moves search the screen has left while it runs, and ignores its result', async () => {
    const { print, sent } = scripted();
    print('uciok');
    const left = engine.stockfishTopMoves(['e2e4']);
    const failed = expect(left).rejects.toMatchObject({ name: 'AbortError' });
    expect(sent).toContain('setoption name MultiPV value 3');
    const current = engine.stockfishTopMoves(['d2d4']);
    await failed;
    expect(sent.at(-1)).toBe('stop');
    // The stopped search's bestmove arrives and is discarded; the new one runs.
    print('bestmove e2e4');
    expect(sent.at(-2)).toBe('position startpos moves d2d4');
    print('info depth 10 multipv 1 score cp 20 pv d7d5');
    print('bestmove d7d5');
    await current;
  });

  it('never runs a stopped top-moves search again on the next engine', async () => {
    const first = scripted();
    first.print('uciok');
    const left = engine.stockfishTopMoves(['e2e4']);
    const failed = expect(left).rejects.toMatchObject({ name: 'AbortError' });
    const current = engine.stockfishTopMoves(['d2d4']);
    await failed;
    // The engine crashes before the stopped search answers.
    first.connection.fail('out of memory');
    const second = scripted();
    second.print('uciok');
    expect(second.sent).not.toContain('position startpos moves e2e4');
    expect(second.sent).toContain('position startpos moves d2d4');
    second.print('info depth 10 multipv 1 score cp 20 pv d7d5');
    second.print('bestmove d7d5');
    await current;
  });

  it('sends no MultiPV setting while the number of ranks stays the same', async () => {
    const { print, sent } = scripted();
    print('uciok');
    for (const move of ['e2e4', 'd2d4']) {
      const evaluation = engine.stockfishEvaluation([move]);
      expect(sent.slice(-3)).toEqual([
        'ucinewgame',
        `position startpos moves ${move}`,
        'go nodes 100000 movetime 1500',
      ]);
      print('info depth 12 multipv 1 score cp 20 pv d7d5');
      print('bestmove d7d5');
      await evaluation;
    }
    // The engine starts at one rank, so evaluations never set it.
    expect(sent.filter((command) => command.startsWith('setoption'))).toEqual([]);
  });

  it('restarts an engine that crashes, and runs its search on the next', async () => {
    const first = scripted();
    first.print('uciok');
    expect(first.supervisor.ready).toHaveBeenCalled();
    const evaluation = engine.stockfishEvaluation(['e2e4']);
    first.connection.fail('out of memory');
    expect(first.supervisor.failed).toHaveBeenCalledTimes(1);
    first.connection.fail('again'); // A crash reported twice is one failure.
    expect(first.supervisor.failed).toHaveBeenCalledTimes(1);

    const second = scripted();
    second.print('uciok');
    expect(second.sent).toContain('position startpos moves e2e4');
    second.print('info depth 12 score cp 30');
    second.print('bestmove e7e5');
    expect((await evaluation).pawns).toBe(-0.3);
  });

  it('restarts an engine that stops answering', () => {
    jest.useFakeTimers();
    try {
      // An engine that never finishes its handshake gets 10 s.
      const silent = scripted();
      jest.advanceTimersByTime(9_999);
      expect(silent.supervisor.failed).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(silent.supervisor.failed).toHaveBeenCalledTimes(1);

      const stuck = scripted();
      stuck.print('uciok');
      void engine.stockfishEvaluation(['e2e4']);
      // So does one that thinks but never finishes its search.
      stuck.print('info depth 10 score cp 20');
      jest.advanceTimersByTime(9_999);
      expect(stuck.supervisor.failed).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(stuck.supervisor.failed).toHaveBeenCalledTimes(1);

      // An engine that answers in time isn't failed, nor one that was detached.
      const working = scripted();
      working.print('uciok');
      working.print('info depth 12 score cp 20');
      working.print('bestmove e7e5');
      working.connection.detach();
      jest.advanceTimersByTime(60_000);
      expect(working.supervisor.failed).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('gives up on a search that two engines failed on, and runs the rest', async () => {
    const other = engine.stockfishEvaluation(['d2d4']);
    const crashing = engine.stockfishEvaluation(['e2e4']);
    for (let engines = 0; engines < 2; engines++) {
      const { print, sent, connection } = scripted();
      print('uciok');
      expect(sent.at(-2)).toBe('position startpos moves e2e4');
      connection.fail('out of memory');
    }
    await expect(crashing).rejects.toThrow('Stockfish stopped 2 times on this position');

    const { print, sent } = scripted();
    print('uciok');
    expect(sent.at(-2)).toBe('position startpos moves d2d4');
    print('info depth 12 score cp 30');
    print('bestmove d7d5');
    expect((await other).pawns).toBe(-0.3);
  });
});
