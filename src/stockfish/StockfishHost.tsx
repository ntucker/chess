import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { attachStockfish, type Connection } from './engine';
import EngineView, { type EngineViewRef } from './EngineView';
import { LOADER, WASM } from './files';

async function readFile(module: number): Promise<File> {
  const { localUri } = await Asset.fromModule(module).downloadAsync();
  if (!localUri) throw new Error('Stockfish is missing from the app');
  return new File(localUri);
}

let files: Promise<{ loader: string; wasm: string }> | undefined;

/** The engine's files, read from the app's assets once (again after a failure). */
function engineFiles() {
  files ??= Promise.all([readFile(LOADER), readFile(WASM)]).then(
    async ([loader, wasm]) => ({ loader: await loader.text(), wasm: await wasm.base64() }),
  );
  files.catch(() => (files = undefined));
  return files;
}

/**
 * Runs Stockfish for as long as it's mounted, in a hidden web view
 * (EngineView), and connects it to stockfishEvaluation. Unmounting it frees
 * the engine and its web view.
 */
export function StockfishHost() {
  const view = useRef<EngineViewRef>(null);
  const connection = useRef<Connection>(null);

  // Also runs after the web view's page reloads, which Expo does when the
  // system ends the web view's process.
  const onLoad = async () => {
    const { loader, wasm } = await engineFiles();
    const engine = view.current;
    if (!engine) return;
    engine.start(loader, wasm);
    connection.current?.detach();
    connection.current = attachStockfish((command) => engine.send(command));
  };
  const onLine = (line: string) => connection.current?.receive(line);

  useEffect(() => () => connection.current?.detach(), []);

  return (
    <View pointerEvents="none" style={styles.hidden}>
      <EngineView ref={view} onLoad={onLoad} onLine={onLine} dom={{ style: styles.hidden }} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Kept on screen but invisible: a web view that's laid out keeps running.
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
