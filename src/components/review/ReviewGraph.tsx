import { a11yValue, Text, useReducedMotion, useTheme } from '@reactive/silk-native';
import { useEffect, useId, useState } from 'react';
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
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import type { MoveQuality } from '@/analysis/quality';
import { QualityBadge } from '@/components/QualityBadge';
import { shownMove } from '@/components/ScoresheetDrawer';
import type { Analysis } from '@/evaluation/evaluation';
import { type Color, opposite } from '@/game/replay';
import { springMotion, springs } from '@/motion/spring';
import { springTo } from '@/motion/springTo';
import {
  type GraphMark,
  graphMarks,
  graphScores,
  guideEnd,
  plyAt,
  topArea,
  unreadSpans,
} from '@/review/graph';
import type { Review } from '@/review/useReview';
import { graphColors } from '@/theme/graphColors';
import { qualityLooks } from '@/theme/moveQuality';
import { timingFunction } from '@/theme/timingFunction';

/** What the graph shows of a review (`useReview`); any analyses will do, so the gallery can make them up. */
export type GraphView = { readonly analyses: readonly (Analysis | undefined)[] } & Pick<
  Review,
  'plies' | 'ply' | 'moves' | 'book' | 'moments' | 'goto'
>;

interface Props {
  readonly review: GraphView;
  /** The learner's side, drawn at the bottom, as the evaluation bar draws it. */
  readonly learner: Color;
  /** How tall the graph is drawn; without it, as tall as the row it's in (the phone's stepper). */
  readonly height?: number;
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
  const scores = graphScores(analyses);
  const marks = graphMarks(moves, analyses, learner, moments);
  const top = opposite(learner);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const area = useSpringArea(
    scores.map((score) => score ?? 0.5),
    top,
    still,
  );
  const scrub = useScrub({ total, width: size.width, snaps: marks.map((mark) => mark.ply), goto });
  const percent = (at: number) => `${(at / total) * 100}%` as const;
  const slide = still ? { transitionDuration: 0 } : SLIDE;
  const hatch = `hatch${useId().replace(/[^\w-]/g, '')}`;
  const guide = guideEnd(book);
  const step = (by: number) => {
    const target = ply + by;
    if (target >= 0 && target <= total) goto(target);
  };
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
          step(nativeEvent.actionName === 'increment' ? 1 : -1)
        }
        style={[styles.graph, height === undefined ? styles.fill : { height }]}
      >
        <View
          onLayout={({ nativeEvent }: LayoutChangeEvent) =>
            setSize({ width: nativeEvent.layout.width, height: nativeEvent.layout.height })
          }
          style={styles.track}
        >
          <View
            style={[
              styles.plot,
              { backgroundColor: graphColors[learner], borderRadius: theme.semantic.radius.sm },
            ]}
          >
            <Svg
              style={StyleSheet.absoluteFill}
              viewBox={`0 0 ${total} 1`}
              preserveAspectRatio="none"
            >
              <AnimatedPath animatedProps={area} fill={graphColors[top]} />
            </Svg>
            <Svg style={StyleSheet.absoluteFill}>
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
              {unreadSpans(scores).map(([from, to]) => (
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
          <Animated.View
            style={[styles.line, styles.current, { left: percent(ply) }, slide]}
            pointerEvents="none"
          >
            <View style={[styles.lineCore, { backgroundColor: graphColors.current }]} />
          </Animated.View>
          {marks.map((mark) => (
            <Dot
              key={mark.ply}
              mark={mark}
              left={percent(mark.ply)}
              top={dotTop(scores[mark.ply] ?? 0.5, top, size.height)}
              slide={slide}
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

/** The area's outline, springing to each new set of scores (or jumping, `still`), on the UI thread. */
function useSpringArea(scores: readonly number[], top: Color, still: boolean) {
  const from = useSharedValue(scores);
  const to = useSharedValue(scores);
  const progress = useSharedValue(1);
  // The scores' contents, not the array made fresh each render, start a spring.
  const key = scores.join(' ');
  useEffect(() => {
    scheduleOnUI(
      (next: readonly number[], jump: boolean) => {
        'worklet';
        from.value = mix(from.value, to.value, progress.value);
        to.value = next;
        progress.value = 0;
        progress.value = jump ? 1 : springTo(1, springs.smooth, { precision: SETTLED });
      },
      key.split(' ').map(Number),
      still,
    );
  }, [key, still, from, to, progress]);
  return useAnimatedProps(() => ({
    d: topArea(mix(from.value, to.value, progress.value), top),
  }));
}

/** `from` partway (`progress`, 0 to 1) to `to`. */
function mix(from: readonly number[], to: readonly number[], progress: number): number[] {
  'worklet';
  return to.map((score, n) => (from[n] ?? score) + (score - (from[n] ?? score)) * progress);
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
  width,
  snaps,
  goto,
}: {
  readonly total: number;
  readonly width: number;
  readonly snaps: readonly number[];
  readonly goto: (ply: number) => void;
}) {
  const at = useSharedValue(0);
  const shown = useSharedValue(false);
  const layout = useSharedValue({ total, width, snaps });
  // The snaps' contents, not the array made fresh each render, change the layout.
  const snapsKey = snaps.join(' ');
  useEffect(() => {
    layout.value = { total, width, snaps: snapsKey ? snapsKey.split(' ').map(Number) : [] };
  }, [total, width, snapsKey, layout]);
  const plyUnder = (x: number) => {
    'worklet';
    const { total, width, snaps } = layout.value;
    return plyAt(x - PAD, width, total, snaps);
  };
  const scrubTo = (x: number) => {
    'worklet';
    at.value = plyUnder(x);
    shown.value = true;
  };
  const hide = () => {
    'worklet';
    shown.value = false;
  };
  const pan = usePanGesture({
    // Sideways only: an up-and-down drag still scrolls the page.
    activeOffsetX: [-SWAY, SWAY],
    failOffsetY: [-DRIFT, DRIFT],
    hitSlop: TOUCH_SLOP,
    onActivate: (event) => {
      'worklet';
      scrubTo(event.x);
    },
    onUpdate: (event) => {
      'worklet';
      scrubTo(event.x);
    },
    onDeactivate: (event) => {
      'worklet';
      if (!event.canceled) scheduleOnRN(goto, at.value);
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
    onActivate: (event) => {
      'worklet';
      scrubTo(event.x);
    },
    onUpdate: (event) => {
      'worklet';
      scrubTo(event.x);
    },
    onFinalize: hide,
  });
  const gesture = useSimultaneousGestures(hover, useExclusiveGestures(pan, tap));
  const x = () => {
    'worklet';
    const { total, width } = layout.value;
    return total > 0 ? (at.value / total) * width : 0;
  };
  const lineStyle = useAnimatedStyle(() => ({
    opacity: shown.value ? 1 : 0,
    transform: [{ translateX: x() }],
  }));
  const bubbleStyle = useAnimatedStyle(() => {
    const { width } = layout.value;
    // Over the line, kept within the graph.
    const left = Math.min(Math.max(x() - BUBBLE.width / 2, -PAD), width + PAD - BUBBLE.width);
    return { opacity: shown.value ? 1 : 0, transform: [{ translateX: left }] };
  });
  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -at.value * BUBBLE.width }],
  }));
  return { gesture, lineStyle, bubbleStyle, stripStyle };
}

/**
 * A dot on the graph at one of the learner's moments, in its label's color;
 * a ring for a likely one, not judged yet. Each sits on the area's edge,
 * two-toned so it reads on either side's area.
 */
function Dot({
  mark,
  left,
  top,
  slide,
}: {
  readonly mark: GraphMark;
  readonly left: `${number}%`;
  readonly top: number | `${number}%`;
  readonly slide: object;
}) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.dot,
        { left, top },
        mark.quality
          ? { backgroundColor: graphColors.scrub, borderColor: graphColors.edge }
          : { backgroundColor: graphColors.edge, borderColor: graphColors.scrub, borderWidth: 2 },
        slide,
      ]}
    >
      {mark.quality ? (
        <View style={[styles.disc, { backgroundColor: qualityLooks[mark.quality].color }]} />
      ) : null}
    </Animated.View>
  );
}

