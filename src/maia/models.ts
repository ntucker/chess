import { MaiaNetwork } from './network';
import { readAsset } from './readAsset';

/** Maia's networks, by the rating of the players each was trained on. */
/* eslint-disable @typescript-eslint/no-require-imports -- Metro bundles an asset for each static require. */
const MODELS = {
  1100: require('@/assets/maia/maia-1100.bin'),
  1200: require('@/assets/maia/maia-1200.bin'),
  1300: require('@/assets/maia/maia-1300.bin'),
  1400: require('@/assets/maia/maia-1400.bin'),
  1500: require('@/assets/maia/maia-1500.bin'),
  1600: require('@/assets/maia/maia-1600.bin'),
  1700: require('@/assets/maia/maia-1700.bin'),
  1800: require('@/assets/maia/maia-1800.bin'),
  1900: require('@/assets/maia/maia-1900.bin'),
} as const;
/* eslint-enable @typescript-eslint/no-require-imports */

export type MaiaRating = keyof typeof MODELS;

const loaded = new Map<MaiaRating, Promise<MaiaNetwork>>();

/** Maia's network for `rating`, read from the app's assets the first time. */
export function loadMaia(rating: MaiaRating): Promise<MaiaNetwork> {
  let network = loaded.get(rating);
  if (!network) {
    network = readAsset(MODELS[rating]).then(MaiaNetwork.parse);
    // Forget a failed read, so asking again tries again.
    network.catch(() => loaded.delete(rating));
    loaded.set(rating, network);
  }
  return network;
}
