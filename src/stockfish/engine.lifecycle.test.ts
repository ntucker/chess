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
    print('info depth 12 score cp -20');
    print('bestmove d7d5');
    expect(await newer).toEqual({ score: expect.any(Number), pawns: 0.2, best: 'd7d5' });
    expect(sent.at(-2)).toBe('position startpos moves e2e4');
    print('info depth 12 score cp -30');
    print('bestmove e7e5');
    expect((await older).pawns).toBe(0.3);
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
      // One that never finishes its handshake gets a minute (the web
      // downloads the WebAssembly meanwhile),
      const silent = scripted();
      jest.advanceTimersByTime(59_999);
      expect(silent.supervisor.failed).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(silent.supervisor.failed).toHaveBeenCalledTimes(1);

      const stuck = scripted();
      stuck.print('uciok');
      void engine.stockfishEvaluation(['e2e4']);
      stuck.print('info depth 10 score cp 20'); // and one thinking, but never done, 10 s.
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
