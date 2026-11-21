// Which pointers hover, and what the pointer does on the board that
// chessground doesn't report: where a piece being dragged is over, and a
// mouse coming onto the board or a finger tapping it. Moves still belong to
// chessground.

/**
 * Whether a pointer of `pointerType` hovers: a mouse does; a finger or pen
 * only presses. The panels beside the board go by this rule; a control
 * goes by `hoversControl`, which counts a pen.
 */
export const hovers = (pointerType: string) => pointerType === 'mouse';

/**
 * Whether a pointer of `pointerType` hovers a control: anything but a finger,
 * whose pointer leaves as it lifts. React Native Web's Pressable goes by this
 * rule, so a popup that a Pressable opens on hover goes by it too: a pen that
 * opens it by hovering the Pressable then holds it open by hovering the popup.
 */
export const hoversControl = (pointerType: string) => pointerType !== 'touch';

/** A piece being dragged from `from`, over `to`: absent over its own square or off the board. */
export interface Drag<S extends string> {
  readonly from: S;
  readonly to?: S;
}

/** Where pointer events come from: the page the board is on. */
type PointerSource = Pick<GlobalEventHandlers, 'addEventListener' | 'removeEventListener'>;

/**
 * Reports each square a dragged piece is over, as `{ from, to }`, and null
 * once the drag ends. `dragged` is the square of the piece being dragged, if
 * one is; `squareAt` finds a square by screen position. A drop that `plays`
 * a move reports nothing, since the move's new position takes over from the
 * drag. Returns a function that stops. Example: dragging the c7 pawn over
 * c6, then off the board, then dropping it on c5 reports c7-c6, c7, then
 * nothing more if c7-c5 is a move, or null if it isn't.
 */
export function watchDrag<S extends string>(
  page: PointerSource,
  dragged: () => S | undefined,
  squareAt: (x: number, y: number) => S | undefined,
  plays: (from: S, to: S) => boolean,
  report: (drag: Drag<S> | null) => void,
): () => void {
  let over: Drag<S> | null = null;
  const show = (next: Drag<S> | null) => {
    if (next?.from === over?.from && next?.to === over?.to) return;
    over = next;
    report(next);
  };
  // The square a piece from `from` is over: none over its own square.
  const target = (from: S, { clientX, clientY }: PointerEvent) => {
    const to = squareAt(clientX, clientY);
    return to === from ? undefined : to;
  };
  const onMove = (event: PointerEvent) => {
    // Chessground drags with one finger; a second one moves nothing.
    if (!event.isPrimary) return;
    const from = dragged();
    show(from ? { from, to: target(from, event) } : null);
  };
  // The drop is where the pointer lifts, which a last move may not have reached.
  const onUp = (event: PointerEvent) => {
    if (!event.isPrimary) return;
    const to = over && target(over.from, event);
    if (over && to && plays(over.from, to)) over = null;
    else show(null);
  };
  const onCancel = ({ isPrimary }: PointerEvent) => {
    if (isPrimary) show(null);
  };

  page.addEventListener('pointermove', onMove);
  page.addEventListener('pointerup', onUp);
  page.addEventListener('pointercancel', onCancel);
  return () => {
    page.removeEventListener('pointermove', onMove);
    page.removeEventListener('pointerup', onUp);
    page.removeEventListener('pointercancel', onCancel);
    // A drag in progress ends, so whoever listens isn't left showing it.
    show(null);
  };
}

/**
 * Reports a hovering pointer (a mouse) coming onto `target` (true) and
 * leaving it (false), and calls `tap` as a finger or pen lifts from it.
 * Returns a function that stops. Example: the board's ending card hides while
 * a mouse is over the board, and a tap hides or shows it.
 */
export function watchHoverAndTap(
  target: PointerSource,
  hover: (over: boolean) => void,
  tap: () => void,
): () => void {
  const onEnter = ({ pointerType }: PointerEvent) => {
    if (hovers(pointerType)) hover(true);
  };
  const onLeave = ({ pointerType }: PointerEvent) => {
    if (hovers(pointerType)) hover(false);
  };
  const onUp = ({ pointerType, isPrimary }: PointerEvent) => {
    if (isPrimary && !hovers(pointerType)) tap();
  };
  target.addEventListener('pointerenter', onEnter);
  target.addEventListener('pointerleave', onLeave);
  target.addEventListener('pointerup', onUp);
  return () => {
    target.removeEventListener('pointerenter', onEnter);
    target.removeEventListener('pointerleave', onLeave);
    target.removeEventListener('pointerup', onUp);
  };
}
