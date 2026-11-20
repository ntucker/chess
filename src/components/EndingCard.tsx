import { Text, useReducedMotion, useTheme } from '@reactive/silk-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  type CSSAnimationKeyframes,
  type CSSAnimationTimingFunction,
  cubicBezier,
  linear,
} from 'react-native-reanimated';

import type { Ending, Mood } from '@/board/ending';
import { ACT_TIMES, type CardBand, cardBand } from '@/board/endingAct';
import type { Color } from '@/game/replay';
import { springMotion } from '@/theme/motion';

interface Props {
  readonly ending: Ending;
  /** The other side's name, as its name bar shows it. */
  readonly rival: string;
  /**
   * The final position and the side at the bottom of the board, so the card
   * keeps off the two kings; without them it lies across the middle.
   */
  readonly fen?: string;
  readonly orientation?: Color;
}

/**
 * Names the result over the board as the game ends: who won, or that nobody
 * did. It is a playbill's banner across the board, which comes on once the
 * board has acted the ending out (Board.tsx), in step with it through
 * ACT_TIMES, and then leaves, so the final position can be studied. A win
 * springs open in the accent color; a loss comes down slowly and plainly.
 */
export function EndingCard({ ending, rival, fen, orientation }: Props) {
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();
  // The board's width sets the type's size, so the banner fits a phone's board and fills a desktop's.
  const [width, setWidth] = useState(0);
  const { mood } = ending;
  const { eyebrow, title } = endingWords(ending, rival);
  const look = cardLook(mood, theme);
  const size = cardSizes(width, title, mood);
  const cue = reducedMotion ? STILL : CUES[mood];
  const times = ACT_TIMES[mood];
  // Without motion the board shows its ending at once, so the card doesn't wait for it.
  const start = reducedMotion ? 0 : times.card;
  const band = fen && orientation ? cardBand(fen, orientation) : 'middle';
  const at = (step: Step | undefined) => step && play(step, start);
  const ornament = <Ornament color={look.rule} star={mood === 'won'} />;
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.board, BANDS[band]]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width ? (
        <Animated.View style={play(cue.leave, start + times.cardOut - times.card)}>
          <Animated.View style={[styles.band, { paddingVertical: size.pad }, at(cue.band)]}>
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                styles.ground,
                { backgroundColor: look.ground, boxShadow: look.shadow },
                at(cue.ground),
              ]}
            >
              {cue.gleam ? (
                <Animated.View
                  style={[styles.gleam, { backgroundColor: look.gleam }, at(cue.gleam)]}
                />
              ) : null}
            </Animated.View>
            <Rules color={look.rule} double={mood === 'won'} style={at(cue.rules)} />
            <Animated.View style={[styles.eyebrowRow, at(cue.eyebrow)]}>
              {ornament}
              <Text
                role="label"
                numberOfLines={1}
                style={[
                  styles.eyebrow,
                  {
                    color: look.eyebrow,
                    fontSize: size.eyebrow,
                    lineHeight: Math.round(size.eyebrow * 1.3),
                    letterSpacing: size.eyebrow * 0.26,
                  },
                ]}
              >
                {eyebrow}
              </Text>
              {ornament}
            </Animated.View>
            {/* A view animates in the title's place: on Android, nested text can't. */}
            <Animated.View style={at(cue.title)}>
              <Text
                role="headingXl"
                accessibilityRole="header"
                accessibilityLiveRegion="polite"
                numberOfLines={1}
                style={[
                  styles.title,
                  {
                    color: look.title,
                    fontSize: size.title,
                    lineHeight: Math.round(size.title * 1.12),
                  },
                ]}
              >
                {title}
              </Text>
            </Animated.View>
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** The banner's edges: a win's are a playbill's double rule, the others a single hairline. */
function Rules({
  color,
  double,
  style,
}: {
  readonly color: string;
  readonly double: boolean;
  readonly style: ReturnType<typeof play> | undefined;
}) {
  const rule = { backgroundColor: color };
  return (
    <>
      {(['top', 'bottom'] as const).map((edge) => (
        <Animated.View key={edge} style={[styles.rules, { [edge]: 0 }, style]}>
          {double ? <View style={[styles.rule, styles.heavy, rule, { [edge]: 0 }]} /> : null}
          <View style={[styles.rule, styles.faint, rule, { [edge]: double ? RULE_GAP : 0 }]} />
        </Animated.View>
      ))}
    </>
  );
}

/** What sits either side of the eyebrow: a short line, ending in a diamond for a win. */
function Ornament({ color, star }: { readonly color: string; readonly star: boolean }) {
  const ink = { backgroundColor: color };
  return (
    <View style={styles.ornament}>
      <View style={[styles.ornamentLine, styles.faint, ink]} />
      {star ? <View style={[styles.diamond, ink]} /> : null}
      <View style={[styles.ornamentLine, styles.faint, ink]} />
    </View>
  );
}

