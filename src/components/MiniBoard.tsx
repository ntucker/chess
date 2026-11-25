import { SquareSet } from 'chessops/squareSet';
import type { Color, SquareName } from 'chessops/types';
import { makeSquare } from 'chessops/util';
import { StyleSheet, View } from 'react-native';

import { readPositionKey } from '@/game/replay';
import type { PositionKey } from '@/lesson/lesson';
import { boardColors } from '@/theme/boardColors';

import { PieceGlyph } from './PieceGlyph';

interface Props {
  /** The position shown; none draws the squares alone. */
  readonly position?: PositionKey;
  /** The side at the bottom. */
  readonly orientation: Color;
  /** The squares lit in the board's gold. */
  readonly lit: readonly SquareName[];
  /** How strongly they are lit: as the big board lights its last move, or a selected square. */
  readonly highlight: 'lastMove' | 'selected';
  /** One square's width, in points; none fills the width of the board's parent. */
  readonly squareSize?: number;
}

/** Ranks or files from the eighth (h) down to the first (a). */
const DOWNWARD = [7, 6, 5, 4, 3, 2, 1, 0];
const UPWARD = [...DOWNWARD].reverse();
const LIGHT = SquareSet.lightSquares();

/**
 * A still board drawn in React Native, in the big board's colors and pieces:
 * no web view, nothing to move. Small beside text, or filling the big board's
 * frame while that board loads. Drawn as rows of squares, which share a
 * filled board's width exactly, where wrapping eight 12.5% squares could
 * push the last onto the next line.
 */
export function MiniBoard({ position, orientation, lit, highlight, squareSize }: Props) {
  const pos = position === undefined ? undefined : readPositionKey(position);
  if (pos === null) return null;
  // Rows top to bottom and squares left to right, as the side at the bottom sees them.
  const [ranks, files] = orientation === 'white' ? [DOWNWARD, UPWARD] : [UPWARD, DOWNWARD];
  const squareStyle =
    squareSize === undefined ? styles.fill : { width: squareSize, height: squareSize };
  return (
    <View
      style={[styles.board, squareSize === undefined ? styles.full : { width: squareSize * 8 }]}
    >
      {ranks.map((rank) => (
        <View key={rank} style={styles.rank}>
          {files.map((file) => {
            const index = rank * 8 + file;
            const name = makeSquare(index);
            const piece = pos?.board.get(index);
            return (
              <View
                key={name}
                style={[
                  squareStyle,
                  { backgroundColor: LIGHT.has(index) ? boardColors.light : boardColors.dark },
                ]}
              >
                {lit.includes(name) ? (
                  <View
                    style={[StyleSheet.absoluteFill, { backgroundColor: boardColors[highlight] }]}
                  />
                ) : null}
                {/* Positioned like the tint and after it, so the piece paints above it on the web too. */}
                {piece ? (
                  <View style={StyleSheet.absoluteFill}>
                    <PieceGlyph role={piece.role} color={piece.color} size={squareSize ?? '100%'} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { borderRadius: 2, overflow: 'hidden' },
  full: { width: '100%' },
  rank: { flexDirection: 'row' },
  fill: { flex: 1, aspectRatio: 1 },
});
