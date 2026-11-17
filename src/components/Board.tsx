'use dom';

// Chessground draws the board with the DOM, so on iOS and Android this file
// runs in a web view (an Expo DOM component); on the web it renders inline.
// Props cross that boundary as JSON, and onMove becomes an async message.
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.brown.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import './Board.css';

import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Config } from '@lichess-org/chessground/config';
import type { Key } from '@lichess-org/chessground/types';
import type { DOMProps } from 'expo/dom';
import { useEffect, useEffectEvent, useRef } from 'react';

import type { Color } from '@/game/replay';

export interface BoardProps {
  readonly fen: string;
  readonly orientation: Color;
  readonly turnColor: Color;
  /** Whose pieces can be moved; none while it's not the player's turn. */
  readonly movableColor?: Color;
  /** Legal destinations by origin square. */
  readonly dests: Record<string, string[]>;
  readonly lastMove?: readonly [string, string];
  readonly check: boolean;
  readonly onMove: (from: string, to: string) => void;
  readonly dom?: DOMProps;
}

export default function Board({
  fen,
  orientation,
  turnColor,
  movableColor,
  dests,
  lastMove,
  check,
  onMove,
}: BoardProps) {
  const element = useRef<HTMLDivElement>(null);
  const api = useRef<Api>(null);
  // Chessground keeps the callbacks it was created with.
  const handleMove = useEffectEvent((from: string, to: string) => onMove(from, to));

  const config: Config = {
    fen,
    orientation,
    turnColor,
    check,
    lastMove: lastMove ? [...(lastMove as [Key, Key])] : undefined,
    movable: {
      free: false,
      color: movableColor,
      dests: new Map(Object.entries(dests)) as Map<Key, Key[]>,
      showDests: true,
    },
  };

  useEffect(() => {
    if (!element.current) return;
    const board = Chessground(element.current, {
      ...config,
      premovable: { enabled: false },
      movable: {
        ...config.movable,
        events: { after: (from, to) => handleMove(from, to) },
      },
    });
    api.current = board;
    return () => {
      board.destroy();
      api.current = null;
    };
    // Created once; the effect below keeps it in step with the props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.current?.set(config);
  });

  return (
    // Square by its width, since the web view's page has no height to fill.
    <div style={{ width: '100%', aspectRatio: '1 / 1', touchAction: 'none' }}>
      <div ref={element} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
