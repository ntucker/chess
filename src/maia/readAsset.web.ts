import { Asset } from 'expo-asset';

/** The bytes of a bundled asset (`require('…')`), fetched from the site. */
export async function readAsset(module: number): Promise<ArrayBuffer> {
  const { uri } = Asset.fromModule(module);
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`${uri}: HTTP ${response.status}`);
  return response.arrayBuffer();
}
