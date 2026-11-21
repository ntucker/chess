import Ionicons from '@expo/vector-icons/Ionicons';
import { a11yState, Pressable, useReducedMotion, useTheme } from '@reactive/silk-native';
import { type ComponentProps, type ComponentRef, useRef, useState } from 'react';
import { Dimensions, type GestureResponderEvent, type PointerEvent, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { hoversControl } from '@/board/pointer';
import { HEADER_BUTTON_SIZE, HeaderButton } from '@/components/HeaderButton';
import type { Point } from '@/motion/dom';
import { springMotion, springs } from '@/motion/spring';
import { useSettings, useSettingsDispatch } from '@/settings/SettingsProvider';
import { type Theme, THEMES } from '@/settings/settings';
import { narrowStyles } from '@/theme/narrow';
import { useNarrowStyles } from '@/theme/Narrow';
import { timingFunction } from '@/theme/timingFunction';

const CHOICES: Record<Theme, { label: string; icon: ComponentProps<typeof Ionicons>['name'] }> = {
  system: { label: "Device's theme", icon: 'contrast-outline' },
  light: { label: 'Light', icon: 'sunny-outline' },
  dark: { label: 'Dark', icon: 'moon-outline' },
};

const ICON_SIZE = 19;
/** The open choices' border width. */
const BORDER = 1;
/** The least room the open choices leave at the window's edge. */
const EDGE = 4;
/** How long a finger rests on the button before the choices open under it: Android's long press. */
const HOLD_MS = 400;
const MOTION = springMotion(springs.snappy);

/**
 * The styles placing the open choices, and the row inside them shut, by the
 * anchor's index in THEMES. `satisfies` stops the build if THEMES' length changes.
 */
const OPEN_AT = ['openAt0', 'openAt1', 'openAt2'] as const satisfies {
  length: (typeof THEMES)['length'];
};
const ROW_SHUT_AT = ['rowShutAt0', 'rowShutAt1', 'rowShutAt2'] as const satisfies {
  length: (typeof THEMES)['length'];
};
/** How many slots up or down a held finger moves to close the choices unchanged. */
const AWAY_SLOTS = 2;

/** How the choices were opened: a mouse or pen resting on the button, or a finger held on it. */
type Opened = 'hover' | 'hold';

/** The open choices. */
interface Menu {
  readonly how: Opened;
  /** The choice that opened over the button: the theme in use then. */
  readonly anchor: number;
  /** Where the first choice starts and how wide each is, in window pixels. */
  readonly left: number;
  readonly size: number;
  /** The choice the pointer or finger is on, once it moves. */
  readonly pointed?: Theme;
}

/** A choice `steps` from `menu`'s anchor; past either end, the end one. */
const stepped = (menu: Menu, steps: number) =>
  THEMES[Math.min(THEMES.length - 1, Math.max(0, menu.anchor + steps))];

/** The choice open over `pageX`. */
const slotAt = (menu: Menu, pageX: number) =>
  stepped(menu, Math.floor((pageX - menu.left) / menu.size) - menu.anchor);

/**
 * The choice a held finger picks by moving `dx` and `dy` from where it was
 * held: a slot's width per choice, after half a slot that keeps the anchor
 * (so a wobble changes nothing), past either end the end one. Moved more
 * than AWAY_SLOTS up or down, it picks nothing: the finger is leaving to
 * close the choices unchanged.
 */
function swiped(menu: Menu, dx: number, dy: number) {
  if (Math.abs(dy) > AWAY_SLOTS * menu.size) return undefined;
  return stepped(menu, Math.sign(dx) * Math.floor((Math.abs(dx) + menu.size / 2) / menu.size));
}

/** A finger: which one, and where it is. */
interface Finger extends Point {
  readonly id: number;
}

type Touches = GestureResponderEvent['nativeEvent']['touches'];

/** Finger `id`'s touch in `touches`, if it's there. */
const touchOf = (touches: Touches, id: number) =>
  [...touches].find((touch) => touch.identifier === id);

/**
 * The finger a touch event is about (it went down, moved or lifted): with
 * `id`, that finger, or undefined if the event isn't about it; without, the first.
 */
function fingerOf({ nativeEvent }: GestureResponderEvent, id?: number): Finger | undefined {
  const { changedTouches } = nativeEvent;
  const touch = id === undefined ? changedTouches[0] : touchOf(changedTouches, id);
  return touch && { id: touch.identifier, x: touch.pageX, y: touch.pageY };
}

/**
 * The header's theme button: one round button showing the theme in use.
 * A tap steps to the next theme. A resting mouse or pen (`hoversControl`),
 * or a finger held down, springs it open into all three, with the theme in
 * use staying where it is (unless that would leave the window). A mouse or
 * pen clicks one. A held finger swipes to one and lifts: the farther the
 * swipe, the farther the choice, and past either end the end one. Lifting
 * where it was held, or after moving well up or down, keeps the theme.
 */
export function ThemeSwitch() {
  const { theme } = useSettings();
  const dispatch = useSettingsDispatch();
  const { color, shadow } = useTheme().theme.semantic;
  const reducedMotion = useReducedMotion();
  const styles = useNarrowStyles(STYLES);
  const [menu, setMenu] = useState<Menu>();
  // How far the choices last moved to stay in the window, kept once they
  // close so they don't jump while fading out.
  const [shift, setShift] = useState(0);
  const button = useRef<ComponentRef<typeof View>>(null);
  // How the choices are opening or open, set before they're measured: what
  // closes them reads it, so a pointer that leaves or a finger that lifts
  // first stops them opening. What points at them reads `menu`, which
  // exists once they're measured.
  const opening = useRef<Opened>(undefined);
  // The finger pressing the button, from where it went down: a held finger's
  // swipe is measured from there, and other fingers are ignored.
  const start = useRef<Finger>(undefined);

  const choose = (choice: Theme) => dispatch({ type: 'chosen', choice: { theme: choice } });
  // Opens once measured, already inside the window, so nothing moves after it shows.
  const open = (how: Opened) => {
    const anchor = THEMES.indexOf(theme);
    // The window in measureInWindow's own coordinates. Not layout: the
    // choices float over the header, placed where they were measured.
    const bounds = { left: EDGE, right: Dimensions.get('window').width - EDGE };
    opening.current = how;
    button.current?.measureInWindow((x, _y, size) => {
      if (opening.current !== how) return;
      const left = x - anchor * size;
      const right = left + THEMES.length * size;
      const nudge =
        right + BORDER > bounds.right
          ? bounds.right - right - BORDER
          : Math.max(0, bounds.left - left + BORDER);
      setShift(nudge);
      setMenu({ how, anchor, left: left + nudge, size });
    });
  };
  const close = () => {
    opening.current = undefined;
    setMenu(undefined);
  };
  // From the latest state, so a move can't reopen what a close just shut.
  const point = (pick: (shown: Menu) => Theme | undefined) =>
    setMenu((shown) => shown && { ...shown, pointed: pick(shown) });
  // Lit: the choice pointed at, else the theme in use (whose icon alone is inked).
  const lit = menu?.pointed ?? theme;
  const { label, icon } = CHOICES[theme];
  // The choice over the button: while open, the one it opened with; shut, the theme in use.
  const anchor = menu?.anchor ?? THEMES.indexOf(theme);
  const transition = {
    transitionDuration: reducedMotion ? 0 : MOTION.durationMs,
    transitionTimingFunction: timingFunction(MOTION.easing),
  };

  return (
    <View
      style={styles.root}
      onPointerEnter={({ nativeEvent }: PointerEvent) => {
        if (hoversControl(nativeEvent.pointerType)) open('hover');
      }}
      onPointerMove={({ nativeEvent }: PointerEvent) => {
        if (menu?.how === 'hover' && hoversControl(nativeEvent.pointerType)) {
          point((shown) => slotAt(shown, nativeEvent.pageX));
        }
      }}
      onPointerLeave={({ nativeEvent }: PointerEvent) => {
        if (opening.current === 'hover' && hoversControl(nativeEvent.pointerType)) close();
      }}
      onTouchStart={(event: GestureResponderEvent) => {
        // The first finger down, which is the press: React Native gives the
        // button's touch to it. Once that finger is gone from the screen, or its
        // identifier comes back on a new finger, the next finger down starts
        // over, so a lost lift can't stick.
        const { touches, changedTouches } = event.nativeEvent;
        const from = start.current;
        const startOver = !from || touchOf(changedTouches, from.id) || !touchOf(touches, from.id);
        if (startOver) start.current = fingerOf(event);
      }}
      // A held finger keeps the button's touch as it swipes over the choices.
      onTouchMove={(event: GestureResponderEvent) => {
        const from = start.current;
        const at = from && fingerOf(event, from.id);
        if (menu?.how !== 'hold' || !from || !at) return;
        point((shown) => swiped(shown, at.x - from.x, at.y - from.y));
      }}
      onTouchEnd={(event: GestureResponderEvent) => {
        const from = start.current;
        // Where the finger lifts, which a move's render may not have reached yet.
        const at = from && fingerOf(event, from.id);
        if (!from || !at) return;
        start.current = undefined;
        if (opening.current !== 'hold') return;
        const lifted = menu && swiped(menu, at.x - from.x, at.y - from.y);
        if (lifted && lifted !== theme) choose(lifted);
        close();
      }}
      onTouchCancel={(event: GestureResponderEvent) => {
        // A cancel that doesn't list the pressing finger is another finger's and
        // leaves them open; a whole gesture's cancel lists every finger, so it closes them.
        const from = start.current;
        if (from && !fingerOf(event, from.id)) return;
        start.current = undefined;
        if (opening.current === 'hold') close();
      }}
    >
      <HeaderButton
        ref={button}
        icon={icon}
        iconSize={ICON_SIZE}
        accessibilityRole="button"
        accessibilityLabel={`Theme: ${label}`}
        accessibilityHint="Switches to the next theme"
        onPress={() => choose(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length])}
        // A mouse or pen already opened them by resting on the button.
        onLongPress={() => {
          if (!opening.current) open('hold');
        }}
        delayLongPress={HOLD_MS}
      />
      <Animated.View
        aria-hidden={!menu}
        pointerEvents={menu ? 'auto' : 'none'}
        style={[
          styles.pill,
          menu ? [styles.open, styles[OPEN_AT[anchor]]] : styles.shut,
          {
            backgroundColor: color.surfaceRaised,
            borderColor: color.borderSubtle,
            shadowOpacity: menu ? shadow.raised.opacity : 0,
            transform: [{ translateX: shift }],
          },
          // Reanimated CSS transitions, which StyleSheet's types don't know.
          // Not the shift: it is set as the choices open, and animating it
          // would slide them sideways while they fade in.
          { transitionProperty: ['left', 'width', 'opacity'], ...transition },
        ]}
      >
        <Animated.View
          style={[
            styles.row,
            menu ? styles.rowOpen : styles[ROW_SHUT_AT[anchor]],
            { transitionProperty: 'left', ...transition },
          ]}
        >
          {THEMES.map((choice) => (
            <Pressable
              key={choice}
              accessibilityRole="radio"
              accessibilityLabel={CHOICES[choice].label}
              {...a11yState({ checked: choice === theme })}
              focusable={Boolean(menu)}
              onPress={() => choose(choice)}
              style={[
                styles.slot,
                choice === lit && { backgroundColor: color.tones.neutral.subtle },
              ]}
            >
              <Ionicons
                name={CHOICES[choice].icon}
                size={ICON_SIZE}
                color={choice === theme ? color.textPrimary : color.textSecondary}
              />
            </Pressable>
          ))}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const STYLES = narrowStyles((px) => {
  const size = HEADER_BUTTON_SIZE;
  return {
    // A held finger slides over the choices rather than scrolling the page.
    root: {
      width: px(size),
      height: px(size),
      zIndex: 1,
      ...(process.env.EXPO_OS === 'web' ? { touchAction: 'none' as const } : {}),
    },
    slot: {
      width: px(size),
      height: px(size),
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Over the button. The border sits outside the slots, so each slot is a
    // whole button and the anchor's covers the button exactly.
    pill: {
      position: 'absolute',
      top: -BORDER,
      height: px(size.plus(2 * BORDER)),
      overflow: 'hidden',
      borderRadius: 999,
      borderWidth: BORDER,
      shadowColor: '#000',
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    // Shut, it is the button's size, showing the anchor through a window.
    shut: { left: -BORDER, width: px(size.plus(2 * BORDER)), opacity: 0 },
    // Open, it reaches out both ways from the anchor.
    open: { width: px(size.times(THEMES.length).plus(2 * BORDER)), opacity: 1 },
    openAt0: { left: px(size.times(0).minus(BORDER)) },
    openAt1: { left: px(size.times(-1).minus(BORDER)) },
    openAt2: { left: px(size.times(-2).minus(BORDER)) },
    row: {
      position: 'absolute',
      top: 0,
      width: px(size.times(THEMES.length)),
      flexDirection: 'row',
    },
    rowOpen: { left: 0 },
    rowShutAt0: { left: px(size.times(0)) },
    rowShutAt1: { left: px(size.times(-1)) },
    rowShutAt2: { left: px(size.times(-2)) },
  };
});