const DRAWS: Record<Exclude<Ending['reason'], 'checkmate'>, string> = {
  stalemate: 'Stalemate',
  'insufficient material': 'Not enough to mate',
  'threefold repetition': 'Threefold repetition',
  'fifty-move rule': 'Fifty-move rule',
};

/** What the card says. */
export function endingWords({ mood, reason }: Ending, rival: string) {
  if (reason !== 'checkmate') return { eyebrow: 'Draw', title: DRAWS[reason] };
  return { eyebrow: 'Checkmate', title: mood === 'won' ? 'You win' : `${rival} wins` };
}

type Theme = ReturnType<typeof useTheme>['theme'];

/**
 * The banner's colors. A win is in the accent (spotlight gold on velvet, or
 * curtain red on the program's paper); a loss and a draw are in plain ink
 * on a duller ground, so only a win looks like a celebration.
 */
function cardLook(mood: Mood, theme: Theme) {
  const { color, shadow } = theme.semantic;
  const { accent, neutral } = color.tones;
  const dark = theme.colorScheme === 'dark';
  const { offsetY, blur, opacity } = shadow.overlay;
  const won = mood === 'won';
  return {
    ground: alpha(won ? color.surfaceRaised : color.surfaceSunken, GROUND_ALPHA),
    shadow: `0px ${offsetY}px ${blur}px rgba(0, 0, 0, ${opacity})`,
    rule: won ? accent.solid : neutral.border,
    // Small type takes the accent's text color, which is lighter than its solid on velvet.
    eyebrow: won ? (dark ? accent.text : accent.solid) : color.textSecondary,
    title: won ? accent.solid : color.textPrimary,
    gleam: alpha(dark ? color.textPrimary : accent.solid, dark ? 0.1 : 0.07),
  };
}

/** Lets a little of the board through, so the banner lies on it rather than cutting it in two. */
const GROUND_ALPHA = 0.94;

