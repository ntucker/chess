import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

import { chooseMove, MaiaNetwork } from './maia';
import { type MaiaRating, MODELS } from './models';

const loaded = new Map<MaiaRating, Promise<MaiaNetwork>>();

async function readNetwork(rating: MaiaRating): Promise<MaiaNetwork> {
  const asset = await Asset.fromModule(MODELS[rating]).downloadAsync();
  return MaiaNetwork.parse(await new File(asset.localUri ?? asset.uri).arrayBuffer());
}

/**
 * Maia's move after `line` (see `chooseMove`). The network for `rating` is
 * read from the app's assets the first time it is asked for.
 */
export async function maiaMove(rating: MaiaRating, line: readonly string[]): Promise<string> {
  let network = loaded.get(rating);
  if (!network) {
    network = readNetwork(rating);
    // Forget a failed read, so asking again tries again.
    network.catch(() => loaded.delete(rating));
    loaded.set(rating, network);
  }
  return chooseMove(await network, line);
}
