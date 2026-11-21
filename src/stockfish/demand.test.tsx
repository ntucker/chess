import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'test-renderer';

import { KEEP_MS, StockfishWhileNeeded, useNeedsStockfish } from './demand';

// The settings pick Maia for both, so only screens ask for Stockfish.
const mockSettings: { evaluationEngine: string; opponent: number | string } = {
  evaluationEngine: 'maia',
  opponent: 1500,
};
jest.mock('@/settings/SettingsProvider', () => ({
  useSettings: () => mockSettings,
}));

// How many hosts are mounted now, and how many were ever started.
let hosts = 0;
let starts = 0;
function Host() {
  useEffect(() => {
    hosts += 1;
    starts += 1;
    return () => {
      hosts -= 1;
    };
  }, []);
  return null;
}

// Whether full Stockfish's host is mounted.
let fullHost = false;
function FullHost() {
  useEffect(() => {
    fullHost = true;
    return () => {
      fullHost = false;
    };
  }, []);
  return null;
}

function Screen({ needed }: { readonly needed: boolean }) {
  useNeedsStockfish(needed);
  return null;
}

let root: Root | undefined;
/** Renders one screen per entry, each needing Stockfish or not. */
const render = (screens: readonly boolean[]) =>
  act(async () => {
    root ??= createRoot();
    root.render(
      <StockfishWhileNeeded host={<Host />} fullHost={<FullHost />}>
        {screens.map((needed, n) => (
          <Screen key={n} needed={needed} />
        ))}
      </StockfishWhileNeeded>,
    );
  });

/** Lets `ms` pass. */
const wait = (ms: number) => act(async () => jest.advanceTimersByTime(ms));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  mockSettings.evaluationEngine = 'maia';
  mockSettings.opponent = 1500;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  jest.useRealTimers();
});

describe('StockfishWhileNeeded', () => {
  it('runs Stockfish while a screen needs it, and a minute after', async () => {
    await render([false]);
    expect(hosts).toBe(0);
    await render([true]);
    expect(hosts).toBe(1);
    await render([false]);
    await wait(KEEP_MS - 1);
    expect(hosts).toBe(1);
    await wait(1);
    expect(hosts).toBe(0);
  });

  it('keeps the same engine for a screen that needs it again within the minute', async () => {
    starts = 0;
    await render([true]);
    await render([false]);
    await wait(KEEP_MS - 1);
    await render([true]);
    await wait(KEEP_MS);
    expect(starts).toBe(1);
  });

  it('keeps it running until the last screen that needs it lets go', async () => {
    await render([true, true]);
    expect(hosts).toBe(1);
    await render([true]);
    await wait(KEEP_MS);
    expect(hosts).toBe(1);
    await render([]);
    await wait(KEEP_MS);
    expect(hosts).toBe(0);
  });

  it('runs it while the settings use it, whatever the screens need', async () => {
    mockSettings.evaluationEngine = 'stockfish';
    await render([]);
    expect(hosts).toBe(1);
  });

  it('runs full Stockfish only while it is the opponent, and a minute after', async () => {
    mockSettings.opponent = 'stockfish-full';
    await render([]);
    expect(fullHost).toBe(true);
    expect(hosts).toBe(0);
    mockSettings.opponent = 'stockfish';
    await render([]);
    expect(hosts).toBe(1);
    await wait(KEEP_MS - 1);
    expect(fullHost).toBe(true);
    await wait(1);
    expect(fullHost).toBe(false);
  });
});
