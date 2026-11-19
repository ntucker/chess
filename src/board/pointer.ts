// Hover and press-and-hold on the board, which chessground doesn't report.
// A mouse reports the square under it; a finger or pen reports the square it
// rests on once it has stayed still for HOLD_MS. Moves still belong to
// chessground: a click, a tap or a drag plays as before.

/**
 * Whether a pointer of `pointerType` hovers: a mouse does; a finger or pen
 * only presses. The board and the panels beside it go by the same rule.
 */
export const hovers = (pointerType: string) => pointerType === 'mouse';

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
 * as the button comes up, wherever that is.
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

  const hover = (square: S | null) => {
    if (square === hovered) return;
    hovered = square;
    report.hover(square);
  };
  const endTouch = () => {
    if (!touch) return;
    clearTimeout(touch.timer);
    if (touch.held) report.hold(null);
    touch = undefined;
  };

  const onMove = (event: PointerEvent) => {
    if (hovers(event.pointerType)) {
      if (event.buttons === 0 && !pressing) hover(squareAt(event.clientX, event.clientY) ?? null);
    } else if (touch?.id === event.pointerId && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > HOLD_SLOP) {
      // A finger that wanders is dragging; once it has held, this changes nothing.
      clearTimeout(touch.timer);
    }
  };
  const onDown = (event: PointerEvent) => {
    if (hovers(event.pointerType)) {
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
    if (hovers(event.pointerType)) {
      if (!pressing) return;
      pressing = false;
      hover(squareAt(event.clientX, event.clientY) ?? null);
    } else if (touch && event.pointerId === touch.id) {
      endTouch();
    }
  };
  const onLeave = (event: PointerEvent) => {
    if (hovers(event.pointerType) && !pressing) hover(null);
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
    // A held finger's release goes out, so whoever listens isn't left holding.
    endTouch();
  };
}
