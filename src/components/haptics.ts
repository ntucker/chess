import { AndroidHaptics, performAndroidHapticsAsync } from 'expo-haptics';

/**
 * A light tick as the learner's move lands on the board, the touch feedback
 * Android apps give for a press that takes effect; it follows the phone's
 * touch-feedback setting. Android only: the web's only haptic is
 * navigator.vibrate, a buzz rather than a tick, so the web stays still.
 */
export function tickMove() {
  if (process.env.EXPO_OS !== 'android') return;
  // A phone without haptics just stays still.
  performAndroidHapticsAsync(AndroidHaptics.Clock_Tick).catch(() => {});
}
