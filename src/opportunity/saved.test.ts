import { describe, expect, it } from '@jest/globals';

import { readShippedLesson, uciLine, keyAfter } from '@/lesson/lesson.fixture';
import { mistakeLine } from '@/lesson/mistakes';
import { lessonOpportunities } from '@/lesson/opportunities';

import {
  bySource,
  cueOf,
  parseSavedFinds,
  type SavedFind,
  savedFindsText,
  withoutSaved,
  withSaved,
  withSavedFinds,
} from './saved';

const STAFFORD = readShippedLesson('stafford');

/** Off the Stafford's guide: 3...d6 4.Nxf7? Kxf7 5.d4 Nxe4, as Maia 1500 measured it. */
const NXF7 = uciLine('e4', 'e5', 'Nf3', 'Nf6', 'Nxe5', 'd6', 'Nxf7', 'Kxf7', 'd4', 'Nxe4');
const OFF_GUIDE: SavedFind = {
  line: NXF7.slice(0, 6),
  mistake: NXF7[6],
  replies: [NXF7[7]],
  payoff: NXF7.slice(8),
  cost: 0.3,
  source: { from: 'maia', rating: 1500 },
  reach: 0.4,
  share: 0.05,
  gain: 0.5,
};

/** The same cue, measured from lichess's 1400 band. */
const COUNTED: SavedFind = {
  ...OFF_GUIDE,
  source: { from: 'lichess', band: 1400 },
  gain: 1,
};

describe('parseSavedFinds', () => {
  it('reads back what savedFindsText writes', () => {
    const saved = { stafford: [OFF_GUIDE] };
    expect(parseSavedFinds(savedFindsText(saved))).toEqual(saved);
  });

  it('reads a find saved before finds kept their gain, its gain from the score it kept', () => {
    const { gain: _gain, ...older } = { ...OFF_GUIDE, score: 0.02 };
    const text = (find: object) => JSON.stringify({ version: 1, lessons: { stafford: [find] } });
    const [read] = parseSavedFinds(text(older)).stafford!;
    expect(read.gain).toBeCloseTo(0.02 / (0.4 * 0.05));
    // At most all the winning chances.
    expect(parseSavedFinds(text({ ...older, score: 0.5 })).stafford![0].gain).toBe(1);
    // Not where reach × share leaves nothing to divide by.
    expect(parseSavedFinds(text({ ...older, share: 0 }))).toEqual({});
  });

  it('reads another version, or damaged text, as none', () => {
    expect(
      parseSavedFinds(JSON.stringify({ version: 2, lessons: { stafford: [OFF_GUIDE] } })),
    ).toEqual({});
    expect(parseSavedFinds(JSON.stringify({ stafford: [OFF_GUIDE] }))).toEqual({});
    expect(parseSavedFinds('{"version":1,')).toEqual({});
    expect(parseSavedFinds('')).toEqual({});
  });

  it("drops a find missing a field, or whose moves don't play, and keeps the rest", () => {
    const { gain: _gain, ...unscored } = OFF_GUIDE;
    const illegal = { ...OFF_GUIDE, mistake: 'e1e8' };
    const unknownRating = { ...OFF_GUIDE, source: { from: 'maia', rating: 1550 } };
    const text = JSON.stringify({
      version: 1,
      lessons: {
        stafford: [unscored, illegal, unknownRating, OFF_GUIDE],
        slav: [illegal],
      },
    });
    expect(parseSavedFinds(text)).toEqual({ stafford: [OFF_GUIDE] });
  });

  it('drops a find whose reach or share is not above 0', () => {
    const text = (find: object) => JSON.stringify({ version: 1, lessons: { stafford: [find] } });
    expect(parseSavedFinds(text({ ...OFF_GUIDE, share: 0 }))).toEqual({});
    expect(parseSavedFinds(text({ ...OFF_GUIDE, reach: -0.4, share: -0.05 }))).toEqual({});
  });
});

describe('withSaved and withoutSaved', () => {
  it('keeps one find per cue, and forgets it again', () => {
    const once = withSaved({}, 'stafford', OFF_GUIDE);
    const again = withSaved(once, 'stafford', COUNTED);
    expect(again).toEqual({ stafford: [COUNTED] });
    expect(withoutSaved(again, 'stafford', cueOf(OFF_GUIDE))).toEqual({});
    expect(withoutSaved(again, 'slav', cueOf(OFF_GUIDE))).toEqual(again);
  });
});

describe('bySource', () => {
  it("groups lichess's bands first, then Maia's, each best first", () => {
    const other = {
      ...OFF_GUIDE,
      line: uciLine('e4', 'e5', 'Nf3', 'd6'),
      mistake: 'f3e5',
      replies: ['d6e5'],
      payoff: [],
    };
    const better = { ...other, gain: 0.9 };
    expect(bySource([OFF_GUIDE, COUNTED, better])).toEqual([
      { source: COUNTED.source, finds: [COUNTED] },
      { source: OFF_GUIDE.source, finds: [better, OFF_GUIDE] },
    ]);
  });
});

describe('withSavedFinds', () => {
  it('is the lesson itself with no finds', () => {
    expect(withSavedFinds(STAFFORD, [])).toBe(STAFFORD);
  });

  it("writes a find off the guide: the learner's moves unbooked, the mark playing back its line", () => {
    const lesson = withSavedFinds(STAFFORD, [OFF_GUIDE]);
    const d6 = lesson.positions[keyAfter('e4', 'e5', 'Nf3', 'Nf6', 'Nxe5')].moves.find(
      ({ uci }) => uci === OFF_GUIDE.line[5],
    );
    expect(d6).toEqual({ uci: OFF_GUIDE.line[5] });
    const before = keyAfter('e4', 'e5', 'Nf3', 'Nf6', 'Nxe5', 'd6');
    const mark = lesson.positions[before].moves.find(({ uci }) => uci === OFF_GUIDE.mistake)!;
    // The cost alone: a source's numbers never rank beside the lesson's counted ones.
    expect(mark.mistake).toEqual({ cost: 0.3 });
    expect(mistakeLine(lesson, before, mark)).toEqual(NXF7.slice(6));
    const reply = lesson.positions[cueOf(OFF_GUIDE)].moves.find(({ uci }) => uci === NXF7[7]);
    expect(reply?.book).toBe(true);
    // The list of the lesson's own opportunities reads the shipped lesson, never the saved finds.
    expect(lessonOpportunities(STAFFORD, 2, []).some(({ next }) => next === cueOf(OFF_GUIDE))).toBe(
      false,
    );
  });

  it("leaves a mistake the lesson already marks to the lesson's own mark", () => {
    const [first] = lessonOpportunities(STAFFORD, 2, []);
    const marked = { ...OFF_GUIDE, line: first.line.slice(0, -1), mistake: first.move.uci };
    expect(withSavedFinds(STAFFORD, [marked])).toBe(STAFFORD);
  });
});
