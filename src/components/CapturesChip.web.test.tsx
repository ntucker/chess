// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { captures, type Captures } from '@/game/material';
import { type Color, replay } from '@/game/replay';
import { themes } from '@/theme/theme';

import { CapturesChip, standing } from './CapturesChip';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The captures after all of `line`. */
const after = (line: readonly string[]) => captures(replay(line), line.length);

/** 1. e4 d5 2. exd5: White is a pawn up. */
const PAWN_UP = after(['e2e4', 'd7d5', 'e4d5']);
/** 1. e4 d5 2. exd5 Qxd5: a pawn each. */
const TRADED = after(['e2e4', 'd7d5', 'e4d5', 'd8d5']);

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const show = (shown: Captures, color: Color) =>
  act(() =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <CapturesChip captures={shown} color={color} />
      </SilkProvider>,
    ),
  );
const chip = () => host.querySelector<HTMLElement>('[role="button"]');
const card = () => document.querySelector<HTMLElement>('[role="dialog"]');

describe('CapturesChip', () => {
  it("shows the side ahead its lead and the piece it's up, and the other side nothing", () => {
    show(PAWN_UP, 'white');
    expect(chip()!.textContent).toBe('+1');
    expect(chip()!.getAttribute('aria-label')).toBe('Up a pawn, 1 point ahead');
    show(PAWN_UP, 'black');
    expect(chip()).toBeNull();
  });

  it('shows nothing before a capture, and = once trades leave material even', () => {
    show(after(['e2e4', 'e7e5']), 'white');
    expect(chip()).toBeNull();
    show(TRADED, 'black');
    expect(chip()!.textContent).toBe('=');
    expect(chip()!.getAttribute('aria-label')).toBe('Even material');
  });

  it("pins both sides' full lists on a click, until the next", () => {
    show(TRADED, 'white');
    act(() => chip()!.click());
    expect(card()!.textContent).toContain('White took');
    expect(card()!.textContent).toContain('Black took');
    expect(card()!.textContent).toContain('Level.');
    expect(chip()!.getAttribute('aria-expanded')).toBe('true');
    act(() => chip()!.click());
    expect(card()).toBeNull();
  });

  it('leaves a pinned card closed once the chip has hidden and come back', () => {
    show(PAWN_UP, 'white');
    act(() => chip()!.click());
    show(after(['e2e4']), 'white');
    expect(chip()).toBeNull();
    show(PAWN_UP, 'white');
    expect(card()).toBeNull();
  });

  // jsdom has no PointerEvent, so React Native Web hovers by mouse events.
  it('peeks at the lists under a resting mouse, and a click there pins them', () => {
    show(PAWN_UP, 'white');
    act(() => {
      chip()!.dispatchEvent(new MouseEvent('mouseenter'));
    });
    expect(card()).not.toBeNull();
    act(() => {
      chip()!.dispatchEvent(new MouseEvent('mouseleave'));
    });
    expect(card()).toBeNull();
    act(() => {
      chip()!.dispatchEvent(new MouseEvent('mouseenter'));
    });
    // A click's own mouse-up doesn't end the peek before the click pins it.
    act(() => {
      chip()!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    act(() => {
      chip()!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    expect(card()).not.toBeNull();
    act(() => chip()!.click());
    // Focus moves to the layer holding the card, as on a pin without a peek.
    expect(document.activeElement!.contains(card())).toBe(true);
    act(() => {
      chip()!.dispatchEvent(new MouseEvent('mouseleave'));
    });
    expect(card()).not.toBeNull();
  });

  it('keeps a held peek open while the mouse leaves, until let go', () => {
    jest.useFakeTimers();
    show(PAWN_UP, 'white');
    act(() => {
      chip()!.dispatchEvent(new MouseEvent('mouseenter'));
    });
    act(() => {
      chip()!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    act(() => {
      chip()!.dispatchEvent(new MouseEvent('mouseleave'));
    });
    expect(card()).not.toBeNull();
    act(() => {
      chip()!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    expect(card()).toBeNull();
    jest.useRealTimers();
  });
});

describe('standing', () => {
  it('says who is ahead, by how much, and the trade', () => {
    expect(standing(PAWN_UP)).toBe('White is 1 point up: a pawn.');
    // 1. e4 d5 2. exd5 Nf6 3. c4 Nxd5?? 4. cxd5: the pawns traded cancel out.
    expect(standing(after(['e2e4', 'd7d5', 'e4d5', 'g8f6', 'c2c4', 'f6d5', 'c4d5']))).toBe(
      'White is 3 points up: a knight.',
    );
    // 1. e4 d5 2. exd5 Qxd5 3. Nc3 Qxa2 4. Rxa2: the queen for a pawn, once a pair cancels.
    expect(standing(after(['e2e4', 'd7d5', 'e4d5', 'd8d5', 'b1c3', 'd5a2', 'a1a2']))).toBe(
      'White is 8 points up: a queen for a pawn.',
    );
  });

  it('says level when the points are, with any trade', () => {
    expect(standing(TRADED)).toBe('Level.');
  });
});
