import { describe, expect, it } from '@jest/globals';

import type { Note, PositionKey } from './lesson';
import { HOLD_MS, type Peek, type PeekAction, peekReducer } from './peek';

const HERE = 'here' as PositionKey;
const THERE = 'there' as PositionKey;
const PLAN: Note = { text: 'A plan.' };
const STRUCTURE: Note = { text: 'A structure.' };
const ROW = { at: 'row', uci: 'c7c6' } as const;
const DRAG = { at: 'drag', from: 'c7', to: 'c6' } as const;
const OTHER = { at: 'row', uci: 'e7e6' } as const;
const THIRD = { at: 'row', uci: 'd7d5' } as const;
type Row = typeof ROW | typeof OTHER | typeof THIRD;

type Pointing = Extract<Peek, { kind: 'point' }>;
type Playing = Extract<Peek, { kind: 'play' }>;

const pointing = (more: Partial<Pointing> = {}): Peek => ({ kind: 'point', key: HERE, ...more });
const playing = (more: Partial<Playing> = {}): Peek => ({
  kind: 'play',
  key: HERE,
  candidate: ROW,
  note: PLAN,
  played: PLAN,
  from: ROW,
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
      'a drag over no candidate drops the candidate but keeps the note',
      pointing({ candidate: ROW, note: PLAN }),
      [{ type: 'candidate', key: HERE }],
      pointing({ note: PLAN }),
    ],
    [
      'pointing at a candidate drops the note',
      pointing({ note: PLAN }),
      [{ type: 'candidate', key: HERE, candidate: DRAG }],
      pointing({ candidate: DRAG }),
    ],
    [
      'the pointer leaving a note unpoints it, keeping the candidate',
      pointing({ candidate: ROW, note: PLAN }),
      [{ type: 'leaveNote', key: HERE, note: PLAN }],
      pointing({ candidate: ROW }),
    ],
    [
      'the pointer leaving another note keeps the one pointed at by keyboard focus',
      pointing({ note: PLAN }),
      [{ type: 'leaveNote', key: HERE, note: STRUCTURE }],
      pointing({ note: PLAN }),
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
      'pointing while an idea plays leaves the playback and its candidate as they are',
      playing(),
      [
        { type: 'candidate', key: HERE, candidate: DRAG },
        { type: 'note', key: HERE, note: STRUCTURE },
      ],
      playing({ candidate: DRAG, note: STRUCTURE }),
    ],
    [
      'leaving does not stop a playback',
      playing(),
      [{ type: 'leave' }],
      playing({ candidate: undefined, note: undefined }),
    ],
    [
      'stopping returns to what is pointed at now',
      playing(),
      [{ type: 'candidate', key: HERE, candidate: DRAG }, { type: 'stop' }],
      pointing({ candidate: DRAG }),
    ],
    [
      'a note let go while another note plays is not pointed at once it stops',
      pointing({ note: PLAN }),
      [
        { type: 'play', key: HERE, note: PLAN },
        { type: 'note', key: HERE, note: STRUCTURE },
        { type: 'play', key: HERE, note: STRUCTURE },
        { type: 'stop' },
        { type: 'leaveNote', key: HERE, note: STRUCTURE },
      ],
      pointing(),
    ],
    [
      "a second playback plays from the first one's candidate",
      playing(),
      [
        { type: 'candidate', key: HERE, candidate: DRAG },
        { type: 'play', key: HERE, note: STRUCTURE },
      ],
      playing({ candidate: DRAG, note: undefined, played: STRUCTURE, step: 0 }),
    ],
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
  ])('%s', (_, peek, actions, expected) => {
    expect(reduce(peek, ...actions)).toEqual(expected);
  });

  it('keeps the same state when pointing changes nothing, so nothing re-renders', () => {
    const peek = pointing({ candidate: ROW });
    expect(peekReducer(peek, { type: 'candidate', key: HERE, candidate: { ...ROW } })).toBe(peek);
    expect(peekReducer(undefined, { type: 'candidate', key: HERE })).toBeUndefined();
  });

  describe('rows crossed on the way to the idea card', () => {
    const row = (candidate: Row, time: number): PeekAction => ({
      type: 'candidate',
      key: HERE,
      candidate,
      time,
    });
    const card = (time: number): PeekAction => ({ type: 'card', key: HERE, time });
    const pointed = (...actions: PeekAction[]) => reduce(undefined, ...actions)?.candidate;

    it.each<[string, PeekAction[], Row]>([
      [
        'a row held, then others crossed quickly: the card returns to the held row',
        [row(ROW, 0), row(OTHER, HOLD_MS), row(THIRD, HOLD_MS + 40), card(HOLD_MS + 80)],
        ROW,
      ],
      [
        'the row pointed at last, if held: the card keeps it',
        [row(ROW, 0), row(OTHER, HOLD_MS), card(2 * HOLD_MS)],
        OTHER,
      ],
      [
        'a row crossed before the one held is not held',
        [row(ROW, 0), row(OTHER, 40), row(THIRD, 40 + HOLD_MS), card(40 + HOLD_MS + 10)],
        OTHER,
      ],
    ])('%s', (_, actions, expected) => {
      expect(pointed(...actions)).toEqual(expected);
    });

    it('points at each row at once, however quickly the pointer crosses them', () => {
      expect(pointed(row(ROW, 0), row(OTHER, 10))).toEqual(OTHER);
    });

    it('changes nothing when no row was held, or the card is reached in another position', () => {
      const crossed = reduce(undefined, row(ROW, 0), row(OTHER, 10));
      expect(peekReducer(crossed, card(20))).toBe(crossed);
      const held = reduce(undefined, row(ROW, 0), row(OTHER, HOLD_MS), row(THIRD, HOLD_MS + 10));
      expect(peekReducer(held, { type: 'card', key: THERE, time: HOLD_MS + 20 })).toBe(held);
    });

    it('forgets the rows held once the preview ends', () => {
      const cleared = reduce(
        undefined,
        row(ROW, 0),
        row(OTHER, HOLD_MS),
        { type: 'candidate', key: HERE },
        row(THIRD, 2 * HOLD_MS),
      );
      expect(peekReducer(cleared, card(2 * HOLD_MS + 10))).toBe(cleared);
    });

    it('returns to the held row behind a playback, which goes on', () => {
      const peek = reduce(
        playing(),
        row(OTHER, 0),
        row(THIRD, HOLD_MS),
        row(ROW, HOLD_MS + 10),
        card(HOLD_MS + 20),
      );
      expect(peek).toMatchObject({ kind: 'play', candidate: OTHER, step: 1 });
    });
  });
});
