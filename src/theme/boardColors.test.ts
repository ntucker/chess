import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BOARD_OKLCH } from './boardColors';

const css = readFileSync(join(__dirname, '../components/Board.css'), 'utf8');
const literal = (lch: readonly number[], alpha?: number) =>
  `oklch(${lch.join(' ')}${alpha === undefined ? '' : ` / ${alpha}`})`;

describe('boardColors', () => {
  it('paints the squares and the gold as Board.css does', () => {
    expect(css).toContain(`--light: ${literal(BOARD_OKLCH.light)}`);
    expect(css).toContain(`--dark: ${literal(BOARD_OKLCH.dark)}`);
    expect(css).toContain(
      `square.last-move {\n  background-color: ${literal(BOARD_OKLCH.gold, 0.5)}`,
    );
    expect(css).toContain(
      `square.selected {\n  background-color: ${literal(BOARD_OKLCH.gold, 0.75)}`,
    );
  });
});
