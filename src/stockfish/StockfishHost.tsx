import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { type Needs, NewVersionError } from '@/files/newVersion';
import { readAsset } from '@/files/readAsset';
import type { ReportDownload } from '@/resources/download';

import { type Connection, liteStockfish, type Stockfish, type Supervisor } from './engine';
import EngineView, { type EngineViewRef } from './EngineView';
import { LOADER, WASM } from './files';
import { useRestarts } from './restarts';

/**
 * Runs Stockfish lite for as long as it's mounted, in a hidden web view
 * (EngineView), and connects it to `liteStockfish`. An engine that
 * crashes, stops answering or can't start gets a new web view. Unmounting it
 * frees the engine and its web view.
 */
export function StockfishHost() {
  return <HiddenHost engine={liteStockfish} start={startLite} />;
}

/**
 * Starts the engine in a web view whose page has loaded, unless `signal`
 * aborts first (the web view went); throws if it can't.
 */
type StartEngine = (view: EngineViewRef, signal: AbortSignal) => Promise<void> | void;

/**
 * Lite's files are read each time rather than kept, so choosing Maia frees
 * them too.
 */
async function startLite(view: EngineViewRef, signal: AbortSignal) {
  const [loader, wasm] = await Promise.all([
    readAsset(LOADER).then((file) => file.text()),
    readAsset(WASM).then((file) => file.base64()),
  ]);
  if (!signal.aborted) view.start(loader, wasm);
}

interface HostProps {
  readonly engine: Stockfish;
  readonly start: StartEngine;
  /** How a download the web view does itself goes (EngineView's `startFull`). */
  readonly onDownload?: ReportDownload;
  /** What the app needs when the engine's files are another build's (`Stockfish.unavailable`). */
  readonly needs?: Needs;
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
function Engine({
  engine,
  start,
  onDownload,
  needs,
  supervisor,
}: HostProps & { readonly supervisor: Supervisor }) {
  const view = useRef<EngineViewRef>(null);
  const connection = useRef<Connection>(null);
  // Aborts when this web view goes, so nothing reaches it or restarts it after.
  const stop = useRef<AbortController>(null);
  const stopped = () => stop.current?.signal.aborted ?? true;

  // Also runs after the web view's page reloads, which Expo does when the
  // system ends the web view's process. The old engine went with it: its
  // search waits, detached, for the new one (`onStarted`), so its time to
  // answer doesn't run out while the new one loads.
  const onLoad = async () => {
    connection.current?.detach();
    connection.current = null;
    const page = view.current;
    if (!page || !stop.current) return;
    try {
      await start(page, stop.current.signal);
    } catch (error) {
      onError(String(error));
    }
  };
  // Attached only once the engine has its files, so its time to answer
  // (engine.ts) doesn't run during a download.
  const onStarted = () => {
    const started = view.current;
    if (!started || stopped()) return;
    // Expo's ref hands out standalone functions, which need no `this`.
    connection.current = engine.attach(started.send, supervisor);
  };
  const onLine = (line: string) => connection.current?.receive(line);
  const onError = (message: string, newVersion?: boolean) => {
    if (connection.current) return connection.current.fail(message);
    // Not attached yet: its files didn't load, or its worker didn't start.
    if (stopped()) return;
    console.error(message);
    // Another build's files: trying again can't help.
    if (newVersion) engine.unavailable(new NewVersionError({ needs }));
    else supervisor.failed();
  };

  useEffect(() => {
    const controller = new AbortController();
    stop.current = controller;
    return () => {
      controller.abort();
      connection.current?.detach();
    };
  }, []);

  return (
    <EngineView
      ref={view}
      onLoad={onLoad}
      onLine={onLine}
      onError={onError}
      onDownload={onDownload}
      onStarted={onStarted}
      dom={{ style: styles.hidden }}
    />
  );
}

const styles = StyleSheet.create({
  // Kept on screen but invisible: a web view that's laid out keeps running.
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
