import { Text, useTheme } from '@reactive/silk-native';
import { StyleSheet, View } from 'react-native';

import type { Material, MaterialRole } from '@/game/material';
import { fonts } from '@/theme/theme';

import { PieceGlyph } from './PieceGlyph';

/** Glyph size, a little over the name beside it so the pieces read at a glance. */
const SIZE = 22;
/** How much of a glyph the next piece of the same kind covers. */
const OVERLAP = SIZE * 0.45;

/**
 * The pieces one side is up, grouped by kind with each group's pieces
 * stacked, and its lead in points (`+2`) when it's ahead. Pieces both sides
 * have lost cancel out (see `material`), so this is empty when material is
 * even.
 */
export function Captures({ pieces, lead }: Material) {
  const { theme } = useTheme();
  const { color } = theme.semantic;
  if (pieces.length === 0) return null;

  return (
    <View accessible accessibilityLabel={describe(pieces, lead)} style={styles.row}>
      {pieces.map((role, i) => (
        <View
          // Pieces never reorder, so their place in the list names them.
          key={i}
          style={i > 0 && (role === pieces[i - 1] ? styles.stacked : styles.nextGroup)}
        >
          <PieceGlyph role={role} ink={color.textSecondary} cut={color.surface} size={SIZE} />
        </View>
      ))}
      {lead > 0 ? (
        <Text role="label" style={[styles.lead, { color: color.textPrimary }]}>
          +{lead}
        </Text>
      ) : null}
    </View>
  );
}

/** "Up a rook and 2 pawns, 7 points ahead", for screen readers. */
function describe(pieces: readonly MaterialRole[], lead: number) {
  const counts = new Map<MaterialRole, number>();
  for (const role of pieces) counts.set(role, (counts.get(role) ?? 0) + 1);
  const parts = Array.from(counts, ([role, n]) =>
    n === 1 ? `a ${role}` : `${n} ${role}s`,
  );
  const list =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  const ahead = lead > 0 ? `, ${lead} ${lead === 1 ? 'point' : 'points'} ahead` : '';
  return `Up ${list}${ahead}`;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, overflow: 'hidden' },
  stacked: { marginLeft: -OVERLAP },
  nextGroup: { marginLeft: 1 },
  lead: { fontFamily: fonts.mono, marginLeft: 6 },
});
