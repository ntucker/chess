// Hover and press-and-hold on the board, which chessground doesn't report.
// A mouse reports the square under it; a finger or pen reports the square it
// rests on once it has stayed still for HOLD_MS. Moves still belong to
// chessground: a click, a tap or a drag plays as before.

/** How long a finger must rest to hold, as Android's long press. */
export const HOLD_MS = 400;
/** How far a finger may wander, in CSS pixels, and still hold. */
export const HOLD_SLOP = 10;

export interface PointerReports<S extends string> {
  /** The square under the mouse, or null once it leaves the board. */
  readonly hover: (square: S | null) => void;
  /** The square a finger holds, or null once it lifts. */
  readonly hold: (square: S | null) => void;
}

/** A finger (or pen) on the board: where it went down, and whether it has held. */
interface Finger {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  timer?: ReturnType<typeof setTimeout>;
  held: boolean;
}

/** Where pointer events come from: the board, or the page around it. */
type PointerSource = Pick<GlobalEventHandlers, 'addEventListener' | 'removeEventListener'>;

/**
 * Reports hovers and holds on `board`, whose squares `squareAt` finds by
 * screen position. Returns a function that stops.
 *
 * While a mouse button is down the hover doesn't change, so a drag never
 * starts or ends a preview halfway; the square under the mouse is reported
 * just after the button comes up, wherever that is.
 */
export function watchPointer<S extends string>(
  board: PointerSource,
  page: PointerSource,
  squareAt: (x: number, y: number) => S | undefined,
  report: PointerReports<S>,
): () => void {
  let hovered: S | null = null;
  let pressing = false;
  let touch: Finger | undefined;
  // Reports on release wait a turn, until chessground has handled the same
  // release (its mouseup and touchend come after pointerup): a preview that
  // starts or ends at once would change the position under a piece being
  // dropped, and chessground would refuse the move.
  const pending = new Set<ReturnType<typeof setTimeout>>();
  const afterRelease = (send: () => void) => {
    const timer = setTimeout(() => {
      pending.delete(timer);
      send();
    }, 0);
    pending.add(timer);
    return timer;
  };
  // The hover a mouse release will report, which any newer hover replaces.
  let releaseHover: ReturnType<typeof setTimeout> | undefined;

  const hover = (square: S | null) => {
    if (releaseHover !== undefined) {
      clearTimeout(releaseHover);
      pending.delete(releaseHover);
      releaseHover = undefined;
    }
    if (square === hovered) return;
    hovered = square;
    report.hover(square);
  };
  const endTouch = () => {
    if (!touch) return;
    clearTimeout(touch.timer);
    if (touch.held) afterRelease(() => report.hold(null));
    touch = undefined;
  };

  const onMove = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') {
      if (event.buttons === 0 && !pressing) hover(squareAt(event.clientX, event.clientY) ?? null);
    } else if (touch && event.pointerId === touch.id && !touch.held) {
      if (Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > HOLD_SLOP) {
        clearTimeout(touch.timer);
        touch.timer = undefined;
      }
    }
  };
  const onDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') {
      pressing = true;
      return;
    }
    if (!event.isPrimary) return;
    endTouch();
    const square = squareAt(event.clientX, event.clientY);
    if (!square) return;
    const resting: Finger = { id: event.pointerId, x: event.clientX, y: event.clientY, held: false };
    resting.timer = setTimeout(() => {
      resting.held = true;
      report.hold(square);
    }, HOLD_MS);
    touch = resting;
  };
  // Listened for on the page, so a button released off the board counts.
  const onUp = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') {
      if (!pressing) return;
      pressing = false;
      const square = squareAt(event.clientX, event.clientY) ?? null;
      releaseHover = afterRelease(() => {
        releaseHover = undefined;
        hover(square);
      });
    } else if (touch && event.pointerId === touch.id) {
      endTouch();
    }
  };
  const onLeave = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && !pressing) hover(null);
  };

  board.addEventListener('pointermove', onMove);
  board.addEventListener('pointerdown', onDown);
  board.addEventListener('pointerleave', onLeave);
  page.addEventListener('pointerup', onUp);
  page.addEventListener('pointercancel', onUp);
  return () => {
    board.removeEventListener('pointermove', onMove);
    board.removeEventListener('pointerdown', onDown);
    board.removeEventListener('pointerleave', onLeave);
    page.removeEventListener('pointerup', onUp);
    page.removeEventListener('pointercancel', onUp);
    // Reports go out now, not after a turn: whoever listens is being torn down.
    for (const timer of pending) clearTimeout(timer);
    if (touch?.held) report.hold(null);
    clearTimeout(touch?.timer);
    touch = undefined;
  };
}
