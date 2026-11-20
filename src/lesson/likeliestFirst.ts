/**
 * The queue of a best-first walk through a lesson's guide
 * (`likeliestInto` in openings.ts): lines by the share of games that play them.
 */
import type { Chess } from 'chessops/chess';

import type { Uci } from './lesson';

/** A line being walked, with the share of games that play it. */
export interface Walked {
  readonly line: Uci[];
  readonly pos: Chess;
  readonly share: number;
}

/** A binary heap of walked lines, the likeliest on top; of lines as likely, the one pushed first. */
export class LikeliestFirst {
  private readonly heap: { readonly walked: Walked; readonly order: number }[] = [];
  private pushed = 0;

  push(walked: Walked) {
    const { heap } = this;
    heap.push({ walked, order: this.pushed++ });
    for (let i = heap.length - 1; i > 0;) {
      const up = (i - 1) >> 1;
      if (!this.before(i, up)) break;
      [heap[i], heap[up]] = [heap[up], heap[i]];
      i = up;
    }
  }

  pop(): Walked | undefined {
    const { heap } = this;
    const top = heap[0];
    const last = heap.pop();
    if (heap.length && last) {
      heap[0] = last;
      for (let i = 0; ;) {
        const [left, right] = [2 * i + 1, 2 * i + 2];
        let best = i;
        if (left < heap.length && this.before(left, best)) best = left;
        if (right < heap.length && this.before(right, best)) best = right;
        if (best === i) break;
        [heap[i], heap[best]] = [heap[best], heap[i]];
        i = best;
      }
    }
    return top?.walked;
  }

  private before(a: number, b: number) {
    const [x, y] = [this.heap[a], this.heap[b]];
    return (
      x.walked.share > y.walked.share || (x.walked.share === y.walked.share && x.order < y.order)
    );
  }
}
