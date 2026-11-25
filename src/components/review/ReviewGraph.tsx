import type { Spring } from '@reactive/silk-core';
import {
  a11yValue,
  springTo,
  Text,
  useMotion,
  useReducedMotion,
  useTheme,
} from '@reactive/silk-native';
import { memo, useEffect, useId, useMemo } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import {
  GestureDetector,
  useExclusiveGestures,
  useHoverGesture,
  usePanGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import type { ReviewQuality } from '@/analysis/quality';
import { Notation } from '@/components/Notation';
import { QualityBadge } from '@/components/QualityBadge';
import type { Analysis } from '@/evaluation/evaluation';
import { type Color, opposite, shownMove } from '@/game/replay';
import {
  type GraphMark,
  graphMarks,
  guideEnd,
  plyAt,
  plyX,
  topArea,
  topShares,
  unreadSpans,
} from '@/review/graph';
import type { Review } from '@/review/useReview';
import { graphColors } from '@/theme/graphColors';
import { qualityLooks } from '@/theme/moveQuality';

/** What the graph shows of a review (`useReview`); any analyses will do, so the gallery can make them up. */
export type GraphView = { readonly analyses: readonly (Analysis | undefined)[] } & Pick<
  Review,
  'plies' | 'ply' | 'moves' | 'book' | 'moments' | 'goto'
>;

interface Props {
  readonly review: GraphView;
  /** The learner's side, drawn at the bottom, as the evaluation bar draws it. */
  readonly learner: Color;
  readonly height: number;
}

/**
 * The review's graph of the game: the evaluation bar laid on its side, one
 * step a move, with a dot at each of the learner's moments, a band along the
 * bottom over the guide's moves, and stripes over the positions no analysis
 * has read yet. A gold line marks the move shown.
 *
 * It's a scrubber: a finger dragged across it (or a mouse held down) moves a
 * line and a bubble naming the move under it, on the UI thread, and letting
 * go goes to that move; a tap or a click goes there at once, and a mouse
 * pointing at it shows the bubble. A screen reader steps it one move at a
 * time, as the arrow keys do on the web.
 */
export function ReviewGraph({ review, learner, height }: Props) {
  const { plies, ply, moves, analyses, book, moments, goto } = review;
  const { theme } = useTheme();
  const still = useReducedMotion();
  const total = moves.length;
  const top = opposite(learner);
  const shares = topShares(analyses, top);
  const marks = graphMarks(moves, analyses, learner, moments);
  // A position not read yet stands at even, under the hatch.
  const area = useSpringArea(
    shares.map((share) => share ?? 0.5),
    theme.semantic.motion.smooth,
    still,
  );
  const scrub = useScrub({ total, snaps: marks.map((mark) => mark.ply), goto });
  const percent = (at: number) => `${(at / total) * 100}%` as const;
  // The gold line slides on the app's snappy spring.
  const snappy = useMotion('snappy');
  const slide = {
    transitionProperty: 'left' as const,
    transitionDuration: snappy.durationMs,
    transitionTimingFunction: snappy.easing,
  };
  const hatch = `hatch${useId().replace(/[^\w-]/g, '')}`;
  const guide = guideEnd(book, learner);
  return (
    // On the web, an up-and-down drag that starts on it still scrolls the page.
    <GestureDetector gesture={scrub.gesture} touchAction="pan-y">
      <View
        accessible
        focusable
        accessibilityRole="adjustable"
        accessibilityLabel="Graph of the game"
        {...a11yValue({ min: 0, max: total, now: ply, text: shownMove(plies[ply].move?.san, ply) })}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={({ nativeEvent }) =>
          // The review keeps the move within the game.
          goto(ply + (nativeEvent.actionName === 'increment' ? 1 : -1))
        }
        style={[styles.graph, { height }]}
      >
        <View
          onLayout={({ nativeEvent }: LayoutChangeEvent) => scrub.measure(nativeEvent.layout.width)}
          style={styles.track}
        >
          <View
            style={[
              styles.plot,
              { backgroundColor: graphColors[learner], borderRadius: theme.semantic.radius.sm },
            ]}
          >
            {/* Sized in full: an svg left to its viewBox's shape on the web keeps that shape. */}
            <Svg
              style={StyleSheet.absoluteFill}
              width="100%"
              height="100%"
              viewBox={`0 0 ${total} 1`}
              preserveAspectRatio="none"
            >
              <AnimatedPath animatedProps={area.outline} fill={graphColors[top]} />
            </Svg>
            <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
              <Defs>
                <Pattern
                  id={hatch}
                  patternUnits="userSpaceOnUse"
                  width={HATCH}
                  height={HATCH}
                  patternTransform="rotate(45)"
                >
                  <Rect width={HATCH} height={HATCH} fill={graphColors.black} />
                  <Rect width={HATCH / 2} height={HATCH} fill={graphColors.hatch} />
                </Pattern>
              </Defs>
              {unreadSpans(shares).map(([from, to]) => (
                <Rect
                  key={from}
                  x={percent(from)}
                  width={percent(to - from)}
                  height="100%"
                  fill={`url(#${hatch})`}
                />
              ))}
            </Svg>
            <View style={[styles.middle, { backgroundColor: graphColors.middle }]} />
            {guide > 0 ? (
              <View
                style={[
                  styles.guide,
                  { width: percent(guide), backgroundColor: qualityLooks.book.color },
                ]}
              />
            ) : null}
          </View>
          <Animated.View style={[styles.line, { left: percent(ply) }, slide]} pointerEvents="none">
            <View style={[styles.lineCore, { backgroundColor: graphColors.current }]} />
          </Animated.View>
          {marks.map((mark) => (
            <Dot
              key={mark.ply}
              mark={mark}
              left={percent(mark.ply)}
              spring={area.spring}
              height={height}
            />
          ))}
          <Animated.View style={[styles.line, styles.scrub, scrub.lineStyle]} pointerEvents="none">
            <View style={[styles.lineCore, { backgroundColor: graphColors.scrub }]} />
          </Animated.View>
          <Bubble
            plies={plies}
            moves={moves}
            style={scrub.bubbleStyle}
            stripStyle={scrub.stripStyle}
          />
        </View>
      </View>
    </GestureDetector>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

// The worklets the area's spring calls come first: a worklet's helpers have
// to be defined before it.
//
// Shared values here are read with get() and written with set(), never
// `.value`: the React Compiler memoizes a closure on the `.value` paths it
// reads, which reads them while rendering.

/** `start` partway (`t`, 0 to 1) to `end`. */
function lerp(start: number, end: number, t: number): number {
  'worklet';
  return start + (end - start) * t;
}

/** The share at position `n`, partway (`progress`, 0 to 1) from `from`'s to `to`'s; a position new to `to` stands at its own. */
function shareAt(
  from: readonly number[],
  to: readonly number[],
  progress: number,
  n: number,
): number {
  'worklet';
  return lerp(from[n] ?? to[n], to[n], progress);
}

/** `from` partway (`progress`, 0 to 1) to `to`. */
function mix(from: readonly number[], to: readonly number[], progress: number): number[] {
  'worklet';
  return to.map((_, n) => shareAt(from, to, progress, n));
}

/** The area's outline, springing on `spring` to each new set of scores (or jumping, `still`), on the UI thread. */
function useSpringArea(shown: readonly number[], spring: Spring, still: boolean) {
  const scores = useSameNumbers(shown);
  const from = useSharedValue(scores);
  const to = useSharedValue(scores);
  const progress = useSharedValue(1);
  useEffect(() => {
    scheduleOnUI(
      (next: readonly number[], jump: boolean) => {
        'worklet';
        // Scores the area already springs to (as at the start) keep its spring on course.
        const same = next.length === to.get().length && next.every((s, n) => s === to.get()[n]);
        if (same) return;
        from.set(mix(from.get(), to.get(), progress.get()));
        to.set(next);
        progress.set(0);
        progress.set(springTo(1, spring, { precision: SETTLED, reduceMotion: jump }));
      },
      scores,
      still,
    );
  }, [scores, spring, still, from, to, progress]);
  const outline = useAnimatedProps(() => ({
    d: topArea(mix(from.get(), to.get(), progress.get())),
  }));
  return { spring: { from, to, progress }, outline };
}

/** The area's spring: from the shares it left, to the shares it heads for, and how far along (0 to 1). */
interface AreaSpring {
  readonly from: SharedValue<readonly number[]>;
  readonly to: SharedValue<readonly number[]>;
  readonly progress: SharedValue<number>;
}

/**
 * `values`, as the same array while its numbers stay the same, so an effect
 * that depends on it skips the arrays each render makes afresh. React may
 * still drop the memo, which costs only a rerun. An empty array's key is
 * empty, which the memo turns back into an empty array, not `[0]`.
 */
function useSameNumbers(values: readonly number[]): readonly number[] {
  const key = values.join(' ');
  return useMemo(() => (key ? key.split(' ').map(Number) : []), [key]);
}

/** How close the area's spring comes to the new scores before it stops: under a quarter pixel on the desktop's 72. */
const SETTLED = 0.003;

/**
 * The scrub gesture: where its line and bubble stand, on the UI thread, and
 * the gestures that move them. Letting go of a drag, a tap and a click go to
 * the move (`goto`), once.
 */
function useScrub({
  total,
  snaps,
  goto,
}: {
  readonly total: number;
  readonly snaps: readonly number[];
  readonly goto: (ply: number) => void;
}) {
  const at = useSharedValue(0);
  const shown = useSharedValue(false);
  const width = useSharedValue(0);
  const kept = useSameNumbers(snaps);
  const game = useSharedValue({ total, snaps: kept });
  // A shared value can't change while rendering; the gestures read this one a commit later.
  useEffect(() => {
    game.set({ total, snaps: kept });
  }, [total, kept, game]);
  const plyUnder = (x: number) => {
    'worklet';
    const { total, snaps } = game.get();
    return plyAt(x - PAD, width.get(), total, snaps);
  };
  const scrubTo = (x: number) => {
    'worklet';
    at.set(plyUnder(x));
    shown.set(true);
  };
  const follow = ({ x }: { readonly x: number }) => {
    'worklet';
    scrubTo(x);
  };
  const hide = () => {
    'worklet';
    shown.set(false);
  };
  const pan = usePanGesture({
    // Sideways only: an up-and-down drag still scrolls the page.
    activeOffsetX: [-SWAY, SWAY],
    failOffsetY: [-DRIFT, DRIFT],
    hitSlop: TOUCH_SLOP,
    onActivate: follow,
    onUpdate: follow,
    onDeactivate: (event) => {
      'worklet';
      if (!event.canceled) scheduleOnRN(goto, at.get());
    },
    onFinalize: hide,
  });
  const tap = useTapGesture({
    hitSlop: TOUCH_SLOP,
    onActivate: (event) => {
      'worklet';
      scheduleOnRN(goto, plyUnder(event.x));
    },
  });
  const hover = useHoverGesture({
    onActivate: follow,
    onUpdate: follow,
    onFinalize: hide,
  });
  const gesture = useSimultaneousGestures(hover, useExclusiveGestures(pan, tap));
  // Each style reads its shared values itself: a style reruns only for the
  // shared values its own body names, not those a helper it calls reads.
  const lineStyle = useAnimatedStyle(() => ({
    opacity: shown.get() ? 1 : 0,
    transform: [{ translateX: plyX(at.get(), width.get(), game.get().total) }],
  }));
  const bubbleStyle = useAnimatedStyle(() => {
    const x = plyX(at.get(), width.get(), game.get().total);
    // Over the line, kept within the graph.
    const left = Math.min(Math.max(x - BUBBLE.width / 2, -PAD), width.get() + PAD - BUBBLE.width);
    return { opacity: shown.get() ? 1 : 0, transform: [{ translateX: left }] };
  });
  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -at.get() * BUBBLE.width }],
  }));
  /** Takes the graph's measured width, which the gestures and the scrub's styles read. */
  const measure = (measured: number) => {
    width.set(measured);
  };
  return { gesture, measure, lineStyle, bubbleStyle, stripStyle };
}

