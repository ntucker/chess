import { Spinner, Text, useTheme } from '@reactive/silk-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Material } from '@/game/material';
import { type Color, opposite } from '@/game/replay';
import { PHONE_LAYOUT, phoneLength, phonePart } from '@/theme/phone';
import { pieceColors } from '@/theme/pieceColors';

import { Captures } from './Captures';

interface Props {
  readonly name: string;
  readonly detail: string;
  /** A shorter `detail` for a phone-width web page, where it shares the name's line. */
  readonly brief?: string;
  readonly color: Color;
  /** It's this player's turn in the latest position. */
  readonly toMove: boolean;
  readonly thinking?: boolean;
  /** What this player is up on the board shown. */
  readonly material: Material;
  /** Controls at the end of the bar, such as the move stepper. */
  readonly children?: ReactNode;
}

/**
 * Fixed, so the screen can line other content up with the board: a bar with
 * controls at its end, and one with only the names. Shorter on a phone-width
 * web page, where the names share one line.
 */
export const PLAYER_BAR_HEIGHT = {
  controls: phoneLength('controls-bar-height', 60),
  names: phoneLength('names-bar-height', 60),
} as const;
/**
 * The disc's size and the space after it, so the screen can line things up
 * with them. A small dot on a phone-width web page, to give the board room.
 */
export const PLAYER_DISC = {
  size: phoneLength('player-disc', 28),
  gap: phoneLength('player-disc-gap', 12),
} as const;
const DISC_BORDER = phoneLength('player-disc-border', 2.5);

/** A name plate above or below the board, lit while that side is to move. */
export function PlayerBar({
  name,
  detail,
  brief,
  color,
  toMove,
  thinking,
  material,
  children,
}: Props) {
  const { theme } = useTheme();
  const { color: c } = theme.semantic;
  const turn = (text: string) => (toMove ? `${text} · to move` : text);
  const caption = {
    role: 'caption',
    tone: toMove ? 'accent' : 'secondary',
    numberOfLines: 1,
    style: styles.detail,
  } as const;
  return (
    <View style={[styles.bar, children ? styles.controlsBar : styles.namesBar]}>
      <View
        style={[
          styles.piece,
          {
            backgroundColor: pieceColors[color],
            borderColor: toMove ? c.tones.accent.solid : c.tones.neutral.border,
          },
        ]}
      />
      <View {...phonePart('player-names')} style={styles.names}>
        <View style={styles.nameLine}>
          <Text role="headingSm" numberOfLines={1} style={styles.name}>
            {name}
          </Text>
          <Captures {...material} pieceColor={opposite(color)} />
        </View>
        <Text {...caption} {...(brief ? phonePart('wide-only') : {})}>
          {turn(detail)}
        </Text>
        {brief && PHONE_LAYOUT ? (
          <Text {...caption} {...phonePart('phone-only')}>
            {turn(brief)}
          </Text>
        ) : null}
      </View>
      {thinking ? <Spinner size="sm" tone="accent" label={`${name} is thinking`} /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: PLAYER_DISC.gap.value,
  },
  controlsBar: { height: PLAYER_BAR_HEIGHT.controls.value },
  namesBar: { height: PLAYER_BAR_HEIGHT.names.value },
  piece: {
    width: PLAYER_DISC.size.value,
    height: PLAYER_DISC.size.value,
    borderRadius: 999,
    borderWidth: DISC_BORDER.value,
  },
  names: { flex: 1, minWidth: 0 },
  // On a phone-width web page the name's line and the detail share one line:
  // short of room both give way in proportion, the captured pieces first
  // (see Captures) and the detail with an ellipsis.
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
    flexShrink: 1,
    minWidth: 0,
  },
  detail: { flexShrink: 1, minWidth: 0 },
  // The captured pieces give way first (see Captures), then the name ends in
  // an ellipsis; the line is clipped rather than run under the controls.
  name: { flexShrink: 1, minWidth: 0 },
});
