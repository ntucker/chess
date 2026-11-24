/**
 * The queue of a best-first walk: whatever it walks, likeliest first.
 * The lesson's guide (`likeliestInto` in openings.ts) and the opportunity
 * finder walk with it.
 */
import type { Chess } from 'chessops/chess';

import type { Uci } from './lesson';

/** A line being walked, with the share of games that play it. */
export interface Walked {
  readonly line: Uci[];
  readonly pos: Chess;
  readonly share: number;
}

/**
 * A binary heap of walked lines, the likeliest on top; of lines as likely,
 * the one pushed first. `share` reads how likely a line is.
 */
export class LikeliestFirst<T> {
  private readonly heap: { readonly walked: T; readonly order: number }[] = [];
  private pushed = 0;

  constructor(private readonly share: (walked: T) => number) {}

  push(walked: T) {
    const { heap } = this;
    heap.push({ walked, order: this.pushed++ });
    for (let i = heap.length - 1; i > 0;) {
      const up = (i - 1) >> 1;
      if (!this.before(i, up)) break;
      [heap[i], heap[up]] = [heap[up], heap[i]];
      i = up;
    }
  }

  pop(): T | undefined {
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
    const [shareX, shareY] = [this.share(x.walked), this.share(y.walked)];
    return shareX > shareY || (shareX === shareY && x.order < y.order);
  }
}
