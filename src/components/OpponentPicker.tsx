import Ionicons from '@expo/vector-icons/Ionicons';
import { a11yState, Pressable, Separator, Surface, Text, useTheme } from '@reactive/silk-native';
import { type ComponentRef, useEffect, useId, useRef, useState } from 'react';
import { type KeyDownEvent, ScrollView, StyleSheet, View } from 'react-native';

import { describeOpponent, type Opponent, OPPONENT_PRESETS, OPPONENTS } from '@/opponent/opponent';
import { useSettings, useSettingsDispatch } from '@/settings/SettingsProvider';
import { narrowLength } from '@/theme/narrow';

import { Eyebrow } from './Eyebrow';
import { Popup } from './Popup';

const WEB = process.env.EXPO_OS === 'web';

/**
 * How long the list stays once the pointer leaves it and its trigger, so the
 * pointer can cross the gap between them.
 */
const HOVER_GRACE_MS = 200;

/** A row of the list: taller on a narrow web page, to tap. */
const ROW_HEIGHT = narrowLength('menu-row-height', 34);

/** How the list was opened: by pointing at the trigger, or by pressing it (or a key). */
type Opened = 'hover' | 'pressed';

/**
 * The opponent's step on the difficulty ladder ("1500", "Stockfish") as a
 * control in running text, opening a list of the steps to pick from. With a
 * mouse the list opens as the pointer comes onto it and closes once it has
 * left both; a press or tap keeps it open until a step is picked or a press
 * lands elsewhere. From the keyboard, Enter, Space or the arrow keys open it
 * on the current step, the arrows move, and Enter or Space picks.
 */
export function OpponentPicker() {
  const { opponent } = useSettings();
  const dispatch = useSettingsDispatch();
  const { color } = useTheme().theme.semantic;
  const [opened, setOpened] = useState<Opened>();
  const trigger = useRef<ComponentRef<typeof View>>(null);
  const closing = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Whether the pointer is over the trigger, and over the list.
  const over = useRef({ trigger: false, list: false });
  const listId = useId();
  useEffect(() => () => clearTimeout(closing.current), []);

  const open = (how: Opened) => {
    clearTimeout(closing.current);
    // Pointing never undoes a press.
    setOpened((was) => (how === 'hover' ? (was ?? how) : how));
  };
  const close = () => {
    clearTimeout(closing.current);
    over.current.list = false;
    setOpened(undefined);
  };
  // The two report in either order as the pointer crosses from one to the other.
  const hover = (part: 'trigger' | 'list', on: boolean) => {
    over.current[part] = on;
    if (on) return open('hover');
    if (over.current.trigger || over.current.list) return;
    clearTimeout(closing.current);
    closing.current = setTimeout(
      () => setOpened((was) => (was === 'hover' ? undefined : was)),
      HOVER_GRACE_MS,
    );
  };
  const choose = (choice: Opponent) => {
    dispatch({ type: 'chosen', choice: { opponent: choice } });
    close();
  };
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
        {...(WEB ? { 'aria-haspopup': 'listbox', 'aria-controls': listId } : {})}
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
      {opened ? (
        <Popup
          anchor={trigger}
          onDismiss={close}
          onHoverIn={() => hover('list', true)}
          onHoverOut={() => hover('list', false)}
        >
          <OpponentList
            id={listId}
            value={opponent}
            focusOnOpen={opened === 'pressed'}
            onChoose={choose}
            onClose={close}
          />
        </Popup>
      ) : null}
    </>
  );
}

/**
 * The steps to pick from, easiest first: the presets, and the current step
 * if settings saved another, so it still shows as chosen.
 */
const stepsFor = (value: Opponent) =>
  OPPONENTS.filter((opponent) => OPPONENT_PRESETS.includes(opponent) || opponent === value);

interface ListProps {
  readonly id: string;
  readonly value: Opponent;
  /** Moves focus to the current step, as when opened from the keyboard. */
  readonly focusOnOpen: boolean;
  readonly onChoose: (opponent: Opponent) => void;
  readonly onClose: () => void;
}

/**
 * The steps to pick from, easiest first, the landmarks named, with a
 * line on how the step pointed at (or else the current one) plays.
 * One row is lit at a time, the one pointed at or focused last, and the keys
 * act on it: while the list holds focus, pointing at a row moves focus there.
 */
