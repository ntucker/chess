import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { readAsset } from '@/files/readAsset';

import { attachStockfish, type Connection, type Supervisor } from './engine';
import EngineView, { type EngineViewRef } from './EngineView';
import { LOADER, WASM } from './files';
import { useRestarts } from './restarts';

/**
 * Runs Stockfish for as long as it's mounted, in a hidden web view
 * (EngineView), and connects it to watchStockfish. An engine that
 * crashes, stops answering or can't start gets a new web view. Unmounting it
 * frees the engine and its web view.
 */
export function StockfishHost() {
  const [running, supervisor] = useRestarts();
  return (
    <View pointerEvents="none" style={styles.hidden}>
      {running ? <Engine supervisor={supervisor} /> : null}
    </View>
  );
}

/**
 * One engine in its own web view. Each restart mounts a new one, with its own
 * ref: Expo's DOM component binds a ref to the first web view it's given.
 */
function Engine({ supervisor }: { readonly supervisor: Supervisor }) {
  const view = useRef<EngineViewRef>(null);
  const connection = useRef<Connection>(null);
  const stopped = useRef(false);

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
      if (!engine || stopped.current) return;
      engine.start(loader, wasm);
      // Expo's ref hands out standalone functions, which need no `this`.
      connection.current = attachStockfish(engine.send, supervisor);
    } catch (error) {
      if (stopped.current) return;
      console.error(error);
      supervisor.failed();
    }
  };
  const onLine = (line: string) => connection.current?.receive(line);
  const onError = (message: string) => connection.current?.fail(message);

  useEffect(() => {
    stopped.current = false;
    return () => {
      stopped.current = true;
      connection.current?.detach();
    };
  }, []);

  return (
    <EngineView
      ref={view}
      onLoad={onLoad}
      onLine={onLine}
      onError={onError}
      dom={{ style: styles.hidden }}
    />
  );
}

const styles = StyleSheet.create({
  // Kept on screen but invisible: a web view that's laid out keeps running.
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
