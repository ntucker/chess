import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { Analysis } from '@/evaluation/evaluation';

import type * as Engine from './engine';

// The engine's scheduling, takeover and stopping, against scripted engines
// whose every command is recorded and whose every line the test writes.
let engine: typeof Engine;
/** The test's engines, detached after it so no answer timer outlives it. */
const connections: Engine.Connection[] = [];

beforeEach(() => {
  // A fresh engine module, with no engine attached, for each test.
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- reloaded after resetModules
  engine = require('./engine') as typeof Engine;
});

afterEach(() => {
  for (const connection of connections.splice(0)) connection.detach();
});

/** Lets the engine decide what to search (it decides once the current task is done). */
const decided = () => new Promise((resolve) => setTimeout(resolve));

/** A scripted engine: what it was sent, a way to make it print, and what it told its host. */
function scripted() {
  const sent: string[] = [];
  const supervisor = { ready: jest.fn(), failed: jest.fn() };
  const connection = engine.liteStockfish.attach((command) => sent.push(command), supervisor);
  connections.push(connection);
  const print = (line: string) => connection.receive(line);
  /** Prints a finished depth: one line for each move, best first, centipawns falling by 10. */
  const depth = (depth: number, nodes: number, moves: string[], centipawns = 30) =>
    moves.forEach((move, i) =>
      print(
        `info depth ${depth} multipv ${i + 1} score cp ${centipawns - 10 * i} nodes ${nodes} pv ${move}`,
      ),
    );
  /** The position being searched, from its `position` command. */
  const searching = () => sent.findLast((command) => command.startsWith('position'));
  return { sent, print, depth, searching, connection, supervisor };
}

/** Watches the position after `line`, recording what the watcher is told. */
function watch(line: string[], options?: Engine.WatchOptions) {
  const updates: Analysis[] = [];
  const failures: Error[] = [];
  const release = engine.liteStockfish.watch(
    line,
    {
      update: (analysis) => updates.push(analysis),
      fail: (error) => failures.push(error),
    },
    options,
  );
  /** Each update as its depth, its moves, and whether it's final. */
  const told = () =>
    updates.map(({ depth, lines, final }) => [depth, lines.map(({ uci }) => uci), final]);
  return { updates, failures, release, told };
}

const REPLIES = ['e7e5', 'c7c5', 'e7e6'];

