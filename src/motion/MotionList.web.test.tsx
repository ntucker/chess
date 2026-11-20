import { describe, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

// Records what the list hands the FLIP step: the keys it measured, then the keys it reorders.
const mockCalls: [string, string[], boolean?][] = [];
jest.mock('./reorder', () => ({
  measure: (items: Map<string, unknown>) => {
    mockCalls.push(['measure', [...items.keys()]]);
    return new Map();
  },
  reorder: (
    _before: unknown,
    items: Map<string, unknown>,
    _spring: unknown,
    { fades }: { fades: boolean },
  ) => {
    mockCalls.push(['reorder', [...items.keys()], fades]);
  },
}));

// eslint-disable-next-line import/first -- after the mock it replaces
import { MotionList, MotionView } from './MotionList';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function List({ ids, dependency }: { readonly ids: string[]; readonly dependency: unknown }) {
  return (
    <MotionList layoutDependency={dependency}>
      {ids.map((id) => (
        <MotionView key={id} id={id} />
      ))}
    </MotionList>
  );
}

describe('MotionList on the web', () => {
  it('follows the items mounted now, and fades only with its dependency', () => {
    const root = createRoot(document.createElement('div'));
    act(() => root.render(<List ids={['a', 'b']} dependency={1} />));
    act(() => root.render(<List ids={['a', 'b']} dependency={1} />));
    act(() => root.render(<List ids={['a']} dependency={2} />));
    expect(mockCalls).toEqual([
      ['measure', ['a', 'b']],
      ['reorder', ['a', 'b'], false],
      ['measure', ['a', 'b']],
      // b's view went: the list no longer holds it
      ['reorder', ['a'], true],
    ]);
    act(() => root.unmount());
  });
});
