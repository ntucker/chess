import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'test-renderer';

import { NewVersionError } from '@/files/newVersion';

import { type Connection, fullStockfish } from './engine';
import type EngineView from './EngineView';
import { FullStockfishHost } from './FullStockfishHost';

/** The props the host last gave its hidden web view, and how many it has mounted. */
let view: Parameters<typeof EngineView>[0];
let views = 0;
jest.mock('./EngineView', () => {
  const { useEffect, useImperativeHandle } = jest.requireActual<typeof import('react')>('react');
  return function EngineViewMock(props: Parameters<typeof EngineView>[0]) {
    view = props;
    useImperativeHandle(props.ref, () => ({ start() {}, startFull() {}, send() {} }));
    useEffect(() => {
      views += 1;
    }, []);
    return null;
  };
});
jest.mock('@/resources/download', () => ({ useReportFullStockfishDownload: () => () => {} }));
// Lite's asset files, which the host's module names but this test never loads.
jest.mock('./files', () => ({ LOADER: 0, WASM: 0 }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
afterEach(async () => {
  await act(async () => root.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});

/** Connections to full Stockfish, in the order the host attached them. */
let connections: jest.Mocked<Connection>[];

/** Mounts the host, and starts its engine as its web view's first page loads. */
async function startHost() {
  connections = [];
  views = 0;
  jest.spyOn(fullStockfish, 'attach').mockImplementation(() => {
    const connection = { receive: jest.fn(), detach: jest.fn(), fail: jest.fn() };
    connections.push(connection);
    return connection;
  });
  await act(async () => {
    root = createRoot();
    root.render(<FullStockfishHost />);
  });
  await act(async () => view.onLoad());
  act(() => view.onStarted());
  expect(connections).toHaveLength(1);
}

/** The system ended the web view's process, and its page loads again. */
const reload = () => act(async () => view.onLoad());

describe('FullStockfishHost', () => {
  it('detaches the engine when its web view reloads, until the new one starts', async () => {
    await startHost();
    await reload();
    expect(connections[0].detach).toHaveBeenCalled();
    act(() => view.onStarted());
    expect(connections).toHaveLength(2);
  });

  it('restarts the host, not the old engine, when the reloaded page fails', async () => {
    jest.useFakeTimers();
    await startHost();
    await reload();
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    act(() => view.onError('download failed'));
    expect(logged).toHaveBeenCalledWith('download failed');
    expect(connections[0].fail).not.toHaveBeenCalled();
    // A new web view after the first restart's pause.
    await act(async () => jest.advanceTimersByTime(1000));
    expect(views).toBe(2);
  });

  it('fails what is asked of the engine, and stops, when the site serves a newer build', async () => {
    jest.useFakeTimers();
    await startHost();
    await reload();
    const unavailable = jest.spyOn(fullStockfish, 'unavailable').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    act(() => view.onError('NewVersionError: A new version is out.', true));
    const [error] = unavailable.mock.calls[0];
    expect(error).toBeInstanceOf(NewVersionError);
    expect((error as NewVersionError).needs).toBe('an app update');
    await act(async () => jest.advanceTimersByTime(60_000));
    expect(views).toBe(1);
  });
});
