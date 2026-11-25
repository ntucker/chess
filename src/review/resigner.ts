import type { Color, Position } from '@/game/replay';

/**
 * Who resigns when a game is reviewed with `latest` as its last position: a
 * game reviewed before it ends counts as resigned by the side to move. None
 * once it has ended. Example: reviewed after 1.e4, Black resigns.
 */
export const resigner = ({ result, turn }: Pick<Position, 'result' | 'turn'>): Color | undefined =>
  result ? undefined : turn;
