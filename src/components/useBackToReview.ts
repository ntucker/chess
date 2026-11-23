import { useRoute } from 'expo-router';
import { useNavigationState } from 'expo-router/react-navigation';

import type { Destination } from '@/components/PlaceLink';
import type { ReviewAddress } from '@/review/address';

/** A route of the root stack, as far as its name and, for the review, its address. */
interface Route {
  readonly key: string;
  readonly name: string;
  readonly params?: ReviewAddress;
}

/**
 * The header's back button for a game page that "Play on from here" pushed
 * over the review: back to the review, as the learner left it. Undefined
 * for a page with no review right under it, such as one opened from a link
 * or reloaded. Call it from the page's route or its layout, whose route sits
 * in the root stack.
 */
export function useBackToReview(): Destination | undefined {
  const { key } = useRoute();
  const below = useNavigationState(({ routes }: { routes: readonly Route[] }) => {
    const at = routes.findIndex((route) => route.key === key);
    return at > 0 ? routes[at - 1] : undefined;
  });
  if (below?.name !== 'review') return undefined;
  return {
    href: { pathname: '/review', params: { ...below.params } },
    label: 'Back to the review',
  };
}
