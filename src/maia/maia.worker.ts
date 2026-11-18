/// <reference lib="webworker" />
import { loadOnce } from './loadOnce';
import { chooseMove } from './maia';
import { parseNetwork } from './network';

/** Asks for Maia's move after `line`, with the network at `url`. */
export interface MaiaRequest {
  readonly id: number;
  readonly url: string;
  readonly line: readonly string[];
}

export type MaiaResponse =
  | { readonly id: number; readonly move: string }
  | { readonly id: number; readonly error: string };

const loadNetwork = loadOnce(async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return parseNetwork(await response.arrayBuffer());
});

self.onmessage = async ({ data }: MessageEvent<MaiaRequest>) => {
  const { id, url, line } = data;
  let reply: MaiaResponse;
  try {
    reply = { id, move: chooseMove(await loadNetwork(url), line) };
  } catch (error) {
    reply = { id, error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(reply);
};
