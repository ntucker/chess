import Ionicons from '@expo/vector-icons/Ionicons';
import {
  elevationBackground,
  mapSliderStyle,
  Popover,
  Pressable,
  Slider,
  Text,
  Tooltip,
  useSliderMarkStyle,
  useTheme,
} from '@reactive/silk-native';
import { type ComponentRef, useEffect, useId, useRef, useState } from 'react';
import {
  type KeyDownEvent,
  type PointerEvent as ViewPointerEvent,
  StyleSheet,
  View,
} from 'react-native';

import { hoversControl } from '@/board/pointer';
import {
  describeOpponent,
  isStockfish,
  type Opponent,
  OPPONENT_PRESETS,
  OPPONENTS,
} from '@/opponent/opponent';
import { reload } from '@/files/newVersion';
import { type DownloadFailure, useFullStockfishDownload } from '@/resources/download';
import { useSettings, useSettingsDispatch } from '@/settings/SettingsProvider';
import { OUTDATED_NEEDS } from '@/stockfish/fullFiles';
import { visuallyHidden } from '@/theme/narrow';
import { fonts } from '@/theme/theme';

import { Eyebrow } from './Eyebrow';

const WEB = process.env.EXPO_OS === 'web';

/**
 * How long the popover stays once the pointer leaves it and its trigger, so
 * the pointer can cross the gap between them.
 */
const HOVER_GRACE_MS = 200;

/** How the popover was opened: by pointing at the trigger, or by pressing it (or a key). */
type Opened = 'hover' | 'pressed';

/**
 * The opponent's step on the difficulty ladder ("1500", "Stockfish") as a
 * control in running text, opening a rating slider with a stop for each step.
 * With a mouse the slider opens as the pointer comes onto the trigger and
 * closes once it has left both; a press or tap keeps it open until a press
 * lands elsewhere. Choosing a stop leaves it open, to try the next one. From
 * the keyboard, Enter, Space or the up and down arrows open it with the thumb
 * focused, the arrows, Home and End choose, and Escape closes it.
 */
export function OpponentPicker() {
  const { opponent } = useSettings();
  const dispatch = useSettingsDispatch();
  const { color } = useTheme().theme.semantic;
  const [opened, setOpened] = useState<Opened>();
  // A press (or key) moves focus onto the slider; pointing leaves it on the trigger.
  const focusesSlider = opened === 'pressed';
  const trigger = useRef<ComponentRef<typeof View>>(null);
  const closing = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Whether the pointer is over the trigger, and over the popover.
  const over = useRef({ trigger: false, popover: false });
  // Set while a press that began in the popover is held: aborting it stops listening for its lift.
  const pressing = useRef<AbortController>(undefined);
  const popoverId = useId();
  useEffect(
    () => () => {
      clearTimeout(closing.current);
      pressing.current?.abort();
    },
    [],
  );

  const open = (how: Opened) => {
    clearTimeout(closing.current);
    // Pointing never undoes a press.
    setOpened((was) => (how === 'hover' ? (was ?? how) : how));
  };
  const close = () => {
    clearTimeout(closing.current);
    over.current.popover = false;
    setOpened(undefined);
  };
  // The two report in either order as the pointer crosses from one to the other.
  const hover = (part: 'trigger' | 'popover', on: boolean) => {
    over.current[part] = on;
    if (on) return open('hover');
    leave();
  };
  /** Closes a popover opened by pointing, a moment after the pointer is off it and its trigger. */
  const leave = () => {
    // A press (a slide) that strays off the popover keeps it until the pointer lifts.
    if (pressing.current || over.current.trigger || over.current.popover) return;
    clearTimeout(closing.current);
    closing.current = setTimeout(
      () => setOpened((was) => (was === 'hover' ? undefined : was)),
      HOVER_GRACE_MS,
    );
  };
  // A finger's pointer leaves as it lifts, so only a hovering pointer counts on the popover.
  const hoverPopover = ({ nativeEvent }: ViewPointerEvent, on: boolean) => {
    if (hoversControl(nativeEvent.pointerType)) hover('popover', on);
  };
  // The pointer may lift anywhere on the page, so the page listens for it.
  const holdWhilePressed = () => {
    if (!WEB) return;
    pressing.current?.abort();
    const held = new AbortController();
    pressing.current = held;
    const onLift = () => {
      held.abort();
      if (pressing.current === held) pressing.current = undefined;
      leave();
    };
    window.addEventListener('pointerup', onLift, { signal: held.signal });
    window.addEventListener('pointercancel', onLift, { signal: held.signal });
  };
  const choose = (choice: Opponent) => dispatch({ type: 'chosen', choice: { opponent: choice } });
  const onTriggerKey = (event: KeyDownEvent) => {
    const { key } = event.nativeEvent;
    if (key !== 'ArrowDown' && key !== 'ArrowUp') return;
    event.preventDefault();
    open('pressed');
  };

  const { level } = describeOpponent(opponent);
  return (
    <>
      <Pressable
        ref={trigger}
        accessibilityRole="button"
        accessibilityLabel={`${level}, opponent strength`}
        aria-expanded={opened !== undefined}
        {...(WEB ? { 'aria-haspopup': 'dialog', 'aria-controls': popoverId } : {})}
        onKeyDown={onTriggerKey}
        hitSlop={8}
        onHoverIn={() => hover('trigger', true)}
        onHoverOut={() => hover('trigger', false)}
        onPress={() => (opened === 'pressed' ? close() : open('pressed'))}
        style={styles.trigger}
      >
        {({ hovered }) => {
          const lit = hovered || opened !== undefined;
          const ink = lit ? color.tones.accent.text : color.textPrimary;
          return (
            <>
              <Text
                role="caption"
                numberOfLines={1}
                style={[styles.level, { color: ink, textDecorationColor: ink }]}
              >
                {level}
              </Text>
              <Ionicons
                name="chevron-down"
                size={11}
                color={ink}
                style={opened ? styles.chevronOpen : undefined}
              />
            </>
          );
        }}
      </Pressable>
      {opponent === 'stockfish-full' ? <FullStockfishProgress /> : null}
      <Popover.Root
        open={opened !== undefined}
        onOpenChange={(isOpen) => {
          if (!isOpen) close();
        }}
        anchor={trigger}
      >
        <Popover.Content
          // Opens anew when a press takes over from pointing, so focus moves in as on any open.
          key={opened}
          nativeID={popoverId}
          role="dialog"
          aria-label="Opponent strength"
          side="bottom"
          align="start"
          sideOffset={6}
          // Silk's Popover focuses the slider's thumb as it opens; opened by pointing, it mustn't.
          onOpenAutoFocus={(event) => {
            if (!focusesSlider) event.preventDefault();
          }}
          onPointerEnter={(event) => hoverPopover(event, true)}
          onPointerLeave={(event) => hoverPopover(event, false)}
          onPointerDown={holdWhilePressed}
          style={styles.popover}
        >
          <StrengthSlider value={opponent} onChoose={choose} />
        </Popover.Content>
      </Popover.Root>
    </>
  );
}

