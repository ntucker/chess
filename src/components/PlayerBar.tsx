import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, type PressableState, Spinner, Text, useTheme } from '@reactive/silk-native';
import type { ReactNode } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

import type { Material } from '@/game/material';
import { PLAYER_DISC } from '@/components/sideBySide';
import { type Color, opposite } from '@/game/replay';
import { narrowLength, narrowStyles } from '@/theme/narrow';
import { useNarrowPart, useNarrowStyles } from '@/theme/Narrow';
import { pieceColors } from '@/theme/pieceColors';

import { Captures } from './Captures';

interface Props {
  readonly name: string;
  readonly detail: string;
  /** A shorter `detail` for a narrow page, where it shares the name's line. */
  readonly brief?: string;
  /** A control that ends the detail's line, such as the opponent's strength. */
  readonly detailControl?: ReactNode;
  readonly color: Color;
  /** It's this player's turn in the latest position. */
  readonly toMove: boolean;
  readonly thinking?: boolean;
  /** What this player is up on the board shown. */
  readonly material: Material;
  /** Pressing the disc swaps the sides; it shows a swap graphic while pointed at. */
  readonly swap?: Swap;
  /** Controls at the end of the bar, such as the move stepper. */
  readonly children?: ReactNode;
  /** The bar's size; the screen fixes its height to line it up with the board. */
  readonly style?: StyleProp<ViewStyle>;
}

/** What pressing a player's disc does. */
interface Swap {
  /** Names it for screen readers, such as "Play as Black". */
  readonly label: string;
  readonly onPress: () => void;
}

const DISC_BORDER = narrowLength('player-disc-border', 2.5);
/** The swap graphic inside a wide page's disc, within its border. */
const SWAP_ICON = 16;

/** A name plate above or below the board, lit while that side is to move. */
export function PlayerBar({
  name,
  detail,
  brief,
  detailControl,
  color,
  toMove,
  thinking,
  material,
  swap,
  children,
  style,
}: Props) {
  const styles = useNarrowStyles(STYLES);
  const part = useNarrowPart();
  const caption = {
    role: 'caption',
    tone: toMove ? 'accent' : 'secondary',
    numberOfLines: 1,
  } as const;
  return (
    <View style={[styles.bar, style]}>
      <Disc color={color} toMove={toMove} swap={swap} />
      <View {...part('player-names', styles.names)}>
        <View style={styles.nameLine}>
          <Text role="headingSm" numberOfLines={1} style={styles.name}>
            {name}
          </Text>
          <Captures {...material} pieceColor={opposite(color)} />
        </View>
        <View style={styles.detail}>
          <Text {...caption} {...part(Boolean(brief) && 'wide-only', styles.detailText)}>
            {detail}
          </Text>
          {brief ? (
            <Text {...caption} {...part('narrow-only', styles.detailText)}>
              {brief}
            </Text>
          ) : null}
          {detailControl}
          {toMove ? (
            <Text {...caption} style={styles.turn}>
              · to move
            </Text>
          ) : null}
        </View>
      </View>
      {thinking ? <Spinner size="sm" tone="accent" label={`${name} is thinking`} /> : null}
      {children}
    </View>
  );
}

/** The side's disc, lit while it is to move; with `swap`, a button that swaps the sides. */
function Disc({ color, toMove, swap }: Pick<Props, 'color' | 'toMove' | 'swap'>) {
  const { theme } = useTheme();
  const { tones } = theme.semantic.color;
  const styles = useNarrowStyles(STYLES);
  const part = useNarrowPart();
  // The ring stays the turn's alone: pointed at, the disc shows the swap graphic instead.
  const look = [
    styles.piece,
    {
      backgroundColor: pieceColors[color],
      borderColor: toMove ? tones.accent.solid : tones.neutral.border,
    },
  ];
  if (!swap) return <View style={look} />;
  const pointed = ({ hovered, focusVisible }: PressableState) => hovered || focusVisible;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={swap.label}
      onPress={swap.onPress}
      // A narrow page's disc is a small dot: the press reaches past it.
      hitSlop={8}
      focusRing={false}
      style={(state) => [
        look,
        styles.swap,
        pointed(state) && styles.swapPointed,
        state.pressed && styles.swapPressed,
      ]}
    >
      {(state) =>
        pointed(state) ? (
          // A narrow page's dot has no room for it, and no pointer to hover.
          <View {...part('wide-only')}>
            <Ionicons name="swap-vertical" size={SWAP_ICON} color={pieceColors[opposite(color)]} />
          </View>
        ) : null
      }
    </Pressable>
  );
}

const STYLES = narrowStyles((px) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(PLAYER_DISC.gap),
  },
  piece: {
    width: px(PLAYER_DISC.size),
    height: px(PLAYER_DISC.size),
    borderRadius: 999,
    borderWidth: px(DISC_BORDER),
  },
  swap: { alignItems: 'center', justifyContent: 'center' },
  // Raised a little toward the pointer, and pressed back in.
  swapPointed: { transform: [{ scale: 1.1 }] },
  swapPressed: { transform: [{ scale: 0.95 }] },
  names: { flex: 1, minWidth: 0 },
  // Where the name's line and the detail share a row (a narrow page),
  // the detail gives way first when short of room, then the name's line;
  // elsewhere they stack, and these shrink rules have nothing to do.
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
    flexShrink: 1,
    minWidth: 0,
  },
  // The detail gives way as a whole. Its flexShrink is a weight against the
  // name's line's 1, kept far above it, so a short name ("White") stays whole
  // beside a switch at the bar's end.
  detail: { flexDirection: 'row', alignItems: 'baseline', gap: 4, flexShrink: 1000, minWidth: 0 },
  // Within it, its words end in an ellipsis first, then "· to move"; a
  // control stays whole.
  detailText: { flexShrink: 100, minWidth: 0 },
  turn: { flexShrink: 1, minWidth: 0 },
  // The captured pieces give way first (see Captures), then the name ends in
  // an ellipsis; the line is clipped rather than run under the controls.
  name: { flexShrink: 1, minWidth: 0 },
}));
