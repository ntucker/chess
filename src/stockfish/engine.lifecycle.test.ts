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

/** A scripted engine: what it was sent, and a way to make it print. */
function scripted() {
  const sent: string[] = [];
  const connection = engine.attachStockfish((command) => sent.push(command));
  return { sent, print: (line: string) => connection.receive(line), connection };
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
    first.connection.detach(); // It crashed, or Maia was chosen.

    const second = scripted();
    second.print('uciok');
    expect(second.sent).toContain('position startpos moves d2d4');
    // The old engine's score isn't carried over to the new one.
    second.print('bestmove d7d5');
    await expect(evaluation).rejects.toThrow('without a score');
  });

  it('drops a waiting search for a newer one while no engine is connected', async () => {
    const older = engine.stockfishEvaluation(['e2e4']);
    const newer = engine.stockfishEvaluation(['d2d4']);
    await expect(older).rejects.toBeInstanceOf(engine.SupersededError);
    const { print, sent } = scripted();
    print('uciok');
    expect(sent).not.toContain('position startpos moves e2e4');
    print('info depth 12 score cp -20');
    print('bestmove d7d5');
    expect((await newer).pawns).toBe(0.2);
  });
});
