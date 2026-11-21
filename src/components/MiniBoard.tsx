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
  /** Squares lit in the board's gold, and how strongly: as a last move, or a selected square. */
  readonly lit: readonly SquareName[];
  readonly light: 'lastMove' | 'selected';
  /** One square's width. */
  readonly square: number;
}

/**
 * A small still board drawn in React Native, in the big board's colors and
 * pieces, for a position shown beside text: no web view, nothing to move.
 */
export function MiniBoard({ position, orientation, lit, light, square }: Props) {
  const pos = readPositionKey(position);
  if (!pos) return null;
  // Rows top to bottom, squares left to right, as the side at the bottom sees them.
  const order = [7, 6, 5, 4, 3, 2, 1, 0];
  const rows = orientation === 'white' ? order : [...order].reverse();
  const files = orientation === 'white' ? [...order].reverse() : order;
  const size = { width: square, height: square };
  return (
    <View style={[styles.board, { width: square * 8 }]}>
      {rows.flatMap((rank) =>
        files.map((file) => {
          const index = rank * 8 + file;
          const name = makeSquare(index);
          const piece = pos.board.get(index);
          return (
            <View
              key={name}
              style={[
                size,
                { backgroundColor: (rank + file) % 2 ? boardColors.light : boardColors.dark },
              ]}
            >
              {lit.includes(name) ? (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: boardColors[light] }]} />
              ) : null}
              {piece ? <PieceGlyph role={piece.role} color={piece.color} size={square} /> : null}
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