/** `hex` (#rrggbb) at `opacity`. */
function alpha(hex: string, opacity: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${opacity})`;
}

/** A win's title is the largest, a loss's smaller and a draw's smaller still. */
const TITLE_SCALE: Record<Mood, number> = { won: 1, lost: 0.8, drawn: 0.62 };
/** The display serif's letters are about this wide, as a share of the type's size. */
const LETTER_WIDTH = 0.52;

/**
 * Type and padding for a board `width` wide: about two ranks tall in all,
 * with the title shrunk until a long name ("Maia 1500 wins") fits on one line.
 */
function cardSizes(width: number, title: string, mood: Mood) {
  const clamp = (min: number, n: number, max: number) => Math.min(max, Math.max(min, n));
  const fits = (width * 0.86) / (title.length * LETTER_WIDTH);
  return {
    title: Math.round(Math.min(clamp(24, width * 0.15, 76) * TITLE_SCALE[mood], fits)),
    eyebrow: Math.round(clamp(10, width * 0.032, 14)),
    pad: Math.round(clamp(12, width * 0.045, 26)),
  };
}

/** One part's entrance or exit: its keyframes, how long after the card's start, and its motion. */
interface Step {
  readonly keyframes: CSSAnimationKeyframes;
  readonly delay: number;
  readonly durationMs: number;
  readonly easing: string;
}

/** `step` as a Reanimated CSS animation starting `start` ms after the card is shown. */
function play({ keyframes, delay, durationMs, easing }: Step, start: number) {
  return {
    animationName: keyframes,
    animationDuration: durationMs,
    animationDelay: start + delay,
    animationTimingFunction: timingFunction(easing),
    // Held at its first frame until its turn, and at its last after.
    animationFillMode: 'both',
  } as const;
}

/**
 * A CSS easing as a Reanimated timing function. Reanimated takes the named
 * curves as strings, but `cubic-bezier(...)` and `linear(...)` only as its
 * own objects.
 */
function timingFunction(easing: string): CSSAnimationTimingFunction {
  const call = /^(cubic-bezier|linear)\((.*)\)$/.exec(easing);
  if (!call) return easing as CSSAnimationTimingFunction;
  const numbers = call[2].split(',').map(Number);
  if (call[1] === 'linear') return linear(...numbers);
  const [x1, y1, x2, y2] = numbers;
  return cubicBezier(x1, y1, x2, y2);
}

const shown = { opacity: 1, transform: [{ translateY: 0 }] };
const FADE_IN = { from: { opacity: 0 }, to: { opacity: 1 } };
const FADE_OUT = { from: { opacity: 1 }, to: { opacity: 0 } };
/** The ground opens from a line across the board. */
const UNFURL = {
  from: { opacity: 0, transform: [{ scaleY: 0.05 }] },
  to: { opacity: 1, transform: [{ scaleY: 1 }] },
};
/** A rule draws itself outward from the middle. */
const DRAW = { from: { transform: [{ scaleX: 0 }] }, to: { transform: [{ scaleX: 1 }] } };
const RISE = { from: { opacity: 0, transform: [{ translateY: 8 }] }, to: shown };
const SWELL = {
  from: { opacity: 0, transform: [{ scale: 0.7 }] },
  to: { opacity: 1, transform: [{ scale: 1 }] },
};
const DESCEND = { from: { opacity: 0, transform: [{ translateY: -14 }] }, to: shown };
/** A light crossing the banner once, from off its left edge to off its right. */
const GLEAM = {
  from: { transform: [{ translateX: '-160%' }, { skewX: '-20deg' }] },
  to: { transform: [{ translateX: '560%' }, { skewX: '-20deg' }] },
};
const LIFT_AWAY = { from: shown, to: { opacity: 0, transform: [{ translateY: -10 }] } };
const SINK_AWAY = { from: shown, to: { opacity: 0, transform: [{ translateY: 12 }] } };

/** Springs for a win: the ground snaps open, and the title lands with more bounce. */
const SNAP = springMotion({ duration: 0.4, bounce: 0.3 });
const LAND = springMotion({ duration: 0.5, bounce: 0.4 });
const EASE_OUT = 'cubic-bezier(0.2, 0, 0, 1)';
const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';

/** Each mood's steps, by the part that plays them; a part without one is simply there. */
interface Cues {
  readonly band?: Step;
  readonly ground?: Step;
  readonly gleam?: Step;
  readonly rules?: Step;
  readonly eyebrow?: Step;
  readonly title?: Step;
  readonly leave: Step;
}

const CUES: Readonly<Record<Mood, Cues>> = {
  // Open, edged, named: each part 80 ms or so after the last, and a gleam once it has settled.
  won: {
    ground: { keyframes: UNFURL, delay: 0, ...SNAP },
    rules: { keyframes: DRAW, delay: 90, durationMs: 420, easing: EASE_OUT },
    eyebrow: { keyframes: RISE, delay: 170, durationMs: 280, easing: EASE_OUT },
    title: { keyframes: SWELL, delay: 220, ...LAND },
    gleam: { keyframes: GLEAM, delay: 620, durationMs: 700, easing: 'ease-in-out' },
    leave: { keyframes: LIFT_AWAY, delay: 0, durationMs: 300, easing: EASE_IN },
  },
  // No spring and nothing drawn: it comes down, and later sinks away.
  lost: {
    band: { keyframes: DESCEND, delay: 0, durationMs: 620, easing: EASE_OUT },
    title: { keyframes: FADE_IN, delay: 260, durationMs: 520, easing: 'ease-out' },
    leave: { keyframes: SINK_AWAY, delay: 0, durationMs: 460, easing: EASE_IN },
  },
  drawn: {
    band: { keyframes: FADE_IN, delay: 0, durationMs: 320, easing: 'ease-out' },
    leave: { keyframes: FADE_OUT, delay: 0, durationMs: 320, easing: 'ease-in' },
  },
};

/** With reduced motion every mood only fades, in and out. */
const STILL: Cues = {
  band: { keyframes: FADE_IN, delay: 0, durationMs: 150, easing: 'ease-out' },
  leave: { keyframes: FADE_OUT, delay: 0, durationMs: 150, easing: 'ease-in' },
};

/** A rank of the board, which a banner off the middle starts one of from the edge. */
const RANK = '12.5%';
const BANDS: Record<CardBand, object> = {
  upper: { justifyContent: 'flex-start', paddingTop: RANK },
  middle: { justifyContent: 'center' },
  lower: { justifyContent: 'flex-end', paddingBottom: RANK },
};

/** Between a win's heavy rule and the hairline inside it. */
const RULE_GAP = 4;

const styles = StyleSheet.create({
  // Presses pass through to the board, which has nothing to press once the game is over.
  board: { pointerEvents: 'none' },
  band: { alignItems: 'center', paddingHorizontal: 12, gap: 2 },
  ground: { overflow: 'hidden' },
  gleam: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '22%',
    transform: [{ translateX: '-160%' }, { skewX: '-20deg' }],
  },
  // No taller than the banner's edge: its rules are placed from that edge.
  rules: { position: 'absolute', left: 0, right: 0, height: 0 },
  rule: { position: 'absolute', left: 0, right: 0, height: 1 },
  heavy: { height: 2 },
  faint: { opacity: 0.55 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eyebrow: { textTransform: 'uppercase' },
  ornament: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ornamentLine: { width: 14, height: 1 },
  diamond: { width: 5, height: 5, transform: [{ rotate: '45deg' }] },
  title: { textAlign: 'center', letterSpacing: -0.4 },
});
