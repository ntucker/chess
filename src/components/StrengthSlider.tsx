import {
  elevationBackground,
  mapSliderStyle,
  Slider,
  Text,
  Tooltip,
  useSliderMarkStyle,
  useTheme,
} from '@reactive/silk-native';
import { useId, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  describeOpponent,
  isStockfish,
  type Opponent,
  OPPONENT_PRESETS,
  OPPONENTS,
} from '@/opponent/opponent';
import { useSettings, useSettingsDispatch } from '@/settings/SettingsProvider';
import { spokenOnly } from '@/theme/narrow';
import { fonts } from '@/theme/theme';

import { Eyebrow } from './Eyebrow';
import { InfoMark } from './Tip';

const WEB = process.env.EXPO_OS === 'web';

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

/** The opponent setting on the strength slider: the bar's picker and a phone's settings sheet. */
export function OpponentStrength() {
  const { opponent } = useSettings();
  const dispatch = useSettingsDispatch();
  return (
    <StrengthSlider
      value={opponent}
      onChoose={(choice) => dispatch({ type: 'chosen', choice: { opponent: choice } })}
    />
  );
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
 * a tooltip. On the web the heading and slider together are its trigger (a
 * resting mouse, the keyboard's focus, or a tap on the heading shows it); on
 * native only the heading is, since a tap on the slider moves its thumb.
 */
function StrengthSlider({ value, onChoose }: StrengthProps) {
  // The step it opened on, from its mount: the popover and the sheet unmount it as they close.
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
  const heading = (
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
        <InfoMark size={INFO_SIZE} style={styles.info} />
      </View>
    </View>
  );
  const slider = (
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
  );
  return (
    <Tooltip.Root>
      {WEB ? (
        <Tooltip.Trigger>
          {heading}
          {slider}
          {/* aria-hidden keeps it out of the reading order; aria-describedby still reads it. */}
          <Text nativeID={tipId} aria-hidden style={styles.tip}>
            {tip}
          </Text>
        </Tooltip.Trigger>
      ) : (
        <>
          {/* A tap on the slider moves its thumb, so on native only the heading opens the tip. */}
          <Tooltip.Trigger>{heading}</Tooltip.Trigger>
          {slider}
        </>
      )}
      {/* Under the popover, clear of the scale and of the rating it opened from. */}
      <Tooltip.Content
        side="bottom"
        align="start"
        // On native it opens from the heading's foot, which the slider sits right under.
        sideOffset={WEB ? TIP_OFFSET : TIP_OFFSET + SLIDER_BOX}
      >
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
/** Space above and below the slider. */
const SLIDER_MARGIN = { top: 8, bottom: 6 } as const;
/** The slider's height with its margins: from the heading's foot to the slider's. */
const SLIDER_BOX = SLIDER_MARGIN.top + SLIDER_HEIGHT + SLIDER_MARGIN.bottom;
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
/** A popover's padding and border around the slider (OpponentPicker's). */
const POPOVER_EDGE = 7;
/** From the slider's foot to the tooltip: past a popover's edge around it, and 5 px on. */
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
    marginTop: SLIDER_MARGIN.top,
    marginBottom: SLIDER_MARGIN.bottom,
    marginLeft: 15,
    marginRight: 19,
  },
  // Out of sight and out of layout, but still readable as a description.
  tip: spokenOnly,
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
