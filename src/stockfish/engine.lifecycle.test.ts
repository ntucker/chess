import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type * as Engine from './engine';

// The engine's start, restart and failure, against scripted engines whose
// every command is recorded and whose every line the test writes.
let engine: typeof Engine;

beforeEach(() => {
  // A fresh engine module, with no engine attached, for each test.
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- reloaded after resetModules
  engine = require('./engine') as typeof Engine;
});

/** A scripted engine: what it was sent, and a way to make it print. */
function scripted() {
  const sent: string[] = [];
  const connection = engine.attachStockfish((command) => sent.push(command));
  return { sent, print: (line: string) => connection.receive(line), connection };
}

const flush = () => new Promise((resolve) => setTimeout(resolve));

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

  it('fails what is waiting, and new requests, until an engine is attached', async () => {
    const evaluation = engine.stockfishEvaluation([]);
    engine.failStockfish(new Error('no engine'));
    await expect(evaluation).rejects.toThrow('no engine');
    await expect(engine.stockfishEvaluation(['d2d4'])).rejects.toThrow('no engine');

    const { print, sent } = scripted();
    const later = engine.stockfishEvaluation(['d2d4']);
    print('uciok');
    expect(sent).toContain('position startpos moves d2d4');
    print('info depth 12 score cp -20');
    print('bestmove d7d5');
    expect((await later).pawns).toBe(0.2);
  });

  it('fails what is waiting when the engine is stopped', async () => {
    const { print, connection } = scripted();
    print('uciok');
    const evaluation = engine.stockfishEvaluation([]);
    connection.detach();
    await expect(evaluation).rejects.toThrow('Stockfish stopped');
    // A stopped engine isn't a failure: the next request waits for an engine.
    let settled = false;
    void engine.stockfishEvaluation([]).finally(() => (settled = true));
    await flush();
    expect(settled).toBe(false);
  });
});
