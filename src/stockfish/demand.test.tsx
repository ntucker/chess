import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { act } from "react";
import { createRoot, type Root } from "test-renderer";

import { StockfishWhileNeeded, useNeedsStockfish } from "./demand";

// The settings pick Maia for both, so only screens ask for Stockfish.
const mockSettings = { evaluationEngine: "maia", opponent: 1500 };
jest.mock("@/settings/SettingsProvider", () => ({
  useSettings: () => mockSettings,
}));

// How many hosts are mounted now.
let mockHosts = 0;
jest.mock("./StockfishHost", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return {
    StockfishHost: () => {
      useEffect(() => {
        mockHosts += 1;
        return () => {
          mockHosts -= 1;
        };
      }, []);
      return null;
    },
  };
});

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
      <StockfishWhileNeeded>
        {screens.map((needed, n) => (
          <Screen key={n} needed={needed} />
        ))}
      </StockfishWhileNeeded>,
    );
  });

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mockSettings.evaluationEngine = "maia";
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
});

describe("StockfishWhileNeeded", () => {
  it("runs Stockfish only while a screen needs it", async () => {
    await render([false]);
    expect(mockHosts).toBe(0);
    await render([true]);
    expect(mockHosts).toBe(1);
    await render([false]);
    expect(mockHosts).toBe(0);
  });

  it("keeps it running until the last screen that needs it lets go", async () => {
    await render([true, true]);
    expect(mockHosts).toBe(1);
    await render([true]);
    expect(mockHosts).toBe(1);
    await render([]);
    expect(mockHosts).toBe(0);
  });

  it("runs it while the settings use it, whatever the screens need", async () => {
    mockSettings.evaluationEngine = "stockfish";
    await render([]);
    expect(mockHosts).toBe(1);
  });
});
