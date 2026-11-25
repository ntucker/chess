import { springMotion, Text, useMotion, useReducedMotion, useTheme } from '@reactive/silk-native';
import { oklch } from '@reactive/silk-core/color';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  type CSSAnimationKeyframes,
  type CSSAnimationTimingFunction,
  cubicBezier,
} from 'react-native-reanimated';

import { type Ending, endingWords, type Mood } from '@/game/ending';
import { ACT_TIMES, type CardBand, cardBand } from '@/board/endingAct';
import type { Color } from '@/game/replay';
import { useSchemeColors } from '@/theme/shownTheme';
import type { SchemeColors } from '@/theme/theme';

interface Props {
  readonly ending: Ending;
  /** The other side's name, as its name bar shows it. */
  readonly rival: string;
  /** The side at the bottom of the board, so the card keeps off the two kings and the last move. */
  readonly orientation: Color;
  /** The learner put the card aside to see the board under it: it fades out until this is false. */
  readonly aside?: boolean;
}

/**
 * Names the result over the board as the game ends: who won, or that nobody
 * did. It is a playbill's banner across the board, which comes on once the
 * board has acted the ending out (Board.tsx), in step with it through
 * ACT_TIMES. It stays for as long as the board shows the final position,
 * keeping off both kings (and the mating piece, where the kings leave room),
 * and fades while it is put `aside` so the whole position can be studied. A win
 * springs open in the accent color; a loss comes down slowly and plainly.
 */
export function EndingCard({ ending, rival, orientation, aside = false }: Props) {
  const { theme } = useTheme();
  const schemeColors = useSchemeColors();
  const reducedMotion = useReducedMotion();
  // Put aside and back, like a toggle.
  const fade = useMotion('snappy');
  // The board's width sets the type's size, so the banner fits a phone's board and fills a desktop's.
  const [width, setWidth] = useState(0);
  const { mood } = ending;
  const { eyebrow, title } = endingWords(ending, rival);
  const look = cardLook(mood, theme, schemeColors);
  const size = cardSizes(width, title, mood);
  const cue = reducedMotion ? STILL : CUES[mood];
  // Without motion the board shows its ending at once, so the card doesn't wait for it.
  const start = reducedMotion ? 0 : ACT_TIMES[mood].card;
  const band = cardBand(ending, orientation);
  const at = (step: Step | undefined) => step && play(step, start);
  const ornament = <Ornament color={look.rule} star={mood === 'won'} />;
  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        styles.board,
        BANDS[band],
        // A transition here, since the band inside animates its own opacity as it comes on.
        {
          opacity: aside ? 0 : 1,
          transitionProperty: 'opacity',
          transitionDuration: fade.durationMs,
          transitionTimingFunction: fade.easing,
        },
      ]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width ? (
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
      ) : null}
    </Animated.View>
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

type Theme = ReturnType<typeof useTheme>['theme'];

/**
 * The banner's colors. A win is in the accent (spotlight gold on velvet, or
 * curtain red on the program's paper); a loss and a draw are in plain ink
 * on a duller ground, so only a win looks like a celebration.
 */
function cardLook(mood: Mood, theme: Theme, schemeColors: SchemeColors) {
  const { color, shadow } = theme.semantic;
  const { accent, neutral } = color.tones;
  const { offsetY, blur, opacity } = shadow.overlay;
  const won = mood === 'won';
  return {
    ground: won ? schemeColors.endingGroundWon : schemeColors.endingGroundPlain,
    shadow: `0px ${offsetY}px ${blur}px ${oklch(0, 0, 0, opacity)}`,
    rule: won ? accent.solid : neutral.border,
    eyebrow: won ? schemeColors.endingEyebrowWon : color.textSecondary,
    title: won ? accent.solid : color.textPrimary,
    gleam: schemeColors.endingGleam,
  };
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

/** One part's entrance: its keyframes, how long after the card's start, and its motion. */
interface Step {
  readonly keyframes: CSSAnimationKeyframes;
  readonly delay: number;
  readonly durationMs: number;
  readonly easing: CSSAnimationTimingFunction;
}

/** `step` as a Reanimated CSS animation starting `start` ms after the card is shown. */
function play({ keyframes, delay, durationMs, easing }: Step, start: number) {
  return {
    animationName: keyframes,
    animationDuration: durationMs,
    animationDelay: start + delay,
    animationTimingFunction: easing,
    // Held at its first frame until its turn, and at its last after.
    animationFillMode: 'both',
  } as const;
}

const shown = { opacity: 1, transform: [{ translateY: 0 }] };
const FADE_IN = { from: { opacity: 0 }, to: { opacity: 1 } };
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

/** Springs for a win: the ground snaps open, and the title lands with more bounce. */
const SNAP = springMotion({ durationMs: 400, bounce: 0.3 });
const LAND = springMotion({ durationMs: 500, bounce: 0.4 });
const EASE_OUT = cubicBezier(0.2, 0, 0, 1);

/** Each mood's steps, by the part that plays them; a part without one is simply there. */
interface Cues {
  readonly band?: Step;
  readonly ground?: Step;
  readonly gleam?: Step;
  readonly rules?: Step;
  readonly eyebrow?: Step;
  readonly title?: Step;
}

const CUES: Readonly<Record<Mood, Cues>> = {
  // Open, edged, named: each part 80 ms or so after the last, and a gleam once it has settled.
  won: {
    ground: { keyframes: UNFURL, delay: 0, ...SNAP },
    rules: { keyframes: DRAW, delay: 90, durationMs: 420, easing: EASE_OUT },
    eyebrow: { keyframes: RISE, delay: 170, durationMs: 280, easing: EASE_OUT },
    title: { keyframes: SWELL, delay: 220, ...LAND },
    gleam: { keyframes: GLEAM, delay: 620, durationMs: 700, easing: 'ease-in-out' },
  },
  // No spring and nothing drawn: it comes down.
  lost: {
    band: { keyframes: DESCEND, delay: 0, durationMs: 620, easing: EASE_OUT },
    title: { keyframes: FADE_IN, delay: 260, durationMs: 520, easing: 'ease-out' },
  },
  drawn: {
    band: { keyframes: FADE_IN, delay: 0, durationMs: 320, easing: 'ease-out' },
  },
};

/** With reduced motion every mood only fades in. */
const STILL: Cues = {
  band: { keyframes: FADE_IN, delay: 0, durationMs: 150, easing: 'ease-out' },
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
