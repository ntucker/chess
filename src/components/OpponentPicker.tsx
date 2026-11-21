import Ionicons from '@expo/vector-icons/Ionicons';
import { Listbox, Popover, Pressable, Separator, Text, useTheme } from '@reactive/silk-native';
import { type ComponentRef, useEffect, useId, useRef, useState } from 'react';
import {
  type KeyDownEvent,
  type PointerEvent as ViewPointerEvent,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { hoversControl } from '@/board/pointer';
import { describeOpponent, type Opponent, OPPONENT_PRESETS, OPPONENTS } from '@/opponent/opponent';
import { reload } from '@/files/newVersion';
import { type DownloadFailure, useFullStockfishDownload } from '@/resources/download';
import { useSettings, useSettingsDispatch } from '@/settings/SettingsProvider';
import { FROM_OWN_SITE } from '@/stockfish/fullFiles';
import { narrowLength, narrowStyles } from '@/theme/narrow';
import { useNarrowStyles } from '@/theme/Narrow';

import { Eyebrow } from './Eyebrow';

const WEB = process.env.EXPO_OS === 'web';

/**
 * How long the list stays once the pointer leaves it and its trigger, so the
 * pointer can cross the gap between them.
 */
const HOVER_GRACE_MS = 200;

/** A row of the list: taller on a narrow page, to tap. */
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
  // A finger's pointer leaves as it lifts, so only a hovering pointer counts on the list.
  const hoverList = ({ nativeEvent }: ViewPointerEvent, on: boolean) => {
    if (hoversControl(nativeEvent.pointerType)) hover('list', on);
  };
  // The popover closes itself on a pick.
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
      {opponent === 'stockfish-full' ? <FullStockfishProgress /> : null}
      <Popover.Root
        open={opened !== undefined}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        anchor={trigger}
      >
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          onPointerEnter={(event) => hoverList(event, true)}
          onPointerLeave={(event) => hoverList(event, false)}
          style={styles.list}
        >
          <OpponentList
            id={listId}
            value={opponent}
            focusOnOpen={opened === 'pressed'}
            onChoose={choose}
          />
        </Popover.Content>
      </Popover.Root>
    </>
  );
}

/** What a failed download says, kept short to fit beside the name on a phone. */
const FAILURES: Record<DownloadFailure, string> = {
  retrying: '· retrying download',
  // A preview sharing the live site's copy needs a new build of its own.
  newVersion: FROM_OWN_SITE
    ? '· site updated'
    : WEB
      ? '· preview out of date'
      : '· needs an app update',
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
      {FROM_OWN_SITE && download.failure === 'newVersion' ? (
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
}

/**
 * The steps to pick from, easiest first, the landmarks named, with a line
 * on how the step pointed at (or else the current one) plays. Silk's
 * Listbox owns the keys and the light: one row is lit at a time, the one
 * pointed at or focused last.
 */
function OpponentList({ id, value, focusOnOpen, onChoose }: ListProps) {
  const { color } = useTheme().theme.semantic;
  const { row } = useNarrowStyles(ROW);
  const [lit, setLit] = useState<Opponent>();
  const steps = stepsFor(value);
  /** The step a Listbox value (a string, like every Listbox value) names. */
  const step = (key: string) => steps.find((opponent) => String(opponent) === key)!;
  const shown = describeOpponent(lit ?? value);
  return (
    <>
      <Eyebrow style={styles.heading}>Opponent strength</Eyebrow>
      <ScrollView style={styles.rows}>
        <Listbox.Root
          nativeID={id}
          accessibilityLabel="Opponent strength"
          value={String(value)}
          autoFocus={focusOnOpen}
          onValueChange={(key) => onChoose(step(key))}
          onHighlightChange={(key) => setLit(key === undefined ? undefined : step(key))}
        >
          {steps.map((opponent) => {
            const { level, preset } = describeOpponent(opponent);
            return (
              <View key={opponent}>
                {opponent === 'stockfish' ? <Separator style={styles.rule} /> : null}
                <Listbox.Item
                  value={String(opponent)}
                  accessibilityLabel={preset ? `${level}, ${preset}` : level}
                  style={row}
                >
                  <Text
                    role="bodySm"
                    style={[
                      styles.stepLevel,
                      (opponent === value || opponent === lit) && {
                        color: color.tones.accent.text,
                      },
                    ]}
                  >
                    {level}
                  </Text>
                  {preset ? (
                    <Text role="caption" tone="secondary">
                      {preset}
                    </Text>
                  ) : null}
                </Listbox.Item>
              </View>
            );
          })}
        </Listbox.Root>
      </ScrollView>
      <Separator style={styles.rule} />
      <Text role="caption" tone="secondary" numberOfLines={2} style={styles.about}>
        {shown.style}
      </Text>
    </>
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
  list: { width: 232, padding: 6 },
  heading: { paddingHorizontal: 10, paddingTop: 6, paddingBottom: 6 },
  rows: { flexShrink: 1 },
  stepLevel: { flex: 1, fontVariant: ['tabular-nums'] },
  rule: { marginVertical: 4, marginHorizontal: 4 },
  // Two lines tall whatever it says, so the list keeps its size as rows are pointed at.
  about: { minHeight: 32, paddingHorizontal: 10, paddingTop: 4, paddingBottom: 6 },
});

const ROW = narrowStyles((px) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: px(ROW_HEIGHT),
    paddingHorizontal: 8,
  },
}));
