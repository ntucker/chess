import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, type PressableState, Spinner, Text, useTheme } from '@reactive/silk-native';
import { type ReactNode, useState } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { Captures } from '@/game/material';
import { PLAYER_DISC } from '@/theme/sideBySide';
import { type Color, opposite } from '@/game/replay';
import { narrowLength, narrowStyles, spokenOnly } from '@/theme/narrow';
import { useNarrowPart, useNarrowStyles } from '@/theme/Narrow';
import { pieceColors } from '@/theme/pieceColors';

import { CapturesChip } from './CapturesChip';
import { Tip } from './Tip';

interface Props {
  readonly name: string;
  readonly detail: string;
  /** Show `detail` on a wide page only: on a narrow one, `detailControl` says enough. */
  readonly detailWideOnly?: boolean;
  /** A control that ends the detail's line, such as the opponent's strength. */
  readonly detailControl?: ReactNode;
  readonly color: Color;
  /** It's this player's turn in the latest position. */
  readonly toMove: boolean;
  /** This player's engine is choosing a move: the disc's ring turns. */
  readonly thinking?: boolean;
  /** This player's engine is downloading: the disc's ring fills, with how far in a tip. */
  readonly download?: DiscDownload;
  /** What each side is up and has taken on the board shown: the chip shows this player's edge. */
  readonly captures: Captures;
  /** Pressing the disc swaps the sides; it shows a swap graphic while pointed at. */
  readonly swap?: Swap;
  /** Controls at the end of the bar, such as the move stepper. */
  readonly children?: ReactNode;
  /** The bar's size; the screen fixes its height to line it up with the board. */
  readonly style?: StyleProp<ViewStyle>;
}

/** A download the disc's ring shows. */
export interface DiscDownload {
  /** What is downloading, as its tip names it: "Full Stockfish". */
  readonly label: string;
  /** How much has arrived, in whole percent. */
  readonly percent: number;
}

/** What pressing a player's disc does. */
interface Swap {
  /** Names it for screen readers, such as "Play as Black". */
  readonly label: string;
  readonly onPress: () => void;
}

const DISC_BORDER = narrowLength('player-disc-border', 2.5);
/** How far a raised Surface's shadow reaches: Silk's offset of 4 plus its blur of 12. */
const CHIP_SHADOW = 16;
/** The swap graphic inside a wide page's disc, within its border. */
const SWAP_ICON = 16;

/** A name plate above or below the board, lit while that side is to move. */
export function PlayerBar({
  name,
  detail,
  detailWideOnly,
  detailControl,
  color,
  toMove,
  thinking,
  download,
  captures,
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
  const disc = (
    <Disc color={color} toMove={toMove} swap={swap}>
      {download ? (
        <DownloadRing {...download} />
      ) : thinking ? (
        <Spinner
          size="sm"
          tone="accent"
          label={`${name} is thinking`}
          style={[styles.ring, styles.turning]}
        />
      ) : null}
    </Disc>
  );
  return (
    <View style={[styles.bar, style]}>
      {download ? (
        // On the disc as a whole, so a disc that swaps the sides keeps its press.
        <Tip tip={`${download.label}: ${download.percent}% downloaded`}>{disc}</Tip>
      ) : (
        disc
      )}
      <View {...part('player-names', styles.names)}>
        {/* Only its children take presses: its padding reaches over its neighbours. */}
        <View pointerEvents="box-none" style={styles.nameLine}>
          <Text role="headingSm" numberOfLines={1} style={styles.name}>
            {name}
          </Text>
          <CapturesChip captures={captures} color={color} />
        </View>
        <View style={[styles.detail, detailWideOnly && styles.controlOnly]}>
          <Text {...caption} {...part(detailWideOnly && 'wide-only', styles.detailText)}>
            {detail}
          </Text>
          {detailControl}
          {/* The disc's lit ring shows it; screen readers hear it. */}
          {toMove ? <Text style={spokenOnly}>to move</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

/**
 * The side's disc, lit while it is to move; with `swap`, a button that swaps
 * the sides. `children` is a ring drawn over its border (`styles.ring`).
 */
function Disc({
  color,
  toMove,
  swap,
  children,
}: Pick<Props, 'color' | 'toMove' | 'swap' | 'children'>) {
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
  if (!swap) return <View style={look}>{children}</View>;
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
      {(state) => (
        <>
          {children}
          {pointed(state) ? (
            // A narrow page's dot has no room for it, and no pointer to hover.
            <View {...part('wide-only')}>
              <Ionicons
                name="swap-vertical"
                size={SWAP_ICON}
                color={pieceColors[opposite(color)]}
              />
            </View>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

/**
 * The disc's ring filling clockwise from the top as `percent` arrives, its
 * name and progress told to screen readers. Drawn once the ring's box is
 * measured, since its stroke is the disc's border.
 */
function DownloadRing({ label, percent }: DiscDownload) {
  const { theme } = useTheme();
  const styles = useNarrowStyles(STYLES);
  const { tones } = theme.semantic.color;
  const [size, setSize] = useState(0);
  // A narrow page's dot has the narrow border: the two sizes never meet.
  const border = size < PLAYER_DISC.size.wide ? DISC_BORDER.narrow : DISC_BORDER.wide;
  const radius = (size - border) / 2;
  const around = 2 * Math.PI * radius;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${label} downloading`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      onLayout={(event) => setSize(event.nativeEvent.layout.width)}
      style={styles.ring}
    >
      {size ? (
        <Svg width={size} height={size}>
          {/* The track hides the disc's own border, lit while the player is to move. */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={tones.neutral.border}
            strokeWidth={border}
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={tones.accent.solid}
            strokeWidth={border}
            strokeLinecap="round"
            strokeDasharray={around}
            strokeDashoffset={around * (1 - percent / 100)}
            // From the top, as a clock's hand starts.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
      ) : null}
    </View>
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
  // Over the disc's border, its own box: the disc's inside is its padding box.
  ring: {
    position: 'absolute',
    top: px(DISC_BORDER.times(-1)),
    left: px(DISC_BORDER.times(-1)),
    right: px(DISC_BORDER.times(-1)),
    bottom: px(DISC_BORDER.times(-1)),
  },
  // Silk's spinner, sized to the ring and as thick as the border it turns over.
  turning: { width: 'auto', height: 'auto', borderWidth: px(DISC_BORDER) },
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
    // Room inside the clip for the captures chip's shadow, which Android
    // would cut square at the line's edges; the margins give it back.
    paddingVertical: CHIP_SHADOW,
    marginVertical: -CHIP_SHADOW,
    paddingRight: CHIP_SHADOW,
    marginRight: -CHIP_SHADOW,
  },
  // The detail gives way as a whole. Its flexShrink is a weight against the
  // name's line's 1, kept far above it, so a short name ("White") stays whole
  // beside a switch at the bar's end.
  detail: { flexDirection: 'row', alignItems: 'baseline', gap: 4, flexShrink: 1000, minWidth: 0 },
  // Where only its control shows (a narrow page with `detailWideOnly`), it keeps
  // its width: the name's line gives way instead, its chip first. A wide page
  // stacks the two lines in a bar tall enough for both, so it changes nothing there.
  controlOnly: { flexShrink: 0 },
  // Within it, the words end in an ellipsis; a control stays whole.
  detailText: { flexShrink: 1, minWidth: 0 },
  // The captured pieces give way first (see CapturesChip), then the name ends in
  // an ellipsis; the line is clipped rather than run under the controls.
  name: { flexShrink: 1, minWidth: 0 },
}));
