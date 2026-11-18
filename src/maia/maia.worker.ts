/// <reference lib="webworker" />
import { loadOnce } from './loadOnce';
import { forward, type NetworkOutput, parseNetwork } from './network';

/** Asks for the network at `url`'s output for `planes`. */
export interface MaiaRequest {
  readonly id: number;
  readonly url: string;
  readonly planes: Float32Array;
}

export type MaiaResponse =
  | { readonly id: number; readonly output: NetworkOutput }
  | { readonly id: number; readonly error: string };

const loadNetwork = loadOnce(async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return parseNetwork(await response.arrayBuffer());
});

self.onmessage = async ({ data }: MessageEvent<MaiaRequest>) => {
  const { id, url, planes } = data;
  try {
    const output = forward(await loadNetwork(url), planes);
    self.postMessage({ id, output } satisfies MaiaResponse, [
      output.policy.buffer,
      output.wdl.buffer,
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ id, error: message } satisfies MaiaResponse);
  }
};
