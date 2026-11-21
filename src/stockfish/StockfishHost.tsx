import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { readAsset } from '@/files/readAsset';

import { type Connection, liteStockfish, type Stockfish, type Supervisor } from './engine';
import EngineView, { type EngineViewRef } from './EngineView';
import { LOADER, WASM } from './files';
import { FULL_WASM_BYTES } from './fullFiles';
import { useRestarts } from './restarts';

/**
 * Runs Stockfish lite for as long as it's mounted, in a hidden web view
 * (EngineView), and connects it to `liteStockfish`. An engine that
 * crashes, stops answering or can't start gets a new web view. Unmounting it
 * frees the engine and its web view.
 */
export function StockfishHost() {
  return <HiddenHost engine={liteStockfish} />;
}

interface HostProps {
  readonly engine: Stockfish;
  /**
   * Full Stockfish, which the web view downloads itself from `folder`
   * (EngineView's `startFull`), telling `report` how many bytes have arrived
   * (all of them once the files are in hand), or that it failed. Without it,
   * Stockfish lite, whose files the app sends.
   */
  readonly full?: {
    readonly folder: string;
    readonly report: (received: number, failed?: boolean) => void;
  };
}

/**
 * Runs a Stockfish build in a hidden web view while mounted, connected to
 * `engine`, replacing a web view whose engine fails (`useRestarts`).
 */
export function HiddenHost(props: HostProps) {
  const [running, supervisor] = useRestarts();
  return (
    <View pointerEvents="none" style={styles.hidden}>
      {running ? <Engine {...props} supervisor={supervisor} /> : null}
    </View>
  );
}

/**
 * One engine in its own web view. Each restart mounts a new one, with its own
 * ref: Expo's DOM component binds a ref to the first web view it's given.
 */
function Engine({ engine, full, supervisor }: HostProps & { readonly supervisor: Supervisor }) {
  const view = useRef<EngineViewRef>(null);
  const connection = useRef<Connection>(null);
  const stopped = useRef(false);

  // Attached only once the engine has its files, so its time to answer
  // (engine.ts) doesn't run during a download.
  const attach = () => {
    const started = view.current;
    if (!started || stopped.current) return;
    // Expo's ref hands out standalone functions, which need no `this`.
    connection.current = engine.attach(started.send, supervisor);
  };

  // Also runs after the web view's page reloads, which Expo does when the
  // system ends the web view's process. The new engine then takes over the
  // search the old one was running. Lite's files are read each time rather
  // than kept, so choosing Maia frees them too; full Stockfish's come from
  // the web view's cache.
  const onLoad = async () => {
    if (full) {
      view.current?.startFull(full.folder);
      return;
    }
    try {
      const [loader, wasm] = await Promise.all([
        readAsset(LOADER).then((file) => file.text()),
        readAsset(WASM).then((file) => file.base64()),
      ]);
      if (stopped.current) return;
      view.current?.start(loader, wasm);
      attach();
    } catch (error) {
      if (stopped.current) return;
      console.error(error);
      supervisor.failed();
    }
  };
  const onLine = (line: string) => connection.current?.receive(line);
  const onError = (message: string) => {
    if (connection.current) return connection.current.fail(message);
    // Before it started: full Stockfish's files didn't download.
    if (stopped.current) return;
    console.error(message);
    full?.report(0, true);
    supervisor.failed();
  };
  const onStarted = () => {
    full?.report(FULL_WASM_BYTES);
    attach();
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
      onProgress={full?.report}
      onStarted={onStarted}
      dom={{ style: styles.hidden }}
    />
  );
}

const styles = StyleSheet.create({
  // Kept on screen but invisible: a web view that's laid out keeps running.
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
