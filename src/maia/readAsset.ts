import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

/** The bytes of a bundled asset (`require('…')`), copied to a file first if needed. */
export async function readAsset(module: number): Promise<ArrayBuffer> {
  const asset = await Asset.fromModule(module).downloadAsync();
  return new File(asset.localUri ?? asset.uri).arrayBuffer();
}