/** What a failed download says, kept short to fit beside the name on a phone. */
const FAILURES: Record<DownloadFailure, string> = {
  retrying: '· retrying download',
  newVersion: OUTDATED_NEEDS ? `· needs ${OUTDATED_NEEDS}` : '· site updated',
};

/**
 * How full Stockfish's one download is going, beside its name while it runs
 * ("· 42% downloaded": the percent first, so a phone's crowded bar cuts the
 * word, not the number), or that it failed and is tried again, or that the
 * site has moved to a newer build, with a reload where that helps.
 */
function FullStockfishProgress() {
  const download = useFullStockfishDownload();
  if (!download) return null;
  return (
    <>
      <Text role="caption" tone="secondary" numberOfLines={1} style={styles.progress}>
        {download.failure ? FAILURES[download.failure] : `· ${download.percent}% downloaded`}
      </Text>
      {/* Beside the message rather than in it, so a narrow bar cuts the message, not the reload. */}
      {!OUTDATED_NEEDS && download.failure === 'newVersion' ? (
        <Pressable accessibilityRole="button" onPress={reload} style={styles.reload}>
          <Text role="caption" tone="accent" style={styles.underlined}>
            Reload
          </Text>
        </Pressable>
      ) : null}
    </>
  );
}

/**
 * The slider's stops, easiest first: the presets, and the current step if
 * settings saved another, so it still shows as chosen. `kept`, the step it
 * opened on, stays a stop too, so choosing another doesn't take the stop
 * away from under the thumb.
 */
const stepsFor = (value: Opponent, kept: Opponent) =>
  OPPONENTS.filter(
    (opponent) => OPPONENT_PRESETS.includes(opponent) || opponent === value || opponent === kept,
  );

/** A step's rating as the scale prints it: "1500", or "≈3200" for an estimate. */
function ratingOf(opponent: Opponent) {
  const { rating, estimated } = describeOpponent(opponent);
  return estimated ? `≈${rating}` : String(rating);
}

/** A step as a screen reader says it: "1500, Club", "Stockfish, about 3200, Best move". */
function spoken(opponent: Opponent) {
  const { level, rating, estimated, preset } = describeOpponent(opponent);
  return [level, estimated ? `about ${rating}` : undefined, preset]
    .filter((part) => part !== undefined)
    .join(', ');
}

