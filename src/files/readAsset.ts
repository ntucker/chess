import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

/** A file bundled with the app (`require`d), copied to the device if needed. */
export async function readAsset(module: number): Promise<File> {
  const asset = await Asset.fromModule(module).downloadAsync();
  return new File(asset.localUri ?? asset.uri);
}
