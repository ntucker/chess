import { AndroidHaptics, performAndroidHapticsAsync } from 'expo-haptics';

/**
 * The moments the app answers with a touch, each with the Android haptic
 * that fits it: the one place that says when the app ticks. Each follows the
 * phone's touch-feedback setting, as Android's own haptics do.
 */
const FEELS = {
  /** The learner's move lands on the board: the lightest tick, since it comes often. */
  moveLanded: AndroidHaptics.Clock_Tick,
  /** A held control opens what it holds (the captures card): the press-and-hold feel. */
  cardHeld: AndroidHaptics.Long_Press,
  /** A tap pins the captures card open. */
  cardPinned: AndroidHaptics.Context_Click,
  /** A swipe or the move pill picks the other page under the board. */
  pageSettled: AndroidHaptics.Gesture_End,
  /** A sheet rises, from its button or a flick up. */
  sheetOpened: AndroidHaptics.Context_Click,
} satisfies Record<string, AndroidHaptics>;

type HapticMoment = keyof typeof FEELS;

/**
 * Answers `moment` with its haptic. Android only, by choice: expo-haptics'
 * web shim buzzes the motor or clicks a hidden switch, neither of them a
 * tick. Back, closing and stepping stay still: the system answers its own
 * Back, and a touch for every step would numb the rest.
 */
export function haptic(moment: HapticMoment) {
  if (process.env.EXPO_OS !== 'android') return;
  // A phone without haptics, or older than the feel (Gesture_End needs Android 11), stays still.
  performAndroidHapticsAsync(FEELS[moment]).catch(() => {});
}
