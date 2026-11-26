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

/** Off the Stafford's guide: 2...Nc6 3.Nxe5? Nxe5 4.d4 Nc6, as Maia 1500 measured it. */
const NXE5 = uciLine('e4', 'e5', 'Nf3', 'Nc6', 'Nxe5', 'Nxe5', 'd4', 'Nc6');
const OFF_GUIDE: SavedFind = {
  line: NXE5.slice(0, 4),
  mistake: NXE5[4],
  replies: [NXE5[5]],
  payoff: NXE5.slice(6),
  cost: 0.3,
  source: { from: 'maia', rating: 1500 },
  reach: 0.4,
  share: 0.05,
  score: 0.01,
};

/** The same cue, measured from lichess's 1400 band. */
const COUNTED: SavedFind = {
  ...OFF_GUIDE,
  source: { from: 'lichess', band: 1400 },
  score: 0.02,
};

describe('parseSavedFinds', () => {
  it('reads back what savedFindsText writes', () => {
    const saved = { stafford: [OFF_GUIDE] };
    expect(parseSavedFinds(savedFindsText(saved))).toEqual(saved);
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
    const { score: _score, ...unscored } = OFF_GUIDE;
    const illegal = { ...OFF_GUIDE, mistake: 'e1e8' };
    const unknownRating = { ...OFF_GUIDE, source: { from: 'maia', rating: 1550 } };
    const text = JSON.stringify({
      version: 1,
      lessons: { stafford: [unscored, illegal, unknownRating, OFF_GUIDE], slav: [illegal] },
    });
    expect(parseSavedFinds(text)).toEqual({ stafford: [OFF_GUIDE] });
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
    const other = { ...OFF_GUIDE, line: uciLine('e4', 'e5', 'Nf3', 'd6'), mistake: 'f3e5' };
    const better = { ...other, score: 0.5 };
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
    const nc6 = lesson.positions[keyAfter('e4', 'e5', 'Nf3')].moves.find(
      ({ uci }) => uci === OFF_GUIDE.line[3],
    );
    expect(nc6).toEqual({ uci: OFF_GUIDE.line[3] });
    const before = keyAfter('e4', 'e5', 'Nf3', 'Nc6');
    const mark = lesson.positions[before].moves.find(({ uci }) => uci === OFF_GUIDE.mistake)!;
    // The cost alone: a source's numbers never rank beside the lesson's counted ones.
    expect(mark.mistake).toEqual({ cost: 0.3 });
    expect(mistakeLine(lesson, before, mark)).toEqual(NXE5.slice(4));
    const reply = lesson.positions[cueOf(OFF_GUIDE)].moves.find(({ uci }) => uci === NXE5[5]);
    expect(reply?.book).toBe(true);
    // The list of the lesson's own opportunities reads the shipped lesson, never the saved finds.
    expect(lessonOpportunities(STAFFORD, 2).some(({ next }) => next === cueOf(OFF_GUIDE))).toBe(
      false,
    );
  });

  it("leaves a mistake the lesson already marks to the lesson's own mark", () => {
    const [first] = lessonOpportunities(STAFFORD, 2);
    const marked = { ...OFF_GUIDE, line: first.line.slice(0, -1), mistake: first.move.uci };
    expect(withSavedFinds(STAFFORD, [marked])).toBe(STAFFORD);
  });
});
