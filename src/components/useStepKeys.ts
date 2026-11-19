import { useIsFocused } from "expo-router";
import { useEffect, useEffectEvent } from "react";

/**
 * On the web, the arrow keys step through the moves (Home and End jump to
 * the first and latest), while this screen is in front: a screen left
 * underneath stays mounted, so it must stop listening.
 */
export function useStepKeys(
  ply: number,
  total: number,
  goto: (ply: number) => void,
) {
  const focused = useIsFocused();
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    const targets: Record<string, number> = {
      ArrowLeft: ply - 1,
      ArrowRight: ply + 1,
      Home: 0,
      End: total,
    };
    if (Object.hasOwn(targets, event.key)) {
      event.preventDefault();
      goto(targets[event.key]);
    }
  });
  useEffect(() => {
    if (process.env.EXPO_OS !== "web" || !focused) return;
    const listener = (event: KeyboardEvent) => onKey(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [focused]);
}