describe('the engine lifecycle', () => {
  it('ranks three moves in every search, and limits it by nodes only', async () => {
    const { print, sent } = scripted();
    print('uciok');
    watch(['e2e4']);
    await decided();
    expect(sent).toEqual([
      'uci',
      'setoption name MultiPV value 3',
      'ucinewgame',
      'position startpos moves e2e4',
      'go nodes 2000000',
    ]);
  });

  it('tells each finished depth as it arrives, then the deepest as final', async () => {
    const { print, depth } = scripted();
    print('uciok');
    const watched = watch(['e2e4']);
    await decided();
    depth(10, 50_000, REPLIES);
    depth(11, 90_000, ['c7c5', 'e7e5', 'e7e6']);
    // Where the node limit stops it, the set it prints mixes two depths: ignored.
    print('info depth 12 multipv 1 score cp 20 nodes 2000100 pv c7c5');
    print('info depth 11 multipv 2 score cp 10 nodes 2000100 pv e7e5');
    print('info depth 11 multipv 3 score cp 0 nodes 2000100 pv e7e6');
    print('bestmove c7c5 ponder g1f3');
    expect(watched.told()).toEqual([
      [10, REPLIES, false],
      [11, ['c7c5', 'e7e5', 'e7e6'], false],
      [11, ['c7c5', 'e7e5', 'e7e6'], true],
    ]);
    // Scores are White's: Black to move, 30 centipawns for Black.
    expect(watched.updates[2].lines[0].evaluation.pawns).toBe(-0.3);
  });

  it('ranks only the legal moves where fewer than three are', async () => {
    const { print, depth } = scripted();
    print('uciok');
    // 1.e4 f6 2.Qh5+: only g6 is legal.
    const watched = watch(['e2e4', 'f7f6', 'd1h5']);
    await decided();
    depth(10, 9_000, ['g7g6']);
    print('bestmove g7g6');
    expect(watched.told()).toEqual([
      [10, ['g7g6'], false],
      [10, ['g7g6'], true],
    ]);
  });

  it('fails a search that ends without a finished depth', async () => {
    const { print } = scripted();
    print('uciok');
    const watched = watch(['e2e4']);
    await decided();
    print('info depth 10 multipv 1 score cp 20 lowerbound nodes 2000050 pv e7e5');
    print('bestmove e7e5');
    expect(watched.failures.map(({ message }) => message)).toEqual([
      'Stockfish finished without a score',
    ]);
  });

  it('searches the newest position asked for, then the older ones', async () => {
    const older = watch(['e2e4']);
    const newer = watch(['d2d4']);
    const { print, depth, searching } = scripted();
    print('uciok');
    expect(searching()).toBe('position startpos moves d2d4');
    depth(10, 50_000, ['d7d5', 'g8f6', 'e7e6']);
    print('bestmove d7d5');
    expect(newer.updates.at(-1)?.final).toBe(true);
    expect(searching()).toBe('position startpos moves e2e4');
    depth(10, 50_000, REPLIES);
    print('bestmove e7e5');
    expect(older.updates.at(-1)?.final).toBe(true);
  });

  it('searches a position asked for behind the others last, and never stops one for it', async () => {
    const { print, depth, sent, searching } = scripted();
    print('uciok');
    const board = watch(['e2e4']);
    await decided();
    const behind = watch(['d2d4'], { behind: true });
    await decided();
    expect(sent).not.toContain('stop');
    // Asked for after it, but still behind the one asked for since.
    const later = watch(['c2c4']);
    await decided();
    expect(sent.at(-1)).toBe('stop');
    print('bestmove e7e5');
    expect(searching()).toBe('position startpos moves c2c4');
    depth(10, 50_000, ['e7e5', 'g8f6', 'c7c5']);
    print('bestmove e7e5');
    expect(searching()).toBe('position startpos moves e2e4');
    depth(10, 50_000, REPLIES);
    print('bestmove e7e5');
    expect(searching()).toBe('position startpos moves d2d4');
    depth(10, 50_000, ['d7d5', 'g8f6', 'e7e6']);
    print('bestmove d7d5');
    expect([board, later, behind].map(({ updates }) => updates.at(-1)?.final)).toEqual([
      true,
      true,
      true,
    ]);
  });

  it('keeps the place of a position already watched when it is asked for behind', async () => {
    const { print, searching } = scripted();
    watch(['e2e4']);
    watch(['d2d4']);
    watch(['d2d4'], { behind: true });
    print('uciok');
    expect(searching()).toBe('position startpos moves d2d4');
  });

  it('stops for a newer position, and starts the older one again from the beginning', async () => {
    const { print, depth, sent, searching } = scripted();
    print('uciok');
    const older = watch(['e2e4']);
    await decided();
    depth(10, 50_000, REPLIES);
    const newer = watch(['d2d4']);
    await decided();
    expect(sent.at(-1)).toBe('stop');
    // Nothing new starts until the stopped search answers, and what it prints meanwhile is ignored.
    depth(11, 90_000, REPLIES);
    expect(searching()).toBe('position startpos moves e2e4');
    print('bestmove e7e5');
    expect(searching()).toBe('position startpos moves d2d4');
    depth(10, 50_000, ['d7d5', 'g8f6', 'e7e6']);
    print('bestmove d7d5');
    expect(newer.updates.at(-1)?.final).toBe(true);

    // The older position's search starts over, repeating what it found:
    // its watcher hears only the depths past those.
    expect(sent.filter((command) => command === 'position startpos moves e2e4')).toHaveLength(2);
    depth(10, 50_000, REPLIES);
    depth(11, 90_000, REPLIES);
    print('bestmove e7e5');
    expect(older.told()).toEqual([
      [10, REPLIES, false],
      [11, REPLIES, false],
      [11, REPLIES, true],
    ]);
  });

  it('stops a search nobody watches any more, and never starts it again', async () => {
    const { print, sent } = scripted();
    print('uciok');
    const left = watch(['e2e4']);
    await decided();
    left.release();
    await decided();
    expect(sent.at(-1)).toBe('stop');
    print('bestmove e7e5');
    await decided();
    expect(sent.filter((command) => command.startsWith('position'))).toHaveLength(1);
    expect(left.updates).toEqual([]);
  });

  it('keeps searching a position one render stops and starts watching again', async () => {
    const { print, sent } = scripted();
    print('uciok');
    const first = watch(['e2e4']);
    await decided();
    first.release();
    watch(['e2e4']);
    await decided();
    expect(sent).not.toContain('stop');
  });

  it('searches a position once for every watcher', async () => {
    const { print, depth, sent } = scripted();
    print('uciok');
    const bar = watch(['e2e4']);
    const label = engine.liteStockfish.analysis(['e2e4']);
    await decided();
    depth(10, 50_000, REPLIES);
    print('bestmove e7e5');
    expect((await label).lines.map(({ uci }) => uci)).toEqual(REPLIES);
    expect(bar.updates.at(-1)).toEqual(await label);
    expect(sent.filter((command) => command.startsWith('position'))).toHaveLength(1);
  });

  it('runs a search again on an engine that takes over mid-search', async () => {
    const first = scripted();
    first.print('uciok');
    const watched = watch(['e2e4']);
    await decided();
    expect(first.searching()).toBe('position startpos moves e2e4');

    // The web view reloads: a new engine is attached without detaching the old.
    const second = scripted();
    first.depth(10, 50_000, ['a7a6', 'h7h6', 'g7g5']); // The old engine is ignored.
    second.print('uciok');
    expect(second.searching()).toBe('position startpos moves e2e4');
    second.depth(10, 50_000, REPLIES);
    second.print('bestmove e7e5');
    expect(watched.told()).toEqual([
      [10, REPLIES, false],
      [10, REPLIES, true],
    ]);
  });

  it('keeps what is watched for the next engine when one is detached', async () => {
    const first = scripted();
    first.print('uciok');
    const watched = watch(['d2d4']);
    await decided();
    first.connection.detach(); // Maia was chosen.
    const second = scripted();
    second.print('uciok');
    expect(second.searching()).toBe('position startpos moves d2d4');
    expect(watched.failures).toEqual([]);
  });

  it('restarts an engine that crashes, and runs its search on the next', async () => {
    const first = scripted();
    first.print('uciok');
    expect(first.supervisor.ready).toHaveBeenCalled();
    const watched = watch(['e2e4']);
    await decided();
    first.connection.fail('out of memory');
    expect(first.supervisor.failed).toHaveBeenCalledTimes(1);
    first.connection.fail('again'); // A crash reported twice is one failure.
    expect(first.supervisor.failed).toHaveBeenCalledTimes(1);

    const second = scripted();
    second.print('uciok');
    second.depth(10, 50_000, REPLIES);
    second.print('bestmove e7e5');
    expect(watched.updates.at(-1)?.final).toBe(true);
  });

  it('restarts an engine that goes quiet and then ignores isready', async () => {
    jest.useFakeTimers();
    try {
      // An engine that never finishes its handshake is asked after 10 s, and gets 3 s more.
      const silent = scripted();
      jest.advanceTimersByTime(9_999);
      expect(silent.sent).toEqual(['uci']);
      jest.advanceTimersByTime(1);
      expect(silent.sent).toEqual(['uci', 'isready']);
      jest.advanceTimersByTime(2_999);
      expect(silent.supervisor.failed).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(silent.supervisor.failed).toHaveBeenCalledTimes(1);

      // A search is asked 10 s after each line it prints.
      const stuck = scripted();
      stuck.print('uciok');
      const watched = watch(['e2e4']);
      await Promise.resolve();
      jest.advanceTimersByTime(9_000);
      stuck.depth(10, 50_000, REPLIES);
      jest.advanceTimersByTime(9_999);
      expect(stuck.sent.at(-1)).toBe('go nodes 2000000');
      jest.advanceTimersByTime(1);
      expect(stuck.sent.at(-1)).toBe('isready');
      // One that answers keeps searching, however long its depth takes, and
      // is asked again 10 s later; this one never answers again.
      stuck.print('readyok');
      jest.advanceTimersByTime(12_999);
      expect(stuck.supervisor.failed).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(stuck.supervisor.failed).toHaveBeenCalledTimes(1);

      // One that answers every isready but never gets on with its search
      // most likely lost the `go`: its sixth answer in a row fails it.
      const lost = scripted();
      lost.print('uciok');
      for (let answers = 1; answers < 6; answers++) {
        jest.advanceTimersByTime(10_000);
        lost.print('readyok');
      }
      expect(lost.supervisor.failed).not.toHaveBeenCalled();
      jest.advanceTimersByTime(10_000);
      lost.print('readyok');
      expect(lost.supervisor.failed).toHaveBeenCalledTimes(1);

      // Any other line starts the count again.
      const slow = scripted();
      slow.print('uciok');
      const slowWatched = watch(['g1f3']);
      // Fake timers hold the decision's microtask too.
      jest.advanceTimersByTime(0);
      expect(slow.searching()).toBe('position startpos moves g1f3');
      for (let answers = 1; answers < 6; answers++) {
        jest.advanceTimersByTime(10_000);
        slow.print('readyok');
      }
      slow.depth(11, 60_000, REPLIES);
      for (let answers = 1; answers < 6; answers++) {
        jest.advanceTimersByTime(10_000);
        slow.print('readyok');
      }
      expect(slow.supervisor.failed).not.toHaveBeenCalled();
      slowWatched.release();

      // An idle engine isn't failed, nor one that was detached.
      watched.release();
      await Promise.resolve();
      const idle = scripted();
      idle.print('uciok');
      jest.advanceTimersByTime(60_000);
      expect(idle.supervisor.failed).not.toHaveBeenCalled();
      idle.connection.detach();
      jest.advanceTimersByTime(60_000);
      expect(idle.supervisor.failed).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('gives up on a position two engines failed on, and runs the rest', async () => {
    const other = watch(['d2d4']);
    const crashing = watch(['e2e4']);
    for (let engines = 0; engines < 2; engines++) {
      const { print, searching, connection } = scripted();
      print('uciok');
      expect(searching()).toBe('position startpos moves e2e4');
      connection.fail('out of memory');
    }
    expect(crashing.failures.map(({ message }) => message)).toEqual([
      'Stockfish stopped 2 times on this position: out of memory',
    ]);

    const { print, searching } = scripted();
    print('uciok');
    expect(searching()).toBe('position startpos moves d2d4');
    expect(other.failures).toEqual([]);
  });

  it('fails what is watched while no engine can start, until one attaches', async () => {
    const before = watch(['e2e4']);
    const outdated = new Error('another build');
    engine.liteStockfish.unavailable(outdated);
    expect(before.failures).toEqual([outdated]);
    const after = watch(['d2d4']);
    await decided();
    expect(after.failures).toEqual([outdated]);

    const { print, searching } = scripted();
    print('uciok');
    const attached = watch(['c2c4']);
    await decided();
    expect(searching()).toBe('position startpos moves c2c4');
    expect(attached.failures).toEqual([]);
  });
});
