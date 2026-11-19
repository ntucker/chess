// What the pointer does on the board that chessground doesn't report: where
// a piece being dragged is over. Moves still belong to chessground; nothing
// on the board responds to a pointer that only passes over it.

/**
 * Whether a pointer of `pointerType` hovers: a mouse does; a finger or pen
 * only presses. The panels beside the board go by this rule.
 */
export const hovers = (pointerType: string) => pointerType === 'mouse';

/** A piece being dragged from `from`, over `to`. */
export interface Drag<S extends string> {
  readonly from: S;
  readonly to: S;
}

/** Where pointer events come from: the page the board is on. */
type PointerSource = Pick<GlobalEventHandlers, 'addEventListener' | 'removeEventListener'>;

/**
 * Reports each square a dragged piece is over, as `{ from, to }`, and null
 * once it is back over its own square, off the board, or dropped. `dragged`
 * is the square of the piece being dragged, if one is; `squareAt` finds a
 * square by screen position. Returns a function that stops. Example:
 * dragging the c7 pawn over c6, then c5, then dropping it reports c7-c6,
 * c7-c5, then null.
 */
export function watchDrag<S extends string>(
  page: PointerSource,
  dragged: () => S | undefined,
  squareAt: (x: number, y: number) => S | undefined,
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
    show(from && to && to !== from ? { from, to } : null);
  };
  const onUp = ({ isPrimary }: PointerEvent) => {
    if (isPrimary) show(null);
  };

  page.addEventListener('pointermove', onMove);
  page.addEventListener('pointerup', onUp);
  page.addEventListener('pointercancel', onUp);
  return () => {
    page.removeEventListener('pointermove', onMove);
    page.removeEventListener('pointerup', onUp);
    page.removeEventListener('pointercancel', onUp);
    // A drag in progress ends, so whoever listens isn't left showing it.
    show(null);
  };
}