/**
 * A dot on the graph at one of the learner's moments, in its label's color;
 * a ring for a likely one, not judged yet. Each sits on the area's edge,
 * following it as it springs (`spring`), and is two-toned so it reads on
 * either side's area.
 */
function Dot({
  mark,
  left,
  spring,
  height,
}: {
  readonly mark: GraphMark;
  readonly left: `${number}%`;
  readonly spring: AreaSpring;
  readonly height: number;
}) {
  const { from, to, progress } = spring;
  // A transform, not `top`, so following the spring lays nothing out. The
  // reads of the spring stay in the style's body: Reanimated reruns a style
  // only for the shared values its body names, not those a helper reads.
  const onEdge = useAnimatedStyle(() => {
    const edge = shareAt(from.get(), to.get(), progress.get(), mark.ply) * height;
    const center = Math.min(Math.max(edge, DOT / 2), height - DOT / 2);
    return { transform: [{ translateY: center - DOT / 2 }] };
  });
  return (
    <Animated.View
      pointerEvents="none"
      testID={mark.quality ? `dot-${mark.quality}` : 'dot-likely'}
      style={[
        styles.dot,
        { left },
        mark.quality
          ? { backgroundColor: graphColors.scrub, borderColor: graphColors.edge }
          : { backgroundColor: graphColors.edge, borderColor: graphColors.scrub, borderWidth: 2 },
        onEdge,
      ]}
    >
      {mark.quality ? (
        <View style={[styles.disc, { backgroundColor: qualityLooks[mark.quality].color }]} />
      ) : null}
    </Animated.View>
  );
}

