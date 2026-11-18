import { beforeEach, describe, expect, it } from "@jest/globals";

import { startStockfishWorker } from "./worker";

// startStockfishWorker against a stand-in Worker and Blob addresses, since
// Jest has neither.
class FakeWorker {
  static last: FakeWorker;
  onmessage?: (event: { data: unknown }) => void;
  onerror?: (event: { message: string }) => void;
  readonly sent: unknown[] = [];
  terminated = false;
  constructor(readonly url: string) {
    FakeWorker.last = this;
  }
  postMessage(message: unknown) {
    this.sent.push(message);
  }
  terminate() {
    this.terminated = true;
  }
}

let live: Set<string>;
let created: number;

beforeEach(() => {
  live = new Set();
  created = 0;
  Object.assign(globalThis, { Worker: FakeWorker });
  URL.createObjectURL = () => {
    const url = `blob:${++created}`;
    live.add(url);
    return url;
  };
  URL.revokeObjectURL = (url: string) => void live.delete(url);
});

const start = (
  onLine: (line: string) => void = () => {},
  onError: (message: string) => void = () => {},
) => startStockfishWorker("loader", new Blob(["wasm"]), onLine, onError);

describe("startStockfishWorker", () => {
  it("passes the WebAssembly address in the hash, and frees both files once the engine prints", () => {
    const lines: string[] = [];
    start((line) => lines.push(line));
    expect(FakeWorker.last.url).toBe(`blob:1#${encodeURIComponent("blob:2")}`);
    expect(live.size).toBe(2);
    FakeWorker.last.onmessage?.({ data: "uciok" });
    expect(lines).toEqual(["uciok"]);
    expect(live.size).toBe(0);
  });

  it("stops a worker that crashes and frees its files before reporting it", () => {
    const reported: string[] = [];
    start(undefined, (message) =>
      reported.push(
        `${message}, stopped: ${FakeWorker.last.terminated}, files: ${live.size}`,
      ),
    );
    FakeWorker.last.onerror?.({ message: "out of memory" });
    expect(reported).toEqual(["out of memory, stopped: true, files: 0"]);
  });

  it("frees nothing it was handed by address", () => {
    startStockfishWorker(
      "loader",
      "https://example.test/stockfish.wasm",
      () => {},
      () => {},
    );
    expect(created).toBe(1);
    FakeWorker.last.onmessage?.({ data: "uciok" });
    expect(live.size).toBe(0);
  });
});
