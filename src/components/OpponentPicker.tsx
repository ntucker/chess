import Ionicons from '@expo/vector-icons/Ionicons';
import { Popover, Pressable, Text, useTheme } from '@reactive/silk-native';
import { type ComponentRef, useEffect, useId, useRef, useState } from 'react';
import {
  type KeyDownEvent,
  type PointerEvent as ViewPointerEvent,
  StyleSheet,
  View,
} from 'react-native';

import { hoversControl } from '@/board/pointer';
import { describeOpponent, type Opponent } from '@/opponent/opponent';
import { reload } from '@/files/newVersion';
import { type DownloadFailure, useFullStockfishDownload } from '@/resources/download';
import { useSettings, useSettingsDispatch } from '@/settings/SettingsProvider';
import { OUTDATED_NEEDS } from '@/stockfish/fullFiles';

import { StrengthSlider } from './StrengthSlider';

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

  const { level, lead } = describeOpponent(opponent);
  return (
    <>
      <Pressable
        ref={trigger}
        accessibilityRole="button"
        accessibilityLabel={`${lead} ${level}, opponent strength`}
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
  // Gives way before the strength and its chevron beside it.
  progress: { flexShrink: 1, minWidth: 0, fontVariant: ['tabular-nums'] },
  reload: { flexShrink: 0 },
  underlined: { textDecorationLine: 'underline' },
  // Room for five ratings to sit apart, and as wide as a 360 px phone allows (Silk keeps 8 px from each edge).
  popover: { width: 344, padding: 6 },
});
