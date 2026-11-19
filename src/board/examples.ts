// One board per idea type, drawn the way the tech plan's table says
// (opening lesson tech plan, section 7), in Caro-Kann positions. The drawings
// gallery (src/app/dev/drawings.tsx) shows them, so every drawing kind can be
// seen and screenshot without a lesson.
import type { Drawing } from '@/board/drawing';

export interface DrawingExample {
  /** The idea type, or what the drawings show. */
  readonly title: string;
  /** What the board says, as an idea card's sentence would. */
  readonly sentence: string;
  /** The moves (UCI) from the starting position to the position shown. */
  readonly line: readonly string[];
  readonly drawings: readonly Drawing[];
}

const ADVANCE = ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'e4e5'];
const SMOTHERED = ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'b1c3', 'd5e4', 'c3e4', 'b8d7', 'd1e2'];

export const drawingExamples: readonly DrawingExample[] = [
  {
    title: 'Candidate moves',
    sentence: 'Strike at the center with …d5, or fianchetto with …g6.',
    line: ['e2e4', 'c7c6', 'd2d4'],
    drawings: [
      { kind: 'glow', square: 'd7', tone: 'main' },
      { kind: 'arrow', from: 'd7', to: 'd5', tone: 'main' },
      { kind: 'glow', square: 'g7', tone: 'other' },
      { kind: 'arrow', from: 'g7', to: 'g6', tone: 'other' },
      { kind: 'arrow', from: 'e7', to: 'e6', tone: 'engine' },
    ],
  },
  {
    title: 'Purpose',
    sentence: 'Your bishop comes out before …e6 locks it in, and eyes c2.',
    line: [...ADVANCE, 'c8f5'],
    drawings: [
      { kind: 'glow', square: 'f5', tone: 'main' },
      { kind: 'arrow', from: 'f5', to: 'c2', tone: 'main' },
      { kind: 'ring', square: 'c2', tone: 'target' },
    ],
  },
  {
    title: 'Pressure',
    sentence: 'Three pieces hit d4 and three hold it.',
    line: [...ADVANCE, 'c8f5', 'g1f3', 'e7e6', 'c2c3', 'c6c5', 'f1e2', 'b8c6', 'e1g1', 'd8b6'],
    drawings: [
      { kind: 'glow', square: 'c5', tone: 'main' },
      { kind: 'glow', square: 'c6', tone: 'main' },
      { kind: 'glow', square: 'b6', tone: 'main' },
      { kind: 'glow', square: 'c3', tone: 'other' },
      { kind: 'glow', square: 'f3', tone: 'other' },
      { kind: 'glow', square: 'd1', tone: 'other' },
      { kind: 'ring', square: 'd4', tone: 'target' },
      { kind: 'label', square: 'd4', text: '3 v 3', tone: 'target' },
    ],
  },
  {
    title: 'Plan',
    sentence: 'Hit d4 with …c5, …Nc6 and …Qb6.',
    line: [...ADVANCE, 'c8f5', 'g1f3', 'e7e6'],
    drawings: [
      { kind: 'arrow', from: 'c6', to: 'c5', tone: 'plan', step: 1, dashed: true },
      { kind: 'arrow', from: 'b8', to: 'c6', tone: 'plan', step: 2, dashed: true },
      { kind: 'arrow', from: 'd8', to: 'b6', tone: 'plan', step: 3, dashed: true },
      { kind: 'ring', square: 'd4', tone: 'target' },
    ],
  },
  {
    title: 'Threat',
    sentence: 'White wants h4–h5 to trap your bishop; meet it with …h5.',
    line: [...ADVANCE, 'c8f5', 'b1c3', 'e7e6', 'g2g4', 'f5g6', 'g1e2', 'c6c5'],
    drawings: [
      { kind: 'arrow', from: 'h2', to: 'h4', tone: 'danger' },
      { kind: 'arrow', from: 'h7', to: 'h5', tone: 'main' },
    ],
  },
  {
    title: 'Trap',
    sentence: '…Ngf6 looks natural, but Nd6 is smothered mate.',
    line: SMOTHERED,
    drawings: [
      { kind: 'arrow', from: 'g8', to: 'f6', tone: 'danger', step: 1 },
      { kind: 'arrow', from: 'e4', to: 'd6', tone: 'danger', step: 2 },
      { kind: 'ring', square: 'e8', tone: 'target' },
    ],
  },
  {
    title: 'Trap, after the fact',
    sentence: 'The knight left g8, and the king had nowhere to go.',
    line: [...SMOTHERED, 'g8f6', 'e4d6'],
    drawings: [
      { kind: 'ghost', square: 'g8', piece: { role: 'knight', color: 'black' } },
      { kind: 'badge', square: 'f6', quality: 'blunder' },
      { kind: 'ring', square: 'e8', tone: 'danger' },
    ],
  },
  {
    title: 'Line',
    sentence: '…c5 at once hits the chain at its base.',
    line: ADVANCE,
    drawings: [{ kind: 'arrow', from: 'c6', to: 'c5', tone: 'main' }],
  },
  {
    title: 'Structure: chain and break',
    sentence: 'White’s chain d4–e5; …c5 strikes its base.',
    line: [...ADVANCE, 'c8f5', 'g1f3', 'e7e6'],
    drawings: [
      {
        kind: 'fade',
        except: [
          'a2',
          'b2',
          'c2',
          'd4',
          'e5',
          'f2',
          'g2',
          'h2',
          'a7',
          'b7',
          'c6',
          'd5',
          'e6',
          'f7',
          'g7',
          'h7',
        ],
      },
      { kind: 'line', squares: ['d4', 'e5'], tone: 'other' },
      { kind: 'line', squares: ['c6', 'd5', 'e6'], tone: 'main' },
      { kind: 'ring', square: 'd4', tone: 'target' },
      { kind: 'arrow', from: 'c6', to: 'c5', tone: 'main' },
    ],
  },
  {
    title: 'Structure: files',
    sentence: 'The c-file is half open for White, the e-file for you.',
    line: ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'e4d5', 'c6d5'],
    drawings: [
      {
        kind: 'fade',
        except: [
          'a2',
          'b2',
          'c2',
          'd4',
          'f2',
          'g2',
          'h2',
          'a7',
          'b7',
          'd5',
          'e7',
          'f7',
          'g7',
          'h7',
        ],
      },
      { kind: 'tint', squares: ['c3', 'c4', 'c5', 'c6', 'c7'], tone: 'other' },
      { kind: 'tint', squares: ['e2', 'e3', 'e4', 'e5', 'e6'], tone: 'main' },
    ],
  },
  {
    title: 'Imbalance',
    sentence: 'White has the two bishops for your bishop and knight.',
    line: ['e2e4', 'c7c6', 'b1c3', 'd7d5', 'g1f3', 'c8g4', 'h2h3', 'g4f3', 'd1f3'],
    drawings: [
      { kind: 'glow', square: 'c1', tone: 'other' },
      { kind: 'glow', square: 'f1', tone: 'other' },
    ],
  },
];