/**
 * The bubble over the scrub line, naming the move under it: a strip of every
 * position's name in a window one name wide, slid along on the UI thread, so
 * no name waits on JavaScript while the finger moves.
 */
function Bubble({
  plies,
  moves,
  style,
  stripStyle,
}: Pick<GraphView, 'plies' | 'moves'> & {
  readonly style: AnimatedStyle;
  readonly stripStyle: AnimatedStyle;
}) {
  const { theme } = useTheme();
  const { color } = theme.semantic;
  return (
    <Animated.View
      pointerEvents="none"
      aria-hidden
      style={[
        styles.bubble,
        {
          backgroundColor: color.surfaceRaised,
          borderColor: color.borderSubtle,
          borderRadius: theme.semantic.radius.sm,
        },
        style,
      ]}
    >
      <Animated.View style={[styles.strip, stripStyle]}>
        {plies.map((position, n) => (
          <BubbleName
            key={n}
            name={shownMove(position.move?.san, n)}
            quality={n > 0 ? moves[n - 1].quality : undefined}
          />
        ))}
      </Animated.View>
    </Animated.View>
  );
}

type AnimatedStyle = ReturnType<typeof useAnimatedStyle>;

/**
 * One position's name in the bubble's strip: "24…Rxc3" and its badge. Kept
 * from render to render (`memo`), since the strip holds every position and
 * redraws with each analysis.
 */
