import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { NEW_VERSION, NewVersionError } from '@/files/newVersion';

import EngineView, { type EngineViewRef } from './EngineView';
import { loadFullStockfish } from './full';

// Expo's DOM bridge, which a DOM component outside its web view doesn't have.
jest.mock('expo/dom', () => ({
  useDOMImperativeHandle: jest.requireActual<typeof import('react')>('react').useImperativeHandle,
}));
jest.mock('./full', () => ({ loadFullStockfish: jest.fn() }));
const load = jest.mocked(loadFullStockfish);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
afterEach(() => {
  act(() => root.unmount());
  load.mockReset();
});

/** Asks a mounted EngineView for full Stockfish, whose download fails with `error`. */
async function startFullFailing(error: Error) {
  load.mockRejectedValue(error);
  const ref = createRef<EngineViewRef>();
  const props = {
    onLoad() {},
    onLine() {},
    onStarted() {},
    onError: jest.fn(),
  };
  root = createRoot(document.createElement('div'));
  act(() => root.render(<EngineView ref={ref} {...props} />));
  await act(async () => ref.current!.startFull('https://example.com/stockfish/'));
  return props;
}

describe('EngineView', () => {
  it('says when the folder serves another build, which the app gives up on', async () => {
    const { onError } = await startFullFailing(new NewVersionError());
    expect(onError).toHaveBeenCalledWith(`NewVersionError: ${NEW_VERSION}`, true);
  });

  it('fails when the download fails any other way, which the app restarts', async () => {
    const { onError } = await startFullFailing(new Error('offline'));
    expect(onError).toHaveBeenCalledWith('Error: offline', false);
  });
});
