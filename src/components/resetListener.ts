/**
 * An `AsyncBoundary` `listen` that resets the boundary as soon as it is
 * attached. The boundary attaches its listener again whenever the function
 * changes, so a new one per input (`useMemo` on them) clears an error left
 * by the last input. It ignores its arguments: taking them only makes each
 * input's listener a distinct function.
 *
 * ```tsx
 * <AsyncBoundary listen={useMemo(() => resetListener(position), [position])}>
 * ```
 */
export const resetListener =
  (..._inputs: unknown[]) =>
  (reset: () => void) => {
    reset();
    return () => {};
  };
