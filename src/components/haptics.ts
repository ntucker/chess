import { AndroidHaptics, performAndroidHapticsAsync } from 'expo-haptics';

/**
 * A light tick as the learner's move lands on the board, the touch feedback
 * Android apps give for a press that takes effect; it follows the phone's
 * touch-feedback setting. Android only, by choice: expo-haptics' web shim
 * buzzes the motor or clicks a hidden switch, neither of them a tick.
 */
export function tickMove() {
  tick(AndroidHaptics.Clock_Tick);
}

/** The press-and-hold feel, as a held control opens what it holds (the captures card). */
export function tickHold() {
  tick(AndroidHaptics.Long_Press);
}

function tick(feel: AndroidHaptics) {
  if (process.env.EXPO_OS !== 'android') return;
  // A phone without haptics just stays still.
  performAndroidHapticsAsync(feel).catch(() => {});
}
