import { describe, expect, it } from '@jest/globals';

import type { Note, PositionKey } from './lesson';
import { type Peek, type PeekAction, peekReducer } from './peek';

const HERE = 'here' as PositionKey;
const THERE = 'there' as PositionKey;
const PLAN: Note = { text: 'A plan.' };
const STRUCTURE: Note = { text: 'A structure.' };
const ROW = { at: 'row', uci: 'c7c6' } as const;
const SQUARE = { at: 'square', square: 'c6' } as const;

type Pointing = Extract<Peek, { kind: 'point' }>;
type Playing = Extract<Peek, { kind: 'play' }>;

const pointing = (more: Partial<Pointing> = {}): Peek => ({ kind: 'point', key: HERE, ...more });
const playing = (more: Partial<Playing> = {}): Peek => ({
  kind: 'play',
  key: HERE,
  candidate: ROW,
  note: PLAN,
  played: PLAN,
  step: 1,
  auto: true,
  ...more,
});

const reduce = (peek: Peek | undefined, ...actions: PeekAction[]) =>
  actions.reduce(peekReducer, peek);

describe('peekReducer', () => {
  it.each<[string, Peek | undefined, PeekAction[], Peek | undefined]>([
    [
      'a row previews its candidate',
      undefined,
      [{ type: 'candidate', key: HERE, candidate: ROW }],
      pointing({ candidate: ROW }),
    ],
    [
      "a row's preview stays when the pointer moves into the card",
      undefined,
      [
        { type: 'candidate', key: HERE, candidate: ROW },
        { type: 'note', key: HERE, note: PLAN },
      ],
      pointing({ candidate: ROW, note: PLAN }),
    ],
    [
      'a square with no candidate drops the candidate but keeps the note',
      pointing({ candidate: ROW, note: PLAN }),
      [{ type: 'candidate', key: HERE }],
      pointing({ note: PLAN }),
    ],
    [
      'pointing at a candidate drops the note',
      pointing({ note: PLAN }),
      [{ type: 'candidate', key: HERE, candidate: SQUARE }],
      pointing({ candidate: SQUARE }),
    ],
    [
      'leaving ends pointing',
      pointing({ candidate: ROW, note: PLAN }),
      [{ type: 'leave' }],
      undefined,
    ],
    [
      'pointing in a new position starts afresh',
      pointing({ key: THERE, candidate: ROW, note: PLAN }),
      [{ type: 'note', key: HERE, note: STRUCTURE }],
      pointing({ note: STRUCTURE }),
    ],
    [
      'a playback starts from the candidate pointed at, at its first board',
      pointing({ candidate: ROW, note: PLAN }),
      [{ type: 'play', key: HERE, note: PLAN }],
      playing({ step: 0 }),
    ],
    [
      'pointing is ignored while an idea plays',
      playing(),
      [
        { type: 'candidate', key: HERE, candidate: SQUARE },
        { type: 'note', key: HERE, note: STRUCTURE },
      ],
      playing(),
    ],
    ['leaving does not stop a playback', playing(), [{ type: 'leave' }], playing()],
    ['a playback steps by itself', playing(), [{ type: 'step' }], playing({ step: 2 })],
    [
      'stepping it by hand stops it stepping by itself',
      playing(),
      [{ type: 'goto', step: 0 }],
      playing({ step: 0, auto: false }),
    ],
    [
      'stopping returns to the pointing it started from',
      playing(),
      [{ type: 'stop' }],
      pointing({ candidate: ROW, note: PLAN }),
    ],
    [
      'stepping without a playback does nothing',
      pointing({ note: PLAN }),
      [{ type: 'step' }],
      pointing({ note: PLAN }),
    ],
    [
      'stopping a note played without pointing at it leaves no note pointed',
      pointing({ candidate: ROW }),
      [{ type: 'play', key: HERE, note: PLAN }, { type: 'stop' }],
      pointing({ candidate: ROW }),
    ],
    ['the board moving on ends a playback', playing(), [{ type: 'board', key: THERE }], undefined],
    ['the board staying keeps it', playing(), [{ type: 'board', key: HERE }], playing()],
  ])('%s', (_, peek, actions, expected) => {
    expect(reduce(peek, ...actions)).toEqual(expected);
  });

  it('keeps the same state when pointing changes nothing, so nothing re-renders', () => {
    const peek = pointing({ candidate: ROW });
    expect(peekReducer(peek, { type: 'candidate', key: HERE, candidate: { ...ROW } })).toBe(peek);
    expect(peekReducer(undefined, { type: 'candidate', key: HERE })).toBeUndefined();
  });
});
