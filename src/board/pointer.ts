// What the pointer does on the board that chessground doesn't report: where
// a piece being dragged is over. Moves still belong to chessground, and a
// pointer that only passes over the board reports nothing.

/**
 * Whether a pointer of `pointerType` hovers: a mouse does; a finger or pen
 * only presses. The panels beside the board go by this rule.
 */
export const hovers = (pointerType: string) => pointerType === 'mouse';

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
  plays: (drag: Drag<S>) => boolean,
  report: (drag: Drag<S> | null) => void,
): () => void {
  let over: Drag<S> | null = null;
  const show = (next: Drag<S> | null) => {
    if (next?.from === over?.from && next?.to === over?.to) return;
    over = next;
    report(next);
  };
  const onMove = ({ isPrimary, clientX, clientY }: PointerEvent) => {
    // Chessground drags with one finger; a second one moves nothing.
    if (!isPrimary) return;
    const from = dragged();
    const to = from && squareAt(clientX, clientY);
    show(from ? { from, to: to === from ? undefined : to } : null);
  };
  const onUp = ({ isPrimary }: PointerEvent) => {
    if (!isPrimary) return;
    if (over?.to && plays(over)) over = null;
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
