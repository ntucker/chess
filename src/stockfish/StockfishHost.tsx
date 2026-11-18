import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { readAsset } from '@/files/readAsset';

import { attachStockfish, type Connection, failStockfish } from './engine';
import EngineView, { type EngineViewRef } from './EngineView';
import { LOADER, WASM } from './files';

/**
 * Runs Stockfish for as long as it's mounted, in a hidden web view
 * (EngineView), and connects it to stockfishEvaluation. Unmounting it frees
 * the engine and its web view.
 */
export function StockfishHost() {
  const view = useRef<EngineViewRef>(null);
  const connection = useRef<Connection>(null);
  const unmounted = useRef(false);

  const fail = (error: Error) => {
    if (unmounted.current) return;
    console.error(error);
    failStockfish(error);
  };
  // Also runs after the web view's page reloads, which Expo does when the
  // system ends the web view's process. The new engine then takes over the
  // search the old one was running. The files are read each time rather
  // than kept, so choosing Maia frees them too.
  const onLoad = async () => {
    try {
      const [loader, wasm] = await Promise.all([
        readAsset(LOADER).then((file) => file.text()),
        readAsset(WASM).then((file) => file.base64()),
      ]);
      const engine = view.current;
      if (!engine || unmounted.current) return;
      engine.start(loader, wasm);
      connection.current = attachStockfish((command) => engine.send(command));
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  };
  const onLine = (line: string) => connection.current?.receive(line);
  const onError = (message: string) => fail(new Error(message));

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      connection.current?.detach();
    };
  }, []);

  return (
    <View pointerEvents="none" style={styles.hidden}>
      <EngineView
        ref={view}
        onLoad={onLoad}
        onLine={onLine}
        onError={onError}
        dom={{ style: styles.hidden }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Kept on screen but invisible: a web view that's laid out keeps running.
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
