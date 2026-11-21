import { describe, expect, it } from '@jest/globals';

import type { LessonView } from '@/lesson/view';

import { describeStatus } from './status';

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
