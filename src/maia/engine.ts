import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { createWorkletRuntime, runOnRuntimeAsync, type WorkletRuntime } from 'react-native-worklets';

import { loadOnce } from './loadOnce';
import { bestMove, prepareMove } from './maia';
import { type MaiaRating, MODELS } from './models';
import { type MaiaNetwork, parseNetwork, policyLogits } from './network';

/**
 * Where the networks live on the background runtime: each rating's network
 * is parsed there once and kept, so only a move's input and output cross
 * threads.
 */
interface MaiaGlobal {
  maiaNetworks?: Partial<Record<MaiaRating, MaiaNetwork>>;
}

let runtime: WorkletRuntime | undefined;
const getRuntime = () => (runtime ??= createWorkletRuntime({ name: 'maia' }));

/** Reads `rating`'s network from the app's assets into the background runtime. */
const loadNetwork = loadOnce(async (rating: MaiaRating) => {
  const asset = await Asset.fromModule(MODELS[rating]).downloadAsync();
  const bytes = await new File(asset.localUri ?? asset.uri).arrayBuffer();
  await runOnRuntimeAsync(
    getRuntime(),
    (r: MaiaRating, b: ArrayBuffer) => {
      'worklet';
      const scope = globalThis as MaiaGlobal;
      scope.maiaNetworks = { ...scope.maiaNetworks, [r]: parseNetwork(b) };
    },
    rating,
    bytes,
  );
});

/**
 * Maia's move after `line` (see `chooseMove`). The network runs on a
 * background JavaScript runtime, so the app keeps responding while it works;
 * the rules (cheap) stay on this thread.
 */
export async function maiaMove(rating: MaiaRating, line: readonly string[]): Promise<string> {
  await loadNetwork(rating);
  const { pos, planes } = prepareMove(line);
  const logits = await runOnRuntimeAsync(
    getRuntime(),
    (r: MaiaRating, input: Float32Array) => {
      'worklet';
      const network = (globalThis as MaiaGlobal).maiaNetworks?.[r];
      if (!network) throw new Error(`Maia ${r} isn't loaded`);
      return policyLogits(network, input);
    },
    rating,
    planes,
  );
  return bestMove(pos, logits);
}
