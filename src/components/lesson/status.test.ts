import { describe, expect, it } from '@jest/globals';

import type { LessonView } from '@/lesson/view';

import { describeStatus, headlineNews, reviewClosed } from './status';

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

  it('tells how the game ended, over where the guide stands', () => {
    const ended = (ending: NonNullable<Parameters<typeof describeStatus>[1]['ending']>) =>
      describeStatus(view('beyond'), { ...INPUT, ending });
    expect(ended({ mood: 'won', reason: 'checkmate' })).toEqual({
      eyebrow: 'Giuoco Piano',
      title: 'Checkmate. Bravo!',
      detail: 'You won. Take a bow, then see how it went.',
    });
    expect(ended({ mood: 'lost', reason: 'checkmate' })).toMatchObject({
      title: 'Checkmate.',
      detail: 'Black won this one. The review shows where it turned.',
    });
    expect(ended({ mood: 'drawn', reason: 'stalemate' })).toMatchObject({
      title: 'A draw.',
      detail: 'By stalemate.',
    });
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

describe('reviewClosed', () => {
  const shut = { picking: false, ended: false, practice: false, leftGuide: false };
  it('opens once the game ends, in either mode', () => {
    expect(reviewClosed({ ...shut, ended: true })).toBeUndefined();
    expect(reviewClosed({ ...shut, ended: true, practice: true })).toBeUndefined();
  });
  it('opens in Practice once a move left the guide', () => {
    expect(reviewClosed({ ...shut, practice: true, leftGuide: true })).toBeUndefined();
  });
  it('says why it stays shut, in the words of the mode', () => {
    expect(reviewClosed({ ...shut, practice: true })).toBe(
      'Review opens after a move off the guide, or once the game ends.',
    );
    expect(reviewClosed({ ...shut, leftGuide: true })).toBe(
      'Review opens once the game ends, or in Practice after a move off the guide.',
    );
  });
  it('stays shut while picking a line', () => {
    expect(reviewClosed({ ...shut, picking: true, ended: true })).toBeDefined();
  });
});
