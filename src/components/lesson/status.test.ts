import { describe, expect, it } from '@jest/globals';

import type { LessonView } from '@/lesson/view';

import { describeStatus, headlineNews } from './status';

const INPUT = {
  picking: false,
  loading: false,
  title: 'Italian Game',
  names: ['Giuoco Piano'],
  rival: 'Black',
  engine: 'Maia',
  replying: false,
  viewing: false,
  auto: true,
  canPlay: true,
  lineEnded: false,
  startsRun: false,
};

const view = (place: LessonView['place']) => ({ place, learnerToMove: true, ply: 8 });

describe('describeStatus', () => {
  it('says the guide has no moves off it and at a line end', () => {
    expect(describeStatus(view('beyond'), INPUT)).toMatchObject({
      title: 'Off the guide.',
      pastGuide: 'Off the guide',
    });
    expect(describeStatus(view('end'), { ...INPUT, lineEnded: true })).toMatchObject({
      title: 'End of this line.',
      pastGuide: 'End of this line',
    });
  });

  it('leaves it out inside the guide', () => {
    expect(describeStatus(view('inside'), INPUT).pastGuide).toBeUndefined();
  });
});

describe('headlineNews', () => {
  const offGuide = describeStatus(view('beyond'), INPUT);
  const lineEnd = describeStatus(view('end'), { ...INPUT, lineEnded: true });
  const closed = { aside: false, scoresheetOpen: false, failed: false };

  it('draws nothing where the aside tells the headline', () => {
    expect(headlineNews(offGuide, { ...closed, aside: true })).toBe('none');
    expect(headlineNews(offGuide, closed)).toBe('all');
  });

  it('leaves "Off the guide" untold over the open scoresheet, unless the opponent failed', () => {
    const open = { ...closed, aside: true, scoresheetOpen: true };
    expect(headlineNews(offGuide, open)).toBe('none');
    expect(headlineNews(offGuide, { ...open, failed: true })).toBe('all');
    // Where no aside would tell it (Stockfish's moves aren't listed), the drawer's rule holds all the same.
    expect(headlineNews(offGuide, { ...open, aside: false })).toBe('none');
    expect(headlineNews(offGuide, { ...open, aside: false, failed: true })).toBe('all');
    expect(headlineNews(lineEnd, open)).toBe('all');
    expect(headlineNews(describeStatus(view('inside'), { ...INPUT, viewing: true }), open)).toBe(
      'detail',
    );
  });
});
