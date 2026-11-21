import { SquareSet } from 'chessops/squareSet';
import type { Color, SquareName } from 'chessops/types';
import { makeSquare } from 'chessops/util';
import { StyleSheet, View } from 'react-native';

import { readPositionKey } from '@/game/replay';
import type { PositionKey } from '@/lesson/lesson';
import { boardColors } from '@/theme/boardColors';

import { PieceGlyph } from './PieceGlyph';

interface Props {
  /** The position shown. */
  readonly position: PositionKey;
  /** The side at the bottom. */
  readonly orientation: Color;
  /** The squares lit in the board's gold. */
  readonly lit: readonly SquareName[];
  /** How strongly they are lit: as the big board lights its last move, or a selected square. */
  readonly highlight: 'lastMove' | 'selected';
  /** One square's width, in points. */
  readonly squareSize: number;
}

/** Ranks or files from the eighth (h) down to the first (a). */
const DOWNWARD = [7, 6, 5, 4, 3, 2, 1, 0];
const UPWARD = [...DOWNWARD].reverse();
const LIGHT = SquareSet.lightSquares();

/**
 * A small still board drawn in React Native, in the big board's colors and
 * pieces, for a position shown beside text: no web view, nothing to move.
 */
export function MiniBoard({ position, orientation, lit, highlight, squareSize }: Props) {
  const pos = readPositionKey(position);
  if (!pos) return null;
  // Rows top to bottom and squares left to right, as the side at the bottom sees them.
  const [ranks, files] = orientation === 'white' ? [DOWNWARD, UPWARD] : [UPWARD, DOWNWARD];
  return (
    <View style={[styles.board, { width: squareSize * 8 }]}>
      {ranks.flatMap((rank) =>
        files.map((file) => {
          const index = rank * 8 + file;
          const name = makeSquare(index);
          const piece = pos.board.get(index);
          return (
            <View
              key={name}
              style={{
                width: squareSize,
                height: squareSize,
                backgroundColor: LIGHT.has(index) ? boardColors.light : boardColors.dark,
              }}
            >
              {lit.includes(name) ? (
                <View
                  style={[StyleSheet.absoluteFill, { backgroundColor: boardColors[highlight] }]}
                />
              ) : null}
              {/* Positioned like the tint and after it, so the piece paints above it on the web too. */}
              {piece ? (
                <View style={StyleSheet.absoluteFill}>
                  <PieceGlyph role={piece.role} color={piece.color} size={squareSize} />
                </View>
              ) : null}
            </View>
          );
        }),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 2, overflow: 'hidden' },
});
