import { DataProvider, useQuery } from '@data-client/react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { Download, FULL_STOCKFISH_DOWNLOAD } from '@/resources/download';

import { loadFullStockfish } from './full';
import { FullStockfishHost } from './FullStockfishHost.web';

jest.mock('./full', () => ({
  ...jest.requireActual<typeof import('./full')>('./full'),
  loadFullStockfish: jest.fn(),
}));
// Lite's asset files, which the host's module names but this test never loads.
jest.mock('./files', () => ({ LOADER: 0, WASM: 0 }));
const load = jest.mocked(loadFullStockfish);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let failure: Download['failure'];
function Failure() {
  const download = useQuery(Download, FULL_STOCKFISH_DOWNLOAD);
  useEffect(() => {
    failure = download?.failure;
  }, [download]);
  return null;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  failure = undefined;
  root = createRoot(document.createElement('div'));
});
afterEach(async () => {
  await act(async () => root.unmount());
  jest.useRealTimers();
  jest.restoreAllMocks();
  load.mockReset();
});

const mount = () =>
  act(async () =>
    root.render(
      <DataProvider>
        <FullStockfishHost />
        <Failure />
      </DataProvider>,
    ),
  );

describe('FullStockfishHost', () => {
  it('says a download that failed is tried again, and tries it again', async () => {
    load.mockImplementation(async (_folder, _signal, report) => {
      report(0, 'retrying');
      throw new Error('offline');
    });
    await mount();
    // The page's own site, outside a preview that shares the live site's.
    expect(load.mock.calls[0][0]).toBe(`${location.origin}/stockfish/`);
    expect(failure).toBe('retrying');
    await act(async () => jest.advanceTimersByTime(1000));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('stops trying once the site serves a newer build', async () => {
    load.mockImplementation(async (_folder, _signal, report) => {
      report(0, 'newVersion');
      return undefined;
    });
    await mount();
    expect(failure).toBe('newVersion');
    await act(async () => jest.advanceTimersByTime(60_000));
    expect(load).toHaveBeenCalledTimes(1);
  });
});
