import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import {
  createWorkletRuntime,
  runOnRuntimeAsync,
  type WorkletRuntime,
} from 'react-native-worklets';

import { loadOnce } from './loadOnce';
import { type MaiaRating, MODELS } from './models';
import { forward, type MaiaNetwork, type NetworkOutput, parseNetwork } from './network';

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
      ((globalThis as MaiaGlobal).maiaNetworks ??= {})[r] = parseNetwork(b);
    },
    rating,
    bytes,
  );
});

/** `forward` for `rating`'s network, run on a background JavaScript runtime. */
export async function runNetwork(rating: MaiaRating, planes: Float32Array): Promise<NetworkOutput> {
  await loadNetwork(rating);
  return runOnRuntimeAsync(
    getRuntime(),
    (r: MaiaRating, input: Float32Array) => {
      'worklet';
      const network = (globalThis as MaiaGlobal).maiaNetworks?.[r];
      if (!network) throw new Error(`Maia ${r} isn't loaded`);
      return forward(network, input);
    },
    rating,
    planes,
  );
}
