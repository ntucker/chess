import { useLocalSearchParams } from 'expo-router';

import { ReviewPage } from '@/components/review/ReviewPage';

type Param = string | string[] | undefined;

/** A repeated parameter (`?side=black&side=white`) reads as its first. */
const first = (value: Param) => (Array.isArray(value) ? value[0] : value);

/** A finished game reviewed move by move, at `/review?moves=…&side=…&lesson=…`. */
export default function ReviewRoute() {
  const { moves, side, lesson } = useLocalSearchParams<{
    moves?: string | string[];
    side?: string | string[];
    lesson?: string | string[];
  }>();
  return <ReviewPage moves={first(moves)} side={first(side)} lesson={first(lesson)} />;
}
