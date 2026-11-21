import { useLocalSearchParams } from 'expo-router';

import { type ReviewAddress, ReviewPage } from '@/components/review/ReviewPage';

/** A finished game reviewed move by move, at `/review?moves=…&side=…&lesson=…`. */
export default function ReviewRoute() {
  return <ReviewPage {...useLocalSearchParams<ReviewAddress & Record<string, string>>()} />;
}
