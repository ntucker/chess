/// <reference lib="webworker" />
import { chooseMove, type MaiaNetwork, parseNetwork } from './maia';

/** Asks for Maia's move after `line`, with the network at `url`. */
export interface MaiaRequest {
  readonly id: number;
  readonly url: string;
  readonly line: readonly string[];
}

export type MaiaResponse =
  | { readonly id: number; readonly move: string }
  | { readonly id: number; readonly error: string };

const networks = new Map<string, Promise<MaiaNetwork>>();

async function load(url: string): Promise<MaiaNetwork> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return parseNetwork(await response.arrayBuffer());
}

self.onmessage = async ({ data }: MessageEvent<MaiaRequest>) => {
  const { id, url, line } = data;
  let reply: MaiaResponse;
  try {
    let network = networks.get(url);
    if (!network) {
      network = load(url);
      // Forget a failed download, so asking again tries again.
      network.catch(() => networks.delete(url));
      networks.set(url, network);
    }
    reply = { id, move: chooseMove(await network, line) };
  } catch (error) {
    reply = { id, error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(reply);
};
