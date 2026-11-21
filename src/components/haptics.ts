import { AndroidHaptics, performAndroidHapticsAsync } from 'expo-haptics';

/**
 * A light tick as the learner's move lands on the board, the touch feedback
 * Android apps give for a press that takes effect; it follows the phone's
 * touch-feedback setting. Android only, by choice: expo-haptics' web shim
 * buzzes the motor or clicks a hidden switch, neither of them a tick.
 */
export function tickMove() {
  if (process.env.EXPO_OS !== 'android') return;
  // A phone without haptics just stays still.
  performAndroidHapticsAsync(AndroidHaptics.Clock_Tick).catch(() => {});
}
