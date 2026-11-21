import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { readAsset } from '@/files/readAsset';
import { useReportFullStockfishDownload } from '@/resources/download';

import { type Connection, fullStockfish, liteStockfish, type Supervisor } from './engine';
import EngineView, { type EngineViewRef } from './EngineView';
import { LOADER, WASM } from './files';
import { LIVE_FOLDER } from './fullFiles';
import { useRestarts } from './restarts';

/**
 * Runs Stockfish lite for as long as it's mounted, in a hidden web view
 * (EngineView), and connects it to `liteStockfish`. An engine that
 * crashes, stops answering or can't start gets a new web view. Unmounting it
 * frees the engine and its web view.
 */
export function StockfishHost() {
  return <HiddenHost />;
}

/**
 * Runs a Stockfish build in a hidden web view while mounted, connected to its
 * engine, replacing a web view whose engine fails (`useRestarts`): Stockfish
 * lite, whose files the app sends, or with `full`, full Stockfish, which the
 * web view downloads itself from the live site (EngineView's `startFull`),
 * reporting the download to the store (`Download`).
 */
export function HiddenHost({ full = false }: { readonly full?: boolean }) {
  const [running, supervisor] = useRestarts();
  return (
    <View pointerEvents="none" style={styles.hidden}>
      {running ? <Engine full={full} supervisor={supervisor} /> : null}
    </View>
  );
}

/**
 * One engine in its own web view. Each restart mounts a new one, with its own
 * ref: Expo's DOM component binds a ref to the first web view it's given.
 */
function Engine({ full, supervisor }: { readonly full: boolean; readonly supervisor: Supervisor }) {
  const engine = full ? fullStockfish : liteStockfish;
  const report = useReportFullStockfishDownload();
  const view = useRef<EngineViewRef>(null);
  const connection = useRef<Connection>(null);
  const stopped = useRef(false);

  // Also runs after the web view's page reloads, which Expo does when the
  // system ends the web view's process. The new engine then takes over the
  // search the old one was running. Lite's files are read each time rather
  // than kept, so choosing Maia frees them too; full Stockfish's come from
  // the web view's cache.
  const onLoad = async () => {
    if (full) {
      view.current?.startFull(LIVE_FOLDER);
      return;
    }
    try {
      const [loader, wasm] = await Promise.all([
        readAsset(LOADER).then((file) => file.text()),
        readAsset(WASM).then((file) => file.base64()),
      ]);
      if (stopped.current) return;
      view.current?.start(loader, wasm);
    } catch (error) {
      if (stopped.current) return;
      console.error(error);
      supervisor.failed();
    }
  };
  // Attached only once the engine has its files, so its time to answer
  // (engine.ts) doesn't run during a download.
  const onStarted = () => {
    const started = view.current;
    if (!started || stopped.current) return;
    // Expo's ref hands out standalone functions, which need no `this`.
    connection.current = engine.attach(started.send, supervisor);
  };
  const onLine = (line: string) => connection.current?.receive(line);
  const onError = (message: string) => {
    if (connection.current) return connection.current.fail(message);
    // Not attached yet: its files didn't load, or its worker didn't start.
    if (stopped.current) return;
    console.error(message);
    supervisor.failed();
  };

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
      onDownload={report}
      onStarted={onStarted}
      dom={{ style: styles.hidden }}
    />
  );
}

const styles = StyleSheet.create({
  // Kept on screen but invisible: a web view that's laid out keeps running.
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
