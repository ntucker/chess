import { DataProvider, useQuery } from '@data-client/react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { NewVersionError } from '@/files/newVersion';
import { Download, FULL_STOCKFISH_DOWNLOAD } from '@/resources/download';

import { fullStockfish } from './engine';
import { loadFullStockfish } from './full';
import { FullStockfishHost } from './FullStockfishHost.web';

jest.mock('./full', () => ({
  ...jest.requireActual<typeof import('./full')>('./full'),
  loadFullStockfish: jest.fn(),
}));
// Lite's asset files, which the host's module names but this test never loads.
jest.mock('./files', () => ({ LOADER: 0, WASM: 0 }));
// As a preview that shares the live site's copy says, though Jest names no preview folder.
jest.mock('./fullFiles', () => ({
  ...jest.requireActual<typeof import('./fullFiles')>('./fullFiles'),
  OUTDATED_NEEDS: 'a newer preview',
}));
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
  it("downloads from the page's own site when the build names no preview folder", async () => {
    // Jest sets no base path (EXPO_BASE_URL) or preview folder (PREVIEW_FOLDER).
    load.mockReturnValue(new Promise(() => {}));
    await mount();
    expect(load.mock.calls[0][0]).toBe(`${location.origin}/stockfish/`);
  });

  it('says a download that failed is tried again, and tries it again', async () => {
    load.mockImplementation(async (_folder, _signal, report) => {
      report(0, 'retrying');
      throw new Error('offline');
    });
    await mount();
    expect(failure).toBe('retrying');
    await act(async () => jest.advanceTimersByTime(1000));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('stops trying once the site serves a newer build, and fails what is asked of it', async () => {
    const outdated = new NewVersionError({ cause: new Error('HTTP 404') });
    load.mockImplementation(async (_folder, _signal, report) => {
      report(0, 'newVersion');
      throw outdated;
    });
    const unavailable = jest.spyOn(fullStockfish, 'unavailable').mockImplementation(() => {});
    await mount();
    expect(failure).toBe('newVersion');
    const [error] = unavailable.mock.calls[0];
    expect(error).toBeInstanceOf(NewVersionError);
    expect(error).toMatchObject({ cause: outdated.cause, needs: 'a newer preview' });
    await act(async () => jest.advanceTimersByTime(60_000));
    expect(load).toHaveBeenCalledTimes(1);
  });
});