/** Where a dot's top goes for the position's score: on the area's edge, kept within the graph. */
function dotTop(score: number, top: Color, height: number): `${number}%` | number {
  const share = top === 'white' ? score : 1 - score;
  if (!height) return `${share * 100}%`;
  return Math.min(Math.max(share * height, DOT / 2), height - DOT / 2) - DOT / 2;
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
  readonly style: object;
  readonly stripStyle: object;
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

/** One position's name in the bubble's strip: "24…Rxc3" and its badge. */
function BubbleName({ name, quality }: { readonly name: string; readonly quality?: MoveQuality }) {
  return (
    <View style={styles.name}>
      <Text role="bodySm" numberOfLines={1}>
        {name}
      </Text>
      {quality ? <QualityBadge quality={quality} size={14} /> : null}
    </View>
  );
}

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
const SLIDE_MOTION = springMotion(springs.snappy);
/** The gold line and the dots slide on the app's snappy spring. */
const SLIDE = {
  transitionProperty: ['left', 'top'],
  transitionDuration: SLIDE_MOTION.durationMs,
  transitionTimingFunction: timingFunction(SLIDE_MOTION.easing),
};

const styles = StyleSheet.create({
  graph: { paddingHorizontal: PAD },
  fill: { alignSelf: 'stretch', flexGrow: 1 },
  track: { flex: 1 },
  plot: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  middle: { position: 'absolute', left: 0, right: 0, top: '50%', height: 1 },
  guide: { position: 'absolute', left: 0, bottom: 0, height: 3 },
  // A 2px line in a dark 1px edge, centered on its position.
  line: { position: 'absolute', top: 0, bottom: 0, width: 4, marginLeft: -2, padding: 1 },
  lineCore: { flex: 1 },
  current: { backgroundColor: graphColors.edge },
  scrub: { left: 0, backgroundColor: graphColors.edge },
  dot: {
    position: 'absolute',
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