/**
 * A step's tooltip: how it plays, and that its rating is an estimate where
 * it is one (the "≈" before it).
 */
function aboutOf(opponent: Opponent) {
  const { style, estimated } = describeOpponent(opponent);
  return estimated ? `${style} Its rating is an estimate.` : style;
}

interface StrengthProps {
  readonly value: Opponent;
  readonly onChoose: (opponent: Opponent) => void;
}

/**
 * The opponent's strength as a rating slider: a stop for each step, easiest
 * first, on a scale that breaks where Maia's ratings end and Stockfish
 * begins. Above it, the name and rating of the stop under the thumb, which
 * follow the thumb as it slides; the stop is chosen only as the thumb is let
 * go (or on each key), so sliding across full Stockfish doesn't start its
 * download. Nothing explains itself in standing text: how the stop plays is
 * the tooltip of the whole (a resting mouse, the keyboard's focus, or a tap
 * on the heading shows it).
 */
function StrengthSlider({ value, onChoose }: StrengthProps) {
  const { color } = useTheme().theme.semantic;
  const [kept] = useState(value);
  const steps = stepsFor(value, kept);
  // The stop the thumb is sliding over, until it is let go.
  const [slid, setSlid] = useState<Opponent>();
  const shown = slid ?? value;
  const shownAt = steps.indexOf(shown);
  const { level, preset } = describeOpponent(shown);
  const tip = aboutOf(shown);
  const tipId = useId();
  // React Native Web ignores accessibilityHint, so the web reads the tip from the hidden text below.
  const described = WEB ? { 'aria-describedby': tipId } : {};
  return (
    <Tooltip.Root>
      <Tooltip.Trigger>
        <View style={styles.heading}>
          <Eyebrow>Opponent strength</Eyebrow>
          <View style={styles.readout}>
            <Text role="heading" numberOfLines={1}>
              {preset ?? level}
            </Text>
            {preset ? (
              <Text role="label" tone="secondary" style={styles.rating}>
                {ratingOf(shown)}
              </Text>
            ) : null}
            {/* The mark that there is more to say: a tap on the heading says it. */}
            <Ionicons
              name="information-circle-outline"
              size={INFO_SIZE}
              color={color.textSecondary}
              style={styles.info}
            />
          </View>
        </View>
        <Slider
          size={SLIDER_SIZE}
          // A rating scale runs left to right in every language.
          dir="ltr"
          accessibilityLabel="Opponent strength"
          accessibilityHint={tip}
          {...described}
          min={0}
          max={steps.length - 1}
          step={1}
          value={[shownAt]}
          thumbValueText={[spoken(shown)]}
          onValueChange={([index]) => setSlid(steps[index])}
          onValueCommit={([index]) => {
            setSlid(undefined);
            onChoose(steps[index]);
          }}
          style={styles.slider}
        >
          <Scale steps={steps} shownAt={shownAt} />
        </Slider>
        {WEB ? (
          // aria-hidden keeps it out of the reading order; aria-describedby still reads it.
          <Text nativeID={tipId} aria-hidden style={styles.tip}>
            {tip}
          </Text>
        ) : null}
      </Tooltip.Trigger>
      {/* Under the popover, clear of the scale and of the rating it opened from. */}
      <Tooltip.Content side="bottom" align="start" sideOffset={TIP_OFFSET}>
        {tip}
      </Tooltip.Content>
    </Tooltip.Root>
  );
}

/** Silk's slider size: the thin track and small thumb, fine as a printed scale. */
const SLIDER_SIZE = 'sm';
/**
 * The slider's height, all of it pressable: the engines' names above the
 * track and the ratings below it, a press on any of which brings the thumb
 * to the nearest stop. More than a finger needs (touch.ts).
 */
const SLIDER_HEIGHT = 60;
/** Space between the thumb and the ratings under it, clear of the thumb's focus ring. */
const RATING_GAP = 6;
/** A stop's dot on the track. */
const STOP_SIZE = 6;
/** The box a stop's rating centers in: wider than "≈3200", narrower than six stops' spacing. */
const RATING_WIDTH = 48;
/** The break in the track between the engines: two slanted strokes with a gap between. */
const BREAK = { width: 12, height: 14, stroke: 2, lean: '20deg' } as const;
/** How far right of the break's middle Stockfish's name starts: clear of its strokes. */
const NAME_INSET = 10;
/** The mark that the heading has more to say. */
const INFO_SIZE = 16;
/** The popover's padding and border. */
const POPOVER_EDGE = 7;
/** From the slider's foot to the tooltip: past the popover's edge, and 5 px on. */
const TIP_OFFSET = POPOVER_EDGE + 5;

