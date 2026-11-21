import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'test-renderer';

import { type Connection, fullStockfish } from './engine';
import type EngineView from './EngineView';
import { FullStockfishHost } from './FullStockfishHost';

/** The props the host last gave its hidden web view. */
let view: Parameters<typeof EngineView>[0];
jest.mock('./EngineView', () => {
  const { useImperativeHandle } = jest.requireActual<typeof import('react')>('react');
  return function EngineViewMock(props: Parameters<typeof EngineView>[0]) {
    view = props;
    useImperativeHandle(props.ref, () => ({ start() {}, startFull() {}, send() {} }));
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
});

describe('HiddenHost', () => {
  it('detaches the engine when its web view reloads, until the new one starts', async () => {
    const connections: jest.Mocked<Connection>[] = [];
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

    // The system ended the web view's process, and its page loads again.
    await act(async () => view.onLoad());
    expect(connections[0].detach).toHaveBeenCalled();
    // A failure while the new page loads restarts the host, not the old engine.
    view.onError('download failed');
    expect(connections[0].fail).not.toHaveBeenCalled();

    act(() => view.onStarted());
    expect(connections).toHaveLength(2);
  });
});
