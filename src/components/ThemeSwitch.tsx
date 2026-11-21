import Ionicons from '@expo/vector-icons/Ionicons';
import { a11yState, Pressable, useReducedMotion, useTheme } from '@reactive/silk-native';
import { type ComponentProps, type ComponentRef, useRef, useState } from 'react';
import { Dimensions, type GestureResponderEvent, type PointerEvent, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { hoversControl } from '@/board/pointer';
import { HEADER_BUTTON_SIZE, HeaderButton } from '@/components/HeaderButton';
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

/** The styles placing the open choices, and the row inside them shut, by the anchor's index in THEMES. */
const OPEN_AT = ['openAt0', 'openAt1', 'openAt2'] as const;
const ROW_SHUT_AT = ['rowShutAt0', 'rowShutAt1', 'rowShutAt2'] as const;

/** How the choices were opened: a mouse or pen resting on the button, or a finger held on it. */
type Opened = 'hover' | 'hold';

/** The open choices. */
interface Menu {
  readonly how: Opened;
  /** The choice that opened over the button: the theme in use then. */
  readonly anchor: number;
  /** How far the choices moved to stay in the window, in pixels. */
  readonly shift: number;
  /** The choice under the pointer, once it moves. */
  readonly pointed?: Theme;
}

/**
 * The header's theme button: one round button showing the theme in use.
 * A tap steps to the next theme. A resting mouse or pen (`hoversControl`),
 * or a finger held down, springs it open into all three, with the theme in
 * use staying where it is (unless that would leave the window). A mouse or
 * pen clicks one. A finger slides to one and lifts, and a slide past either
 * end takes the end one; lifting where it started keeps the theme.
 */
export function ThemeSwitch() {
  const { theme } = useSettings();
  const dispatch = useSettingsDispatch();
  const { color, shadow } = useTheme().theme.semantic;
  const reducedMotion = useReducedMotion();
  const styles = useNarrowStyles(STYLES);
  const [menu, setMenu] = useState<Menu>();
  const button = useRef<ComponentRef<typeof View>>(null);
  // Where the open choices start and how wide each is, in window coordinates.
  const slots = useRef<{ left: number; size: number }>(undefined);

  const choose = (choice: Theme) => dispatch({ type: 'chosen', choice: { theme: choice } });
  const open = (how: Opened) => {
    const anchor = THEMES.indexOf(theme);
    setMenu({ how, anchor, shift: 0 });
    button.current?.measureInWindow((x, _y, size) => {
      const left = x - anchor * size;
      const right = left + THEMES.length * size;
      const { width } = Dimensions.get('window');
      const shift =
        right + BORDER > width - EDGE
          ? width - EDGE - right - BORDER
          : Math.max(0, EDGE - left + BORDER);
      slots.current = { left: left + shift, size };
      setMenu((shown) => shown && { ...shown, shift });
    });
  };
  const close = () => setMenu(undefined);
  /** The choice open over `pageX`; past either end, the end one. */
  const slotAt = (pageX: number) => {
    if (!slots.current) return undefined;
    const index = Math.floor((pageX - slots.current.left) / slots.current.size);
    return THEMES[Math.min(THEMES.length - 1, Math.max(0, index))];
  };
  const point = (pageX: number) => {
    const pointed = slotAt(pageX);
    // From the latest state, so a move can't reopen what a close just shut.
    if (pointed) setMenu((shown) => shown && { ...shown, pointed });
  };
  // Lit: the choice under the pointer, else the theme in use (whose icon alone is inked).
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
          point(nativeEvent.pageX);
        }
      }}
      onPointerLeave={({ nativeEvent }: PointerEvent) => {
        if (menu?.how === 'hover' && hoversControl(nativeEvent.pointerType)) close();
      }}
      // A held finger keeps the button's touch as it slides over the choices.
      onTouchMove={({ nativeEvent }: GestureResponderEvent) => {
        // React Native Web leaves the touch's position to its touches.
        if (menu?.how === 'hold') point(nativeEvent.touches[0]?.pageX ?? nativeEvent.pageX);
      }}
      onTouchEnd={({ nativeEvent }: GestureResponderEvent) => {
        if (menu?.how !== 'hold') return;
        // Where the finger lifts, which a move's render may not have reached yet.
        const lifted = slotAt(nativeEvent.changedTouches[0]?.pageX ?? nativeEvent.pageX);
        if (lifted && lifted !== theme) choose(lifted);
        close();
      }}
      onTouchCancel={() => {
        if (menu?.how === 'hold') close();
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
          if (!menu) open('hold');
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
            transform: [{ translateX: menu?.shift ?? 0 }],
          },
          // Reanimated CSS transitions, which StyleSheet's types don't know.
          { transitionProperty: ['left', 'width', 'opacity', 'transform'], ...transition },
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
