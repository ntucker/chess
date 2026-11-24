import { describe, expect, it } from '@jest/globals';
import { Chess } from 'chessops/chess';

import { LikeliestFirst, type Walked } from './likeliestFirst';

describe('LikeliestFirst', () => {
  it('pops the likeliest line first, and of lines as likely the one pushed first', () => {
    const queue = new LikeliestFirst<Walked>((walked) => walked.share);
    const shares = [0.2, 0.9, 0.5, 0.9, 0.05, 0.5];
    shares.forEach((share, i) => queue.push({ line: [String(i)], pos: Chess.default(), share }));
    const popped: string[] = [];
    for (let next = queue.pop(); next; next = queue.pop()) popped.push(next.line[0]);
    expect(popped).toEqual(['1', '3', '2', '5', '0', '4']);
  });
});
