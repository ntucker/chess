/// <reference lib="webworker" />
import { loadOnce } from './loadOnce';
import { parseNetwork, policyLogits } from './network';

/** Asks for the policy output for `planes`, from the network at `url`. */
export interface MaiaRequest {
  readonly id: number;
  readonly url: string;
  readonly planes: Float32Array;
}

export type MaiaResponse =
  | { readonly id: number; readonly logits: Float32Array }
  | { readonly id: number; readonly error: string };

const loadNetwork = loadOnce(async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return parseNetwork(await response.arrayBuffer());
});

self.onmessage = async ({ data }: MessageEvent<MaiaRequest>) => {
  const { id, url, planes } = data;
  try {
    const logits = policyLogits(await loadNetwork(url), planes);
    self.postMessage({ id, logits } satisfies MaiaResponse, [logits.buffer]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ id, error: message } satisfies MaiaResponse);
  }
};