const BubbleName = memo(function BubbleName({
  name,
  quality,
}: {
  readonly name: string;
  readonly quality?: ReviewQuality;
}) {
  return (
    <View style={styles.name}>
      <Text role="bodySm" numberOfLines={1}>
        <Notation>{name}</Notation>
      </Text>
      {quality ? <QualityBadge quality={quality} size={14} /> : null}
    </View>
  );
});

/** Room on each side of the graph, so a dot at either end isn't cut off. */
const DOT = 12;
const PAD = DOT / 2;
/** The hatch's stripes: this many px from one to the next. */
const HATCH = 6;
/** How far a finger moves sideways before the drag starts, and up or down before it gives way to a scroll. */
const SWAY = 4;
const DRIFT = 10;
/** A 48dp touch area around the phone's 36px row. */
const TOUCH_SLOP = { vertical: 6 };
const BUBBLE = { width: 112, height: 28 };

const styles = StyleSheet.create({
  graph: { paddingHorizontal: PAD },
  track: { flex: 1 },
  plot: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  middle: { position: 'absolute', left: 0, right: 0, top: '50%', height: 1 },
  guide: { position: 'absolute', left: 0, bottom: 0, height: 3 },
  // A 2px line in a dark 1px edge, centered on its position.
  line: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 4,
    marginLeft: -2,
    padding: 1,
    backgroundColor: graphColors.edge,
  },
  lineCore: { flex: 1 },
  scrub: { left: 0 },
  dot: {
    position: 'absolute',
    top: 0,
    width: DOT,
    height: DOT,
    marginLeft: -DOT / 2,
    borderRadius: DOT / 2,
    borderWidth: 1,
    padding: 1,
  },
  disc: { flex: 1, borderRadius: DOT },
  bubble: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: 6,
    left: 0,
    width: BUBBLE.width,
    height: BUBBLE.height,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 1,
  },
  strip: { flexDirection: 'row', height: '100%' },
  name: {
    width: BUBBLE.width,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
});
