import Ionicons from '@expo/vector-icons/Ionicons';
import { a11yState, Pressable, useReducedMotion, useTheme } from '@reactive/silk-native';
import { type ComponentProps, type ComponentRef, useRef, useState } from 'react';
import { type GestureResponderEvent, type PointerEvent, View } from 'react-native';
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
/** How long a finger rests on the button before the choices open under it: Android's long press. */
const HOLD_MS = 400;
const MOTION = springMotion(springs.snappy);

/** How the choices were opened: a mouse or pen resting on the button, or a finger held on it. */
type Opened = 'hover' | 'hold';

/**
 * The header's theme button: one round button showing the theme in use.
 * A tap steps to the next theme. A resting mouse or pen (`hoversControl`),
 * or a finger held down, springs the button open into all three, leftward;
 * a mouse or pen clicks one, and a finger slides to one and lifts.
 */
export function ThemeSwitch() {
  const { theme } = useSettings();
  const dispatch = useSettingsDispatch();
  const { color, shadow } = useTheme().theme.semantic;
  const reducedMotion = useReducedMotion();
  const styles = useNarrowStyles(STYLES);
  // While open: how, and the choice under the pointer once it moves.
  const [menu, setMenu] = useState<{ how: Opened; pointed?: Theme }>();
  const button = useRef<ComponentRef<typeof View>>(null);
  // Where the open choices start and how wide each is, in window coordinates.
  const slots = useRef<{ left: number; size: number }>(undefined);

  const choose = (choice: Theme) => dispatch({ type: 'chosen', choice: { theme: choice } });
  const open = (how: Opened) => {
    setMenu({ how });
    button.current?.measureInWindow((x, _y, size) => {
      slots.current = { left: x + size - THEMES.length * size, size };
    });
  };
  const close = () => setMenu(undefined);
  const point = (pageX: number) => {
    if (!slots.current || !menu) return;
    const index = Math.floor((pageX - slots.current.left) / slots.current.size);
    setMenu({ ...menu, pointed: THEMES[Math.min(THEMES.length - 1, Math.max(0, index))] });
  };
  // Lit: the choice under the pointer, else the theme in use (whose icon alone is inked).
  const lit = menu?.pointed ?? theme;
  const { label, icon } = CHOICES[theme];

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
      onTouchEnd={() => {
        if (menu?.how !== 'hold') return;
        if (menu.pointed && menu.pointed !== theme) choose(menu.pointed);
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
          styles.choices,
          menu ? styles.open : styles.shut,
          {
            backgroundColor: color.surfaceRaised,
            borderColor: color.borderSubtle,
            shadowOpacity: menu ? shadow.raised.opacity : 0,
          },
          // A Reanimated CSS transition, which StyleSheet's types don't know.
          {
            transitionProperty: ['width', 'opacity'],
            transitionDuration: reducedMotion ? 0 : MOTION.durationMs,
            transitionTimingFunction: timingFunction(MOTION.easing),
          },
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
            style={[styles.slot, choice === lit && { backgroundColor: color.tones.neutral.subtle }]}
          >
            <Ionicons
              name={CHOICES[choice].icon}
              size={ICON_SIZE}
              color={choice === theme ? color.textPrimary : color.textSecondary}
            />
          </Pressable>
        ))}
      </Animated.View>
    </View>
  );
}

const STYLES = narrowStyles((px) => ({
  // A held finger slides over the choices rather than scrolling the page.
  root: {
    width: px(HEADER_BUTTON_SIZE),
    height: px(HEADER_BUTTON_SIZE),
    zIndex: 1,
    ...(process.env.EXPO_OS === 'web' ? { touchAction: 'none' as const } : {}),
  },
  slot: {
    width: px(HEADER_BUTTON_SIZE),
    height: px(HEADER_BUTTON_SIZE),
    flexShrink: 0,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Over the button, growing leftward from its right edge.
  choices: {
    position: 'absolute',
    top: 0,
    right: 0,
    height: px(HEADER_BUTTON_SIZE),
    flexDirection: 'row',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderRadius: 999,
    borderWidth: 1,
    shadowColor: '#000',
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  open: { width: px(HEADER_BUTTON_SIZE.times(THEMES.length)), opacity: 1 },
  shut: { width: px(HEADER_BUTTON_SIZE), opacity: 0 },
}));