interface ScaleProps {
  readonly steps: readonly Opponent[];
  /** The index of the stop under the thumb. */
  readonly shownAt: number;
}

/**
 * What the slider draws over its track, under its thumb: a dot at each stop,
 * lit up to the thumb, its rating below, the break between Maia's last stop
 * and Stockfish's first (the scale jumps there, and so does the way of
 * playing), and each engine's name where its stops start, the thumb's lit.
 * Hidden from screen readers, which hear the thumb's own text.
 */
function Scale({ steps, shownAt }: ScaleProps) {
  const { theme, density } = useTheme();
  const { color } = theme.semantic;
  const { thumbSize } = mapSliderStyle(theme, { size: SLIDER_SIZE }, density);
  /** Places something `offset` right of the thumb's center at stop `index` (a half is midway). */
  const at = useSliderMarkStyle();
  const engineBreak = steps.findIndex(isStockfish) - 0.5;
  const onStockfish = isStockfish(steps[shownAt]!);
  // The track's own fill, so a passed stop reads as a bead on it.
  const lit = color.tones.accent.solid;
  return (
    <View aria-hidden style={StyleSheet.absoluteFill}>
      <Eyebrow
        tone={onStockfish ? 'secondary' : 'primary'}
        numberOfLines={1}
        style={[styles.engine, styles.maia]}
      >
        Maia
      </Eyebrow>
      <Eyebrow
        tone={onStockfish ? 'primary' : 'secondary'}
        numberOfLines={1}
        style={[styles.engine, at(engineBreak, NAME_INSET)]}
      >
        Stockfish
      </Eyebrow>
      {steps.map((step, index) => (
        <View
          key={step}
          style={[
            styles.stop,
            { backgroundColor: index <= shownAt ? lit : color.tones.neutral.border },
            at(index, -STOP_SIZE / 2),
          ]}
        />
      ))}
      <View
        style={[
          styles.break,
          {
            // The popover's own surface, so the track looks cut.
            backgroundColor: elevationBackground(theme, 'overlay'),
            borderColor: color.textSecondary,
          },
          at(engineBreak, -BREAK.width / 2),
        ]}
      />
      {steps.map((step, index) => (
        <Text
          key={step}
          role="caption"
          tone={index === shownAt ? 'primary' : 'secondary'}
          style={[
            styles.rating,
            styles.stopRating,
            { marginTop: thumbSize / 2 + RATING_GAP },
            at(index, -RATING_WIDTH / 2),
          ]}
        >
          {ratingOf(step)}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
    borderRadius: 4,
    paddingHorizontal: 2,
    marginHorizontal: 1,
  },
  // Dotted underneath, like a term with more behind it.
  level: {
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
  },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  // Gives way like "· to move" beside it (PlayerBar).
  progress: { flexShrink: 1, minWidth: 0, fontVariant: ['tabular-nums'] },
  reload: { flexShrink: 0 },
  underlined: { textDecorationLine: 'underline' },
  // Room for five ratings to sit apart, and as wide as a 360 px phone allows (Silk keeps 8 px from each edge).
  popover: { width: 344, padding: 6 },
  // Every line of text starts 10 px in; the slider's margins put its first and last ratings there too.
  heading: { paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4 },
  readout: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 2 },
  // DM Mono, which has the "≈" Instrument Sans lacks.
  rating: { fontFamily: fonts.mono, fontVariant: ['tabular-nums'] },
  // At the heading's far end, where it stays as the names change length.
  info: { marginLeft: 'auto', alignSelf: 'center' },
  // Silk's slider is 100% wide; between these margins it stretches instead, so it doesn't overflow.
  slider: {
    width: 'auto',
    alignSelf: 'stretch',
    height: SLIDER_HEIGHT,
    marginTop: 8,
    marginBottom: 6,
    marginLeft: 15,
    marginRight: 19,
  },
  // Out of sight and out of layout, but still readable as a description.
  tip: { ...visuallyHidden, opacity: 0 },
  engine: { position: 'absolute', top: 0, fontSize: 10, lineHeight: 13 },
  // Out to where the first rating starts.
  maia: { left: -5 },
  stop: {
    position: 'absolute',
    top: '50%',
    marginTop: -STOP_SIZE / 2,
    width: STOP_SIZE,
    height: STOP_SIZE,
    borderRadius: STOP_SIZE / 2,
  },
  break: {
    position: 'absolute',
    top: '50%',
    marginTop: -BREAK.height / 2,
    width: BREAK.width,
    height: BREAK.height,
    borderLeftWidth: BREAK.stroke,
    borderRightWidth: BREAK.stroke,
    transform: [{ rotate: BREAK.lean }],
  },
  stopRating: {
    position: 'absolute',
    top: '50%',
    width: RATING_WIDTH,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
  },
});
