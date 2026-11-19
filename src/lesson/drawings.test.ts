import { describe, expect, it } from "@jest/globals";

import {
  candidateDrawings,
  ideaDrawings,
  lessonDrawings,
  mainCandidate,
} from "./drawings";
import { guidance, type LessonSwitches } from "./guidance";
import { ADVANCE, MAIN, SAMPLE, sampleView } from "./lesson.fixture";
import { preview } from "./view";

const SWITCHES: LessonSwitches = {
  auto: true,
  showIdeas: true,
  showTraps: false,
};

const explore = (sans: string[], row?: string) => {
  const view = sampleView(sans);
  const pointed =
    row === undefined
      ? undefined
      : preview(SAMPLE, view, { at: "row", uci: row });
  return {
    view,
    shown: guidance({
      view,
      mode: "explore",
      switches: SWITCHES,
      preview: pointed,
    }),
  };
};

describe("mainCandidate", () => {
  it("picks the book move, else the most played", () => {
    expect(mainCandidate(sampleView(ADVANCE).candidates)?.san).toBe("Bf5");
    expect(mainCandidate(sampleView(MAIN).candidates)?.san).toBe("e5");
    expect(mainCandidate([])).toBeUndefined();
  });
});

describe("candidateDrawings", () => {
  it("lights each piece with an arrow, the main one last so its glow wins", () => {
    const [bf5, c5] = sampleView(ADVANCE).candidates;
    expect(candidateDrawings([bf5, c5])).toEqual([
      { kind: "glow", square: "c6", tone: "other" },
      { kind: "arrow", from: "c6", to: "c5", tone: "other" },
      { kind: "glow", square: "c8", tone: "main" },
      { kind: "arrow", from: "c8", to: "f5", tone: "main" },
    ]);
  });
});

describe("ideaDrawings", () => {
  it("draws a Purpose as its piece lit, an arrow to each target, and each target ringed", () => {
    expect(
      ideaDrawings({
        type: "purpose",
        from: "e5",
        relation: "controls",
        targets: ["d6", "f6"],
      }),
    ).toEqual([
      { kind: "glow", square: "e5", tone: "main" },
      { kind: "arrow", from: "e5", to: "d6", tone: "main" },
      { kind: "ring", square: "d6", tone: "target" },
      { kind: "arrow", from: "e5", to: "f6", tone: "main" },
      { kind: "ring", square: "f6", tone: "target" },
    ]);
  });

  it("draws nothing yet for the other idea types", () => {
    expect(ideaDrawings({ type: "evaluation", value: "equal" })).toEqual([]);
  });
});

describe("lessonDrawings", () => {
  it("draws only the candidates when nothing is previewed", () => {
    const { view, shown } = explore(ADVANCE);
    expect(shown.ideas.length).toBeGreaterThan(0);
    expect(lessonDrawings(shown, view.key)).toEqual(
      candidateDrawings(shown.candidates),
    );
  });

  it("draws a sliding preview's ghost and the ideas about the position after it", () => {
    const { shown } = explore(["e4"], "c7c6");
    const { next } = shown.preview!.candidate;
    expect(lessonDrawings(shown, next)).toEqual([
      { kind: "ghost", square: "c7", piece: { role: "pawn", color: "black" } },
      { kind: "glow", square: "c6", tone: "main" },
      { kind: "arrow", from: "c6", to: "d5", tone: "main" },
      { kind: "ring", square: "d5", tone: "target" },
    ]);
  });

  it("leaves out ideas about another position than the one shown", () => {
    const { view, shown } = explore(["e4"], "c7c6");
    expect(lessonDrawings(shown, view.key)).toEqual([
      { kind: "ghost", square: "c7", piece: { role: "pawn", color: "black" } },
    ]);
  });
});