function OpponentList({ id, value, focusOnOpen, onChoose, onClose }: ListProps) {
  const { color, radius } = useTheme().theme.semantic;
  const [pointed, setPointed] = useState<Opponent>();
  // Whether a row holds focus, so the keys reach the list.
  const holdsFocus = useRef(false);
  const rows = useRef(new Map<Opponent, ComponentRef<typeof View>>());
  const steps = stepsFor(value);
  const focusRow = (opponent: Opponent) => rows.current.get(opponent)?.focus();

  useEffect(() => {
    if (focusOnOpen) rows.current.get(value)?.focus();
  }, [focusOnOpen, value]);

  const onKey = (event: KeyDownEvent) => {
    const { key } = event.nativeEvent;
    const at = steps.indexOf(pointed ?? value);
    const step: Record<string, number> = {
      ArrowDown: Math.min(at + 1, steps.length - 1),
      ArrowUp: Math.max(at - 1, 0),
      Home: 0,
      End: steps.length - 1,
    };
    if (Object.hasOwn(step, key)) {
      // Kept from the board's arrow keys (useStepKeys) too.
      event.preventDefault();
      focusRow(steps[step[key]]);
    } else if (key === ' ' && pointed !== undefined) {
      // React Native Web presses on Enter alone, outside buttons.
      event.preventDefault();
      onChoose(pointed);
    } else if (key === 'Tab') {
      // Focus goes back to the trigger as the list closes.
      event.preventDefault();
      onClose();
    }
  };

  const shown = describeOpponent(pointed ?? value);
  return (
    <Surface elevation="overlay" radius="md" border="subtle" style={styles.list}>
      <Eyebrow style={styles.heading}>Opponent strength</Eyebrow>
      <ScrollView
        nativeID={id}
        // A listbox on the web, which React Native's role type lacks; Android has no
        // listbox, so a radio group there.
        role={(WEB ? 'listbox' : 'radiogroup') as 'radiogroup'}
        accessibilityLabel="Opponent strength"
        onKeyDown={onKey}
        style={styles.rows}
      >
        {steps.map((opponent) => {
          const selected = opponent === value;
          const { level, preset } = describeOpponent(opponent);
          return (
            <View key={opponent}>
              {opponent === 'stockfish' ? <Separator style={styles.rule} /> : null}
              <Pressable
                ref={(row) => {
                  if (row) rows.current.set(opponent, row);
                  else rows.current.delete(opponent);
                }}
                role={WEB ? 'option' : 'radio'}
                accessibilityLabel={preset ? `${level}, ${preset}` : level}
                {...(WEB ? { 'aria-selected': selected } : a11yState({ checked: selected }))}
                // One stop in the tab order: the arrows move between the rows.
                tabIndex={-1}
                onHoverIn={() => {
                  // Enter presses the focused row, so focus follows the light.
                  if (holdsFocus.current) focusRow(opponent);
                  else setPointed(opponent);
                }}
                onFocus={() => {
                  holdsFocus.current = true;
                  setPointed(opponent);
                }}
                onBlur={() => {
                  holdsFocus.current = false;
                }}
                onPress={() => onChoose(opponent)}
                style={[
                  styles.row,
                  { borderRadius: radius.sm },
                  opponent === pointed && { backgroundColor: color.tones.neutral.subtle },
                ]}
              >
                <View style={styles.check}>
                  {selected ? (
                    <Ionicons name="checkmark" size={14} color={color.tones.accent.text} />
                  ) : null}
                </View>
                <Text
                  role="bodySm"
                  style={[styles.stepLevel, selected && { color: color.tones.accent.text }]}
                >
                  {level}
                </Text>
                {preset ? (
                  <Text role="caption" tone="secondary">
                    {preset}
                  </Text>
                ) : null}
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
      <Separator style={styles.rule} />
      <Text role="caption" tone="secondary" numberOfLines={2} style={styles.about}>
        {shown.style}
      </Text>
    </Surface>
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
  list: { width: 232, padding: 6, flexShrink: 1 },
  heading: { paddingHorizontal: 10, paddingTop: 6, paddingBottom: 6 },
  rows: { flexShrink: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: ROW_HEIGHT.value,
    paddingHorizontal: 8,
  },
  check: { width: 14, alignItems: 'center' },
  stepLevel: { flex: 1, fontVariant: ['tabular-nums'] },
  rule: { marginVertical: 4, marginHorizontal: 4 },
  // Two lines tall whatever it says, so the list keeps its size as rows are pointed at.
  about: { minHeight: 32, paddingHorizontal: 10, paddingTop: 4, paddingBottom: 6 },
});
