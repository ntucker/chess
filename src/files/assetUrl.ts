import { Asset } from 'expo-asset';

/**
 * The absolute address of a file bundled with the web app (`require`d). A Web
 * Worker may run from a blob: URL, against which a relative one means nothing.
 */
export function assetUrl(module: number): string {
  return new URL(Asset.fromModule(module).uri, location.href).href;
}
