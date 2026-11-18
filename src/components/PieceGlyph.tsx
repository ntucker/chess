import type { ReactElement } from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';

import type { MaterialRole } from '@/game/material';

interface Props {
  readonly role: MaterialRole;
  /** The piece's color. */
  readonly ink: string;
  /** The color its outline and inner lines are cut in: whatever is behind it. */
  readonly cut: string;
  readonly size: number;
}

/**
 * A chess piece drawn in one color, small enough to sit in a line of text.
 * The shapes are the board's own cburnett pieces (by Colin M.L. Burnett, as
 * chessground ships them), with the black set's white detail lines and black
 * outline both cut in the background color, so pieces stay apart where they
 * overlap.
 */
export function PieceGlyph({ role, ink, cut, size }: Props) {
  const Shape = shapes[role];
  return (
    <Svg width={size} height={size} viewBox="0 0 45 45">
      <G
        fill={ink}
        fillRule="evenodd"
        stroke={cut}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Shape cut={cut} />
      </G>
    </Svg>
  );
}

/** Each piece's paths, drawn in the ink and outline its group sets. */
const shapes: Record<MaterialRole, (props: { cut: string }) => ReactElement> = {
  pawn: () => (
    <Path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" />
  ),
  knight: ({ cut }) => (
    <>
      <Path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" />
      <Path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" />
      <Path
        d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0zm5.433-9.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5z"
        fill={cut}
      />
      <Path
        d="M24.55 10.4l-.45 1.45.5.15c3.15 1 5.65 2.49 7.9 6.75S35.75 29.06 35.25 39l-.05.5h2.25l.05-.5c.5-10.06-.88-16.85-3.25-21.34-2.37-4.49-5.79-6.64-9.19-7.16l-.51-.1z"
        fill={cut}
        stroke="none"
      />
    </>
  ),
  bishop: () => (
    <>
      <G strokeLinecap="butt">
        <Path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z" />
        <Path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z" />
        <Path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z" />
      </G>
      <Path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5" fill="none" strokeLinejoin="miter" />
    </>
  ),
  rook: () => (
    <>
      <Path
        d="M9 39h27v-3H9v3zm3.5-7l1.5-2.5h17l1.5 2.5h-20zm-.5 4v-4h21v4H12z"
        strokeLinecap="butt"
      />
      <Path d="M14 29.5v-13h17v13H14z" strokeLinecap="butt" strokeLinejoin="miter" />
      <Path
        d="M14 16.5L11 14h23l-3 2.5H14zM11 14V9h4v2h5V9h5v2h5V9h4v5H11z"
        strokeLinecap="butt"
      />
      <Path
        d="M12 35.5h21m-20-4h19m-18-2h17m-17-13h17M11 14h23"
        fill="none"
        strokeWidth={1}
        strokeLinejoin="miter"
      />
    </>
  ),
  queen: () => (
    <>
      <G stroke="none">
        <Circle cx={6} cy={12} r={2.75} />
        <Circle cx={14} cy={9} r={2.75} />
        <Circle cx={22.5} cy={8} r={2.75} />
        <Circle cx={31} cy={9} r={2.75} />
        <Circle cx={39} cy={12} r={2.75} />
      </G>
      <Path
        d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26z"
        strokeLinecap="butt"
      />
      <Path
        d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z"
        strokeLinecap="butt"
      />
      <Path d="M11 38.5a35 35 1 0 0 23 0" fill="none" strokeLinecap="butt" />
      <Path
        d="M11 29a35 35 1 0 1 23 0m-21.5 2.5h20m-21 3a35 35 1 0 0 22 0m-23 3a35 35 1 0 0 24 0"
        fill="none"
      />
    </>
  ),
};
